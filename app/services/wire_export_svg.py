import io
import cairosvg
from pypdf import PdfWriter, PdfReader
from typing import List, Tuple, Dict
from xml.sax.saxutils import escape
from datetime import datetime
from collections import defaultdict

from app.schemas.wire_export import Graph, Node, Edge, TitleBlock

# --- Constants ---
DPI = 96
MM_PER_INCH = 25.4

def mm_to_px(mm):
    return (mm / MM_PER_INCH) * DPI

# Page dimensions
PAGE_SIZES = {
    "Letter": {"w": 279.4, "h": 215.9},
    "A4": {"w": 297, "h": 210},
    "Legal": {"w": 355.6, "h": 215.9},
    "Tabloid": {"w": 431.8, "h": 279.4},
}
MARGIN_MM = 6.35

# --- Template-based constants ---
SCALE_FACTOR = 0.65
DEV_W_PX = 260 * SCALE_FACTOR
LAB_H_MM = 4.5
LINE_LEN_MM = 12
GAP_MM = 1.0
BLOCK_V_SP_MM = 12
GROUP_H_SP_MM = 20

# Pixel conversions
LAB_H_PX = mm_to_px(LAB_H_MM)
LINE_LEN_PX = mm_to_px(LINE_LEN_MM)
GAP_PX = mm_to_px(GAP_MM)
BLOCK_V_SP_PX = mm_to_px(BLOCK_V_SP_MM)
GROUP_H_SP_PX = mm_to_px(GROUP_H_SP_MM)

# --- label clamp (page-size aware, allows 3 cols when possible) ---
TARGET_COLS = 3
MIN_LABEL_CLAMP_PX = mm_to_px(20)
MAX_LABEL_CLAMP_PX = mm_to_px(65)

def _compute_label_clamp_px(print_w_px: float) -> float:
    col_w = print_w_px / TARGET_COLS
    base = DEV_W_PX + (2 * LINE_LEN_PX) + (2 * GAP_PX)
    remaining = max(0.0, col_w - base) / 2.0
    return max(MIN_LABEL_CLAMP_PX, min(remaining, MAX_LABEL_CLAMP_PX))

def _truncate_to_px(text: str, font_size: float, max_px: float) -> str:
    if not text:
        return ""
    if _estimate_text_width(text, font_size) <= max_px:
        return text
    ell = "…"
    s = text
    while s and _estimate_text_width(s + ell, font_size) > max_px:
        s = s[:-1]
    return (s + ell) if s else ell

# Colors
SHOWREADY_AMBER = "#f59e0b"
SHOWREADY_DARK = "#1f2937"
SHOWREADY_BLACK = "#000000"
SHOWREADY_WHITE = "#ffffff"
ADAPTER_FILL = "#e5e7eb"
COLOR_INPUT = "#10b981"
COLOR_OUTPUT = "#3b82f6"
COLOR_IO = "#8b5cf6"

# Fonts & Layout
FONT_FAMILY = "'Space Mono', 'Ubuntu Mono', monospace"
TITLE_FONT_SIZE = 11 * SCALE_FACTOR
META_FONT_SIZE = 7 * SCALE_FACTOR
PORT_FONT_SIZE = 7 * SCALE_FACTOR
ADAPTER_FONT_SIZE = 5 * SCALE_FACTOR
PORT_LINE_HEIGHT = 18 * SCALE_FACTOR
TITLE_AREA_HEIGHT = 24 * SCALE_FACTOR
HEADER_INTERNAL_HEIGHT = 65 * SCALE_FACTOR
PORT_LIST_PADDING = 12 * SCALE_FACTOR
CORNER_RADIUS = 8 * SCALE_FACTOR
GROUP_HEADER_HEIGHT = 40

# --- Helper Functions ---
def _get_connection_label(edge: Edge, is_for_source: bool, graph: Graph) -> str:
    nodes_by_id = {node.id: node for node in graph.nodes}
    if is_for_source:
        remote_node_id = edge.target
        remote_handle_id = edge.targetHandle
    else:
        remote_node_id = edge.source
        remote_handle_id = edge.sourceHandle

    remote_node = nodes_by_id.get(remote_node_id)
    if not remote_node:
        return "Unknown"

    port_name = remote_handle_id
    if remote_handle_id and remote_node.ports and remote_handle_id in remote_node.ports:
        p_data = remote_node.ports[remote_handle_id]
        if hasattr(p_data, 'name'):
            port_name = p_data.name or port_name
        elif isinstance(p_data, dict):
            port_name = p_data.get('name') or port_name

    return f"{escape(remote_node.deviceNomenclature)}:{escape(port_name)}"

def _estimate_text_width(text: str, font_size: float) -> float:
    return len(text) * font_size * 0.6 + 4

def _generate_rounded_header_path(x, y, w, h, r):
    return f"M {x},{y+h} L {x},{y+r} Q {x},{y} {x+r},{y} L {x+w-r},{y} Q {x+w},{y} {x+w},{y+r} L {x+w},{y+h} L {x},{y+h} Z"

def _generate_chamfered_rect_path(x, y, w, h, c):
    return (f"M {x+c},{y} L {x+w-c},{y} L {x+w},{y+c} L {x+w},{y+h-c} "
            f"L {x+w-c},{y+h} L {x+c},{y+h} L {x},{y+h-c} L {x},{y+c} Z")

def _generate_group_header_svg(text: str, width: float, y: float) -> str:
    return f"""
    <g>
        <rect x="0" y="{y}" width="{width}" height="30" fill="#f3f4f6" rx="4" />
        <text x="10" y="{y + 20}" font-family="{FONT_FAMILY}" font-size="14" font-weight="bold" fill="#1f2937">
            Category: {escape(text)}
        </text>
    </g>
    """

def _generate_device_svg(node: Node, graph: Graph, x_offset: float, y_offset: float, label_clamp_px: float) -> str:
    # --- Port Grouping ---
    ports_by_id = {}
    for handle_id, port_data in node.ports.items():
        port_id = handle_id.split('-')[-1]
        p_name = port_data.name if hasattr(port_data, 'name') else port_data.get('name')
        p_adapter = port_data.adapter_model if hasattr(port_data, 'adapter_model') else port_data.get('adapter_model')

        if port_id not in ports_by_id:
            ports_by_id[port_id] = {'name': p_name, 'adapter': p_adapter, 'in': None, 'out': None}

        if 'in' in handle_id: ports_by_id[port_id]['in'] = handle_id
        if 'out' in handle_id: ports_by_id[port_id]['out'] = handle_id

    input_ports = sorted([p for p in ports_by_id.values() if p['in'] and not p['out']], key=lambda p: p['name'] or '')
    output_ports = sorted([p for p in ports_by_id.values() if p['out'] and not p['in']], key=lambda p: p['name'] or '')
    io_ports = sorted([p for p in ports_by_id.values() if p['in'] and p['out']], key=lambda p: p['name'] or '')

    # --- Height Calculation ---
    total_port_rows = max(len(input_ports), len(output_ports)) + len(io_ports)
    ports_list_height = total_port_rows * PORT_LINE_HEIGHT
    body_height = HEADER_INTERNAL_HEIGHT + ports_list_height + (2 * PORT_LIST_PADDING if total_port_rows > 0 else 0)

    # --- SVG Generation ---
    dev_cx = x_offset + DEV_W_PX / 2
    svg = '<g>'

    header_path = _generate_rounded_header_path(x_offset, y_offset, DEV_W_PX, TITLE_AREA_HEIGHT, CORNER_RADIUS)
    svg += f'<path class="header-box" d="{header_path}"/>'
    svg += f'<text class="t-title" x="{dev_cx}" y="{y_offset + (TITLE_AREA_HEIGHT/2) + 1}">{escape(node.deviceNomenclature)}</text>'

    body_y_offset = y_offset + TITLE_AREA_HEIGHT
    svg += f'<rect class="device-body" x="{x_offset}" y="{body_y_offset}" width="{DEV_W_PX}" height="{body_height}"/>'

    svg += f'<text class="t-meta" x="{dev_cx}" y="{body_y_offset + 18}">{escape(node.modelNumber)}</text>'
    svg += f'<text class="t-meta t-dim" x="{dev_cx}" y="{body_y_offset + 30}">{escape(node.rackName)}.RU{node.deviceRu}</text>'
    if node.ipAddress:
        svg += f'<text class="t-meta t-accent" x="{dev_cx}" y="{body_y_offset + 42}">{escape(node.ipAddress)}</text>'

    meta_separator_y = body_y_offset + HEADER_INTERNAL_HEIGHT
    svg += f'<line class="separator" x1="{x_offset + 10}" y1="{meta_separator_y}" x2="{x_offset + DEV_W_PX - 10}" y2="{meta_separator_y}"/>'

    ports_y_start = meta_separator_y + PORT_LIST_PADDING
    port_meta = {}
    tri_w, tri_h, adpt_h, chamfer = 6, 4, 8, 2

    for i, port_info in enumerate(input_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        current_adpt_w = (_estimate_text_width(port_info['adapter'], ADAPTER_FONT_SIZE) + 8) if port_info.get('adapter') else 0
        port_meta[port_info['in']] = {'y': y_pos, 'adpt_w': current_adpt_w}

        p1, p2, p3 = f"{x_offset},{y_pos - tri_h}", f"{x_offset + tri_w},{y_pos}", f"{x_offset},{y_pos + tri_h}"
        svg += f'<polygon class="port-shape input" points="{p1} {p2} {p3}"/>'
        svg += f'<text class="t-port-aligned" x="{x_offset + 14}" y="{y_pos}">{escape(port_info["name"] or "")}</text>'

        if port_info.get('adapter'):
            ax, ay = x_offset - current_adpt_w, y_pos - (adpt_h / 2)
            adpt_path = _generate_chamfered_rect_path(ax, ay, current_adpt_w, adpt_h, chamfer)
            svg += f'<path d="{adpt_path}" fill="{ADAPTER_FILL}" stroke="{SHOWREADY_BLACK}" stroke-width="1"/>'
            svg += f'<text class="t-adapter" x="{ax + current_adpt_w/2}" y="{y_pos + 1}">{escape(port_info["adapter"])}</text>'

    for i, port_info in enumerate(output_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        current_adpt_w = (_estimate_text_width(port_info['adapter'], ADAPTER_FONT_SIZE) + 8) if port_info.get('adapter') else 0
        port_meta[port_info['out']] = {'y': y_pos, 'adpt_w': current_adpt_w}

        cx = x_offset + DEV_W_PX
        p1, p2, p3 = f"{cx - tri_w},{y_pos - tri_h}", f"{cx},{y_pos}", f"{cx - tri_w},{y_pos + tri_h}"
        svg += f'<polygon class="port-shape output" points="{p1} {p2} {p3}"/>'
        svg += f'<text class="t-port-aligned" x="{x_offset + DEV_W_PX - 14}" y="{y_pos}" text-anchor="end">{escape(port_info["name"] or "")}</text>'

        if port_info.get('adapter'):
            ax, ay = cx, y_pos - (adpt_h / 2)
            adpt_path = _generate_chamfered_rect_path(ax, ay, current_adpt_w, adpt_h, chamfer)
            svg += f'<path d="{adpt_path}" fill="{ADAPTER_FILL}" stroke="{SHOWREADY_BLACK}" stroke-width="1"/>'
            svg += f'<text class="t-adapter" x="{ax + current_adpt_w/2}" y="{y_pos + 1}">{escape(port_info["adapter"])}</text>'

    io_y_start = ports_y_start + (max(len(input_ports), len(output_ports)) * PORT_LINE_HEIGHT)
    for i, port_info in enumerate(io_ports):
        y_pos = io_y_start + (i * PORT_LINE_HEIGHT)
        port_meta[port_info['in']] = {'y': y_pos, 'adpt_w': 0}
        port_meta[port_info['out']] = {'y': y_pos, 'adpt_w': 0}

        gap_w = _estimate_text_width(port_info["name"] or "", PORT_FONT_SIZE) + 10
        svg += f'<line class="port-line" x1="{x_offset + 10}" y1="{y_pos}" x2="{dev_cx - gap_w/2}" y2="{y_pos}"/>'
        svg += f'<line class="port-line" x1="{dev_cx + gap_w/2}" y1="{y_pos}" x2="{x_offset + DEV_W_PX - 10}" y2="{y_pos}"/>'
        svg += f'<circle class="port-shape io" cx="{x_offset}" cy="{y_pos}" r="3"/><circle class="port-shape io" cx="{x_offset + DEV_W_PX}" cy="{y_pos}" r="3"/>'
        svg += f'<text class="t-port" x="{dev_cx}" y="{y_pos}">{escape(port_info["name"] or "")}</text>'

    for edge in graph.edges:
        if edge.target == node.id:
            meta = port_meta.get(edge.targetHandle)
            if meta:
                stub_x = x_offset - meta['adpt_w']
                full = _get_connection_label(edge, False, graph)
                shown = _truncate_to_px(full, PORT_FONT_SIZE-1, label_clamp_px)
                svg += f'<line class="connector" x1="{stub_x - LINE_LEN_PX}" y1="{meta["y"]}" x2="{stub_x}" y2="{meta["y"]}"/>'
                svg += f'<text class="label-text" x="{stub_x - LINE_LEN_PX - GAP_PX}" y="{meta["y"]}" text-anchor="end"><title>{escape(full)}</title>{escape(shown)}</text>'
        elif edge.source == node.id:
            meta = port_meta.get(edge.sourceHandle)
            if meta:
                stub_x = x_offset + DEV_W_PX + meta['adpt_w']
                full = _get_connection_label(edge, True, graph)
                shown = _truncate_to_px(full, PORT_FONT_SIZE-1, label_clamp_px)
                svg += f'<line class="connector" x1="{stub_x}" y1="{meta["y"]}" x2="{stub_x + LINE_LEN_PX}" y2="{meta["y"]}"/>'
                svg += f'<text class="label-text" x="{stub_x + LINE_LEN_PX + GAP_PX}" y="{meta["y"]}" text-anchor="start"><title>{escape(full)}</title>{escape(shown)}</text>'

    svg += '</g>'
    return svg

def _generate_title_block_svg(title_block_data: TitleBlock, page_num: int, total_pages: int, print_w_px: float) -> str:
    """
    Generates the Title Block SVG, scaled to fit the PRINT width (inside margins),
    not the full PAGE width.
    """
    try:
        with open("app/title_block.svg", "r") as f:
            svg_template = f.read()

        replacements = {
            "{{SHOW_NAME}}": title_block_data.show_name or '',
            "{{SHOW_PM}}": title_block_data.show_pm or '',
            "{{SHOW_TD}}": title_block_data.show_td or '',
            "{{SHOW_DESIGNER}}": title_block_data.show_designer or '',
            "{{USERS_FULL_NAME}}": title_block_data.users_full_name or '',
            "{{USERS_PRODUCTION_ROLE}}": title_block_data.users_production_role or '',
            "{{DATE_FILE_GENERATED}}": datetime.now().strftime('%Y-%m-%d'),
            "{{FILE_NAME}}": f"{title_block_data.show_name}-wire-export.pdf",
            "{{SHEET_TITLE}}": title_block_data.sheet_title or 'Wire Diagram',
            "{{PAGE_NUM}}": str(page_num),
            "{{TOTAL_PAGES}}": str(total_pages),
            "{{SHOW_LOGO_HREF}}": f"data:image/png;base64,{title_block_data.show_logo_base64}" if title_block_data.show_logo_base64 else "",
            "{{COMPANY_LOGO_HREF}}": f"data:image/png;base64,{title_block_data.company_logo_base64}" if title_block_data.company_logo_base64 else "",
        }
        for k, v in replacements.items(): svg_template = svg_template.replace(k, escape(str(v)))
        if not title_block_data.show_branding: svg_template = svg_template.replace("Created using ShowReady", "")
        
        # CHANGED: Scale based on print_w_px (content width), not page_w_px
        return f'<g transform="scale({print_w_px / 1916})">{svg_template}</g>'
    except Exception:
        return ""

def _generate_svg_page(content: str, page_w_px: float, page_h_px: float, title_block_svg: str) -> str:
    # CHANGED: Calculate margin pixels here to ensure alignment
    margin_px = mm_to_px(MARGIN_MM)
    
    # Calculate the print width to determine the correct scaled height of the title block
    print_w_px = page_w_px - (2 * margin_px)
    tb_h = 135 * (print_w_px / 1916)

    return f"""
<svg width="{page_w_px}px" height="{page_h_px}px" viewBox="0 0 {page_w_px} {page_h_px}" xmlns="http://www.w3.org/2000/svg">
    <defs><style>
        .header-box {{ fill: {SHOWREADY_DARK}; stroke: {SHOWREADY_BLACK}; stroke-width: 1.5; }}
        .device-body {{ fill: {SHOWREADY_WHITE}; stroke: {SHOWREADY_BLACK}; stroke-width: 1.5; }}
        .connector {{ fill: none; stroke: {SHOWREADY_BLACK}; stroke-width: 1; }}
        .port-shape {{ fill: {SHOWREADY_WHITE}; stroke: {SHOWREADY_BLACK}; stroke-width: 1; }}
        .port-shape.input {{ fill: {COLOR_INPUT}; stroke: none; }}
        .port-shape.output {{ fill: {COLOR_OUTPUT}; stroke: none; }}
        .port-shape.io {{ fill: {COLOR_IO}; stroke: none; }}
        .separator {{ stroke: #e5e7eb; stroke-width: 1; }}
        .port-line {{ stroke: #e5e7eb; stroke-width: 1; stroke-dasharray: 2,2; }}
        .t-title {{ font: 700 {TITLE_FONT_SIZE}pt {FONT_FAMILY},monospace; fill: {SHOWREADY_AMBER}; text-anchor: middle; dominant-baseline: middle; letter-spacing: 0.5px; }}
        .t-meta {{ font: 400 {META_FONT_SIZE}pt {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; text-anchor: middle; }}
        .t-dim {{ fill: #666; }}
        .t-accent {{ fill: {SHOWREADY_AMBER}; font-weight: 700; }}
        .t-port {{ font: 400 {PORT_FONT_SIZE}pt {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; text-anchor: middle; dominant-baseline: middle;}}
        .t-port-aligned {{ font: 400 {PORT_FONT_SIZE}pt {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; dominant-baseline: middle;}}
        .label-text {{ font: 700 {PORT_FONT_SIZE-1}pt {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; dominant-baseline: middle; }}
        .t-adapter {{ font: 700 {ADAPTER_FONT_SIZE}pt {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; text-anchor: middle; dominant-baseline: middle; }}
    </style></defs>
    
    <g transform="translate({margin_px}, {margin_px})">{content}</g>
    
    <g transform="translate({margin_px}, {page_h_px - tb_h - margin_px})">{title_block_svg}</g>
</svg>"""

def _get_node_specs(graph: Graph, label_clamp_px: float) -> List[Dict]:
    node_specs = []
    for node in graph.nodes:
        ports_data = node.ports
        ports_by_id = {}
        for handle_id, port_data in ports_data.items():
            port_id = handle_id.split('-')[-1]
            p_name = port_data.name if hasattr(port_data, 'name') else port_data.get('name')
            p_adapter = port_data.adapter_model if hasattr(port_data, 'adapter_model') else port_data.get('adapter_model')
            if port_id not in ports_by_id:
                ports_by_id[port_id] = {'name': p_name, 'adapter': p_adapter, 'in': None, 'out': None}
            if 'in' in handle_id: ports_by_id[port_id]['in'] = handle_id
            if 'out' in handle_id: ports_by_id[port_id]['out'] = handle_id

        input_ports = [p for p in ports_by_id.values() if p['in'] and not p['out']]
        output_ports = [p for p in ports_by_id.values() if p['out'] and not p['in']]
        io_ports = [p for p in ports_by_id.values() if p['in'] and p['out']]

        total_port_rows = max(len(input_ports), len(output_ports)) + len(io_ports)
        body_height = HEADER_INTERNAL_HEIGHT + (total_port_rows * PORT_LINE_HEIGHT) + (2 * PORT_LIST_PADDING if total_port_rows > 0 else 0)
        total_height = body_height + TITLE_AREA_HEIGHT

        left_labels = [_get_connection_label(e, False, graph) for e in graph.edges if e.target == node.id]
        right_labels = [_get_connection_label(e, True, graph) for e in graph.edges if e.source == node.id]

        max_l_label = min(max([_estimate_text_width(l, PORT_FONT_SIZE) for l in left_labels] or [0]), label_clamp_px)
        max_r_label = min(max([_estimate_text_width(l, PORT_FONT_SIZE) for l in right_labels] or [0]), label_clamp_px)

        max_l_adpt = max([(_estimate_text_width(p['adapter'], ADAPTER_FONT_SIZE) + 8) for p in input_ports if p.get('adapter')] or [0])
        max_r_adpt = max([(_estimate_text_width(p['adapter'], ADAPTER_FONT_SIZE) + 8) for p in output_ports if p.get('adapter')] or [0])

        total_width = (
            max_l_label + GAP_PX + LINE_LEN_PX + max_l_adpt +
            DEV_W_PX +
            max_r_adpt + LINE_LEN_PX + GAP_PX + max_r_label
        )

        node_specs.append({
            "node": node,
            "width": total_width,
            "height": total_height,
            "max_l_label": max_l_label,
            "max_l_adpt": max_l_adpt
        })

    return node_specs

def _get_group_key(node: Node) -> str:
    for attr in ("nomenclature", "deviceTypeNomenclature", "deviceType", "category", "deviceCategory", "type"):
        if hasattr(node, attr):
            val = getattr(node, attr)
            if isinstance(val, str) and val.strip():
                return val.strip()

    dn = (node.deviceNomenclature or "").strip()
    for sep in ("-", "_", " "):
        if sep in dn:
            return dn.split(sep, 1)[0]
    return dn or "Misc / Uncategorized"

def _group_by_nomenclature(node_specs: List[Dict]) -> List[Tuple[str, List[Dict]]]:
    groups = defaultdict(list)
    for spec in node_specs:
        groups[_get_group_key(spec['node'])].append(spec)

    result = []
    for key in sorted(groups.keys()):
        result.append((key, sorted(groups[key], key=lambda s: s['node'].deviceNomenclature or "")))
    return result

def build_pdf_bytes(graph: Graph, page_size: str = "Letter", title_block_data: TitleBlock = None) -> bytes:
    if not graph.nodes:
        return b""

    page_dims = PAGE_SIZES.get(page_size, PAGE_SIZES["Letter"])
    page_w_px = mm_to_px(page_dims["w"])
    page_h_px = mm_to_px(page_dims["h"])
    
    # Recalculate print area dimensions
    print_w_px = page_w_px - (2 * mm_to_px(MARGIN_MM))
    
    # Calculate title block height based on the NEW print width scale
    title_block_height = 135 * (print_w_px / 1916)
    
    # Subtract margins AND title block height from available print height
    print_h_px = page_h_px - (2 * mm_to_px(MARGIN_MM)) - title_block_height

    label_clamp_px = _compute_label_clamp_px(print_w_px)

    node_specs = _get_node_specs(graph, label_clamp_px)
    grouped_specs = _group_by_nomenclature(node_specs)

    pages_content = []
    current_page_svg = ""

    cursor_x = 0.0
    cursor_y = 0.0
    row_max_h = 0.0

    def save_page():
        nonlocal current_page_svg, cursor_x, cursor_y, row_max_h
        if current_page_svg:
            pages_content.append(current_page_svg)
        current_page_svg = ""
        cursor_x = 0.0
        cursor_y = 0.0
        row_max_h = 0.0

    for group_name, specs in grouped_specs:
        if current_page_svg or pages_content:
            save_page()

        current_page_svg += _generate_group_header_svg(group_name, print_w_px, cursor_y)
        cursor_y += GROUP_HEADER_HEIGHT + BLOCK_V_SP_PX

        for spec in specs:
            w = spec['width']
            h = spec['height']

            if cursor_x > 0 and (cursor_x + w > print_w_px):
                cursor_x = 0
                cursor_y += row_max_h + BLOCK_V_SP_PX
                row_max_h = 0

            if cursor_y + h > print_h_px:
                save_page()
                current_page_svg += _generate_group_header_svg(group_name, print_w_px, cursor_y)
                cursor_y += GROUP_HEADER_HEIGHT + BLOCK_V_SP_PX

            x_off = cursor_x + spec['max_l_label'] + GAP_PX + LINE_LEN_PX + spec['max_l_adpt']
            y_off = cursor_y

            current_page_svg += _generate_device_svg(spec['node'], graph, x_off, y_off, label_clamp_px)

            cursor_x += w + GROUP_H_SP_PX
            row_max_h = max(row_max_h, h)

    save_page()

    pdf_writer = PdfWriter()
    total_pages = len(pages_content)
    for i, svg_content in enumerate(pages_content):
        # CHANGED: Pass print_w_px to ensure title block scales correctly
        title_block_svg = _generate_title_block_svg(title_block_data, i + 1, total_pages, print_w_px)
        full_svg = _generate_svg_page(svg_content, page_w_px, page_h_px, title_block_svg)
        pdf_page_bytes = cairosvg.svg2pdf(bytestring=full_svg.encode('utf-8'))
        pdf_reader = PdfReader(io.BytesIO(pdf_page_bytes))
        pdf_writer.add_page(pdf_reader.pages[0])

    with io.BytesIO() as pdf_buffer:
        pdf_writer.write(pdf_buffer)
        pdf_writer.close()
        return pdf_buffer.getvalue()
