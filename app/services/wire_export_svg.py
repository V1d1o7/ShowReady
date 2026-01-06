import io
import re
import cairosvg
from pypdf import PdfWriter, PdfReader
from typing import List, Tuple, Dict
from xml.sax.saxutils import escape
import base64
from datetime import datetime

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
}
MARGIN_MM = 10

# --- Template-based constants ---
SCALE_FACTOR = 0.65
DEV_W_PX = 260 * SCALE_FACTOR
LAB_H_MM = 4.5 
LINE_LEN_MM = 12 # Standard stub length
GAP_MM = 1.0     
BLOCK_V_SP_MM = 12

LAB_H_PX = mm_to_px(LAB_H_MM)
LINE_LEN_PX = mm_to_px(LINE_LEN_MM)
GAP_PX = mm_to_px(GAP_MM)
BLOCK_V_SP_PX = mm_to_px(BLOCK_V_SP_MM)

# Colors - ShowReady Tech Style
SHOWREADY_AMBER = "#f59e0b"
SHOWREADY_DARK = "#1f2937"
SHOWREADY_BLACK = "#000000"
SHOWREADY_WHITE = "#ffffff"
STROKE_COLOR = "#000000"
ADAPTER_FILL = "#e5e7eb" # Light Gray

# Port Colors
COLOR_INPUT = "#10b981"  # Emerald 500
COLOR_OUTPUT = "#3b82f6" # Blue 500
COLOR_IO = "#8b5cf6"     # Violet 500

# Fonts & Layout
FONT_FAMILY = "'Space Mono', 'Ubuntu Mono', monospace"
TITLE_FONT_SIZE = 11 * SCALE_FACTOR
META_FONT_SIZE = 7 * SCALE_FACTOR
PORT_FONT_SIZE = 7 * SCALE_FACTOR
ADAPTER_FONT_SIZE = 5 * SCALE_FACTOR # Smaller font for adapters
PORT_LINE_HEIGHT = 18 * SCALE_FACTOR
TITLE_AREA_HEIGHT = 24 * SCALE_FACTOR 
HEADER_INTERNAL_HEIGHT = 65 * SCALE_FACTOR
PORT_LIST_PADDING = 12 * SCALE_FACTOR
CORNER_RADIUS = 8 * SCALE_FACTOR 

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
    if not remote_node: return "Unknown"

    port_name = remote_handle_id
    if remote_handle_id and remote_node.ports and remote_handle_id in remote_node.ports:
        # Check if port data is object or dict (Pydantic handling)
        p_data = remote_node.ports[remote_handle_id]
        if hasattr(p_data, 'name'):
            port_name = p_data.name or port_name
        elif isinstance(p_data, dict):
            port_name = p_data.get('name') or port_name

    # Format: DEVICE:PORT
    return f"{escape(remote_node.deviceNomenclature)}:{escape(port_name)}"

def _estimate_text_width(text: str, font_size: float) -> float:
    # Space Mono is monospaced, approx width ratio ~0.6 of font size per char
    return len(text) * font_size * 0.6 + 4

def _generate_rounded_header_path(x, y, w, h, r):
    """Generates a path for a rectangle with rounded top corners only."""
    path = f"M {x},{y+h}"         # Start Bottom-Left
    path += f" L {x},{y+r}"       # Line up to curve start
    path += f" Q {x},{y} {x+r},{y}" # Top-Left Curve
    path += f" L {x+w-r},{y}"     # Top Edge
    path += f" Q {x+w},{y} {x+w},{y+r}" # Top-Right Curve
    path += f" L {x+w},{y+h}"     # Right Edge
    path += f" L {x},{y+h} Z"     # Close Bottom
    return path

def _generate_chamfered_rect_path(x, y, w, h, c):
    """Generates a path for a rectangle with cut (chamfered) corners."""
    # c = chamfer size
    return (f"M {x+c},{y} "
            f"L {x+w-c},{y} "
            f"L {x+w},{y+c} "
            f"L {x+w},{y+h-c} "
            f"L {x+w-c},{y+h} "
            f"L {x+c},{y+h} "
            f"L {x},{y+h-c} "
            f"L {x},{y+c} "
            f"Z")

def _generate_device_svg(node: Node, graph: Graph, x_offset: float, y_offset: float) -> Tuple[str, float]:
    # --- Port Grouping ---
    ports_by_id = {}
    for handle_id, port_data in node.ports.items():
        port_id = handle_id.split('-')[-1]
        
        # Handle Pydantic model vs Dict access safely
        p_name = port_data.name if hasattr(port_data, 'name') else port_data.get('name')
        p_adapter = port_data.adapter_model if hasattr(port_data, 'adapter_model') else port_data.get('adapter_model')

        if port_id not in ports_by_id:
            ports_by_id[port_id] = {
                'name': p_name, 
                'adapter': p_adapter,
                'in': None, 
                'out': None
            }
        
        if 'in' in handle_id:
            ports_by_id[port_id]['in'] = handle_id
        if 'out' in handle_id:
            ports_by_id[port_id]['out'] = handle_id

    input_ports = sorted([p for p in ports_by_id.values() if p['in'] and not p['out']], key=lambda p: p['name'] or '')
    output_ports = sorted([p for p in ports_by_id.values() if p['out'] and not p['in']], key=lambda p: p['name'] or '')
    io_ports = sorted([p for p in ports_by_id.values() if p['in'] and p['out']], key=lambda p: p['name'] or '')

    # --- Height Calculation ---
    num_in_out_rows = max(len(input_ports), len(output_ports))
    num_io_rows = len(io_ports)
    total_port_rows = num_in_out_rows + num_io_rows
    ports_list_height = total_port_rows * PORT_LINE_HEIGHT
    
    body_height = HEADER_INTERNAL_HEIGHT + ports_list_height + (2 * PORT_LIST_PADDING if total_port_rows > 0 else 0)
    total_block_height = body_height + TITLE_AREA_HEIGHT

    # --- SVG Generation ---
    dev_cx = x_offset + DEV_W_PX / 2
    svg = f'<g>'

    # 1. Device Header
    header_path = _generate_rounded_header_path(x_offset, y_offset, DEV_W_PX, TITLE_AREA_HEIGHT, CORNER_RADIUS)
    svg += f'<path class="header-box" d="{header_path}"/>'
    svg += f'<text class="t-title" x="{dev_cx}" y="{y_offset + (TITLE_AREA_HEIGHT/2) + 1}">{escape(node.deviceNomenclature)}</text>'

    # 2. Device Body
    body_y_offset = y_offset + TITLE_AREA_HEIGHT
    svg += f'<rect class="device-body" x="{x_offset}" y="{body_y_offset}" width="{DEV_W_PX}" height="{body_height}"/>'

    # 3. Metadata
    svg += f'<text class="t-meta" x="{dev_cx}" y="{body_y_offset + 18}">{escape(node.modelNumber)}</text>'
    svg += f'<text class="t-meta t-dim" x="{dev_cx}" y="{body_y_offset + 30}">{escape(node.rackName)}.RU{node.deviceRu}</text>'
    if node.ipAddress:
        svg += f'<text class="t-meta t-accent" x="{dev_cx}" y="{body_y_offset + 42}">{escape(node.ipAddress)}</text>'

    # Separator
    meta_separator_y = body_y_offset + HEADER_INTERNAL_HEIGHT
    svg += f'<line class="separator" x1="{x_offset + 10}" y1="{meta_separator_y}" x2="{x_offset + DEV_W_PX - 10}" y2="{meta_separator_y}"/>'

    ports_y_start = meta_separator_y + PORT_LIST_PADDING
    
    # Store where each port is vertically so we can draw lines later
    # Store (y_mid, adapter_width_for_this_port)
    port_meta = {} 

    # Graphic Constants
    tri_w = 6
    tri_h = 4
    
    # Reduced adapter height to prevent clashing with neighboring ports
    adpt_h = 8 
    chamfer = 2 

    # --- Draw input ports (Left Side) ---
    for i, port_info in enumerate(input_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        
        # Calculate adapter width if present
        current_adpt_w = 0
        if port_info.get('adapter'):
            current_adpt_w = _estimate_text_width(port_info['adapter'], ADAPTER_FONT_SIZE) + 8 # Padding
        
        port_meta[port_info['in']] = {'y': y_pos, 'adpt_w': current_adpt_w}
        
        # Port Shape (Triangle IN)
        p1 = f"{x_offset},{y_pos - tri_h}"
        p2 = f"{x_offset + tri_w},{y_pos}"
        p3 = f"{x_offset},{y_pos + tri_h}"
        svg += f'<polygon class="port-shape input" points="{p1} {p2} {p3}"/>'
        
        svg += f'<text class="t-port-aligned" x="{x_offset + 14}" y="{y_pos}">{escape(port_info["name"] or "")}</text>'
        
        # Render Adapter
        if port_info.get('adapter'):
            ax = x_offset - current_adpt_w
            ay = y_pos - (adpt_h / 2)
            
            # Chamfered Path
            adpt_path = _generate_chamfered_rect_path(ax, ay, current_adpt_w, adpt_h, chamfer)
            svg += f'<path d="{adpt_path}" fill="{ADAPTER_FILL}" stroke="{SHOWREADY_BLACK}" stroke-width="1"/>'
            
            # Text
            svg += f'<text class="t-adapter" x="{ax + current_adpt_w/2}" y="{y_pos + 1}">{escape(port_info["adapter"])}</text>'

    # --- Draw output ports (Right Side) ---
    for i, port_info in enumerate(output_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        
        current_adpt_w = 0
        if port_info.get('adapter'):
            current_adpt_w = _estimate_text_width(port_info['adapter'], ADAPTER_FONT_SIZE) + 8
            
        port_meta[port_info['out']] = {'y': y_pos, 'adpt_w': current_adpt_w}
        
        # Port Shape (Triangle OUT)
        cx = x_offset + DEV_W_PX
        p1 = f"{cx - tri_w},{y_pos - tri_h}"
        p2 = f"{cx},{y_pos}"
        p3 = f"{cx - tri_w},{y_pos + tri_h}"
        svg += f'<polygon class="port-shape output" points="{p1} {p2} {p3}"/>'
        
        svg += f'<text class="t-port-aligned" x="{x_offset + DEV_W_PX - 14}" y="{y_pos}" text-anchor="end">{escape(port_info["name"] or "")}</text>'

        # Render Adapter
        if port_info.get('adapter'):
            ax = cx
            ay = y_pos - (adpt_h / 2)
            
            adpt_path = _generate_chamfered_rect_path(ax, ay, current_adpt_w, adpt_h, chamfer)
            svg += f'<path d="{adpt_path}" fill="{ADAPTER_FILL}" stroke="{SHOWREADY_BLACK}" stroke-width="1"/>'
            
            svg += f'<text class="t-adapter" x="{ax + current_adpt_w/2}" y="{y_pos + 1}">{escape(port_info["adapter"])}</text>'

    # --- Draw IO ports (Both Sides) ---
    io_y_start = ports_y_start + (num_in_out_rows * PORT_LINE_HEIGHT)
    for i, port_info in enumerate(io_ports):
        y_pos = io_y_start + (i * PORT_LINE_HEIGHT)
        port_meta[port_info['in']] = {'y': y_pos, 'adpt_w': 0}
        port_meta[port_info['out']] = {'y': y_pos, 'adpt_w': 0}
        
        text_width = _estimate_text_width(port_info["name"] or "", PORT_FONT_SIZE)
        gap_width = text_width + 10
        text_start_x = dev_cx - (gap_width / 2)
        text_end_x = dev_cx + (gap_width / 2)
        
        svg += f'<line class="port-line" x1="{x_offset + 10}" y1="{y_pos}" x2="{text_start_x}" y2="{y_pos}"/>'
        svg += f'<line class="port-line" x1="{text_end_x}" y1="{y_pos}" x2="{x_offset + DEV_W_PX - 10}" y2="{y_pos}"/>'

        circ_r = 3
        svg += f'<circle class="port-shape io" cx="{x_offset}" cy="{y_pos}" r="{circ_r}"/>'
        svg += f'<circle class="port-shape io" cx="{x_offset + DEV_W_PX}" cy="{y_pos}" r="{circ_r}"/>'
        svg += f'<text class="t-port" x="{dev_cx}" y="{y_pos}">{escape(port_info["name"] or "")}</text>'

    # --- Connections (Lines) ---
    
    # LEFT Side Connections
    for edge in [e for e in graph.edges if e.target == node.id]:
        meta = port_meta.get(edge.targetHandle)
        if meta:
            y_mid = meta['y']
            adpt_w = meta['adpt_w']
            
            label_text = _get_connection_label(edge, False, graph)
            
            # Line goes to the adapter edge if adapter exists, else to device edge
            stub_start_x = x_offset - adpt_w
            stub_end_x = x_offset - adpt_w - LINE_LEN_PX
            
            svg += f'<line class="connector" x1="{stub_end_x}" y1="{y_mid}" x2="{stub_start_x}" y2="{y_mid}"/>'
            text_x = stub_end_x - GAP_PX
            svg += f'<text class="label-text" x="{text_x}" y="{y_mid}" text-anchor="end">{label_text}</text>'

    # RIGHT Side Connections
    for edge in [e for e in graph.edges if e.source == node.id]:
        meta = port_meta.get(edge.sourceHandle)
        if meta:
            y_mid = meta['y']
            adpt_w = meta['adpt_w']
            
            label_text = _get_connection_label(edge, True, graph)
            
            stub_start_x = x_offset + DEV_W_PX + adpt_w
            stub_end_x = stub_start_x + LINE_LEN_PX
            
            svg += f'<line class="connector" x1="{stub_start_x}" y1="{y_mid}" x2="{stub_end_x}" y2="{y_mid}"/>'
            text_x = stub_end_x + GAP_PX
            svg += f'<text class="label-text" x="{text_x}" y="{y_mid}" text-anchor="start">{label_text}</text>'

    svg += '</g>'
    return svg, total_block_height

def _generate_title_block_svg(title_block_data: TitleBlock, page_num: int, total_pages: int, page_w_px: float) -> str:
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

        for placeholder, value in replacements.items():
            svg_template = svg_template.replace(placeholder, escape(str(value)))
        
        if not title_block_data.show_branding:
            svg_template = svg_template.replace("Created using ShowReady", "")
            
        scale = page_w_px / 1916
        return f'<g transform="scale({scale})">{svg_template}</g>'

    except Exception:
        return ""

def _generate_svg_page(content: str, page_w_px: float, page_h_px: float, title_block_svg: str) -> str:
    title_block_height = 135 * (page_w_px / 1916)
    
    return f"""
<svg width="{page_w_px}px" height="{page_h_px}px" viewBox="0 0 {page_w_px} {page_h_px}"
     xmlns="http://www.w3.org/2000/svg">
    <defs>
        <style>
          /* ShowReady Tech Style Definitions */
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
          .t-meta  {{ font: 400 {META_FONT_SIZE}pt  {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; text-anchor: middle; }}
          .t-dim   {{ fill: #666; }}
          .t-accent {{ fill: {SHOWREADY_AMBER}; font-weight: 700; }}
          
          .t-port  {{ font: 400 {PORT_FONT_SIZE}pt  {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; text-anchor: middle; dominant-baseline: middle;}}
          .t-port-aligned {{ font: 400 {PORT_FONT_SIZE}pt  {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; dominant-baseline: middle;}}
          
          .label-text {{ font: 700 {PORT_FONT_SIZE-1}pt  {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; dominant-baseline: middle; }}
          .t-adapter {{ font: 700 {ADAPTER_FONT_SIZE}pt {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; text-anchor: middle; dominant-baseline: middle; }}
        </style>
    </defs>
    <g transform="translate({mm_to_px(MARGIN_MM)}, {mm_to_px(MARGIN_MM)})">
        {content}
    </g>
    <g transform="translate(0, {page_h_px - title_block_height})">
        {title_block_svg}
    </g>
</svg>
"""

def _get_node_specs(graph: Graph) -> List[Dict]:
    """Pre-calculates the dimensions for each node, including labels and ADAPTERS."""
    node_specs = []
    for node in graph.nodes:
        # Pydantic dict compatibility
        ports_data = node.ports
        
        # Calculate Layout for Ports
        ports_by_id = {}
        for handle_id, port_data in ports_data.items():
            port_id = handle_id.split('-')[-1]
            p_name = port_data.name if hasattr(port_data, 'name') else port_data.get('name')
            p_adapter = port_data.adapter_model if hasattr(port_data, 'adapter_model') else port_data.get('adapter_model')

            if port_id not in ports_by_id:
                ports_by_id[port_id] = {'name': p_name, 'adapter': p_adapter, 'in': None, 'out': None}
            if 'in' in handle_id:
                ports_by_id[port_id]['in'] = handle_id
            if 'out' in handle_id:
                ports_by_id[port_id]['out'] = handle_id
        
        input_ports = [p for p in ports_by_id.values() if p['in'] and not p['out']]
        output_ports = [p for p in ports_by_id.values() if p['out'] and not p['in']]
        io_ports = [p for p in ports_by_id.values() if p['in'] and p['out']]
        
        num_in_out_rows = max(len(input_ports), len(output_ports))
        num_io_rows = len(io_ports)
        total_port_rows = num_in_out_rows + num_io_rows
        ports_list_height = total_port_rows * PORT_LINE_HEIGHT
        
        body_height = HEADER_INTERNAL_HEIGHT + ports_list_height + (2 * PORT_LIST_PADDING if total_port_rows > 0 else 0)
        total_height = body_height + TITLE_AREA_HEIGHT

        # Calculate max widths for labels
        left_labels = [_get_connection_label(e, False, graph) for e in graph.edges if e.target == node.id]
        right_labels = [_get_connection_label(e, True, graph) for e in graph.edges if e.source == node.id]
        max_left_label_w = max([_estimate_text_width(l, PORT_FONT_SIZE) for l in left_labels] or [0])
        max_right_label_w = max([_estimate_text_width(l, PORT_FONT_SIZE) for l in right_labels] or [0])
        
        # Calculate max widths for ADAPTERS
        left_adapter_widths = []
        right_adapter_widths = []
        
        for p in input_ports:
             if p.get('adapter'):
                 # Calculate width of full name
                 w = _estimate_text_width(p['adapter'], ADAPTER_FONT_SIZE) + 8 
                 left_adapter_widths.append(w)
        
        for p in output_ports:
             if p.get('adapter'):
                 w = _estimate_text_width(p['adapter'], ADAPTER_FONT_SIZE) + 8
                 right_adapter_widths.append(w)

        max_l_adpt = max(left_adapter_widths or [0])
        max_r_adpt = max(right_adapter_widths or [0])

        # Total Width Calculation
        # LeftLabel | Gap | Stub | MaxLeftAdapter | Device | MaxRightAdapter | Stub | Gap | RightLabel
        total_width = (max_left_label_w + GAP_PX + LINE_LEN_PX + max_l_adpt + 
                       DEV_W_PX + 
                       max_r_adpt + LINE_LEN_PX + GAP_PX + max_right_label_w)

        node_specs.append({
            "node": node,
            "width": total_width,
            "height": total_height,
            "max_l_label": max_left_label_w, # Store this to help align x_offset later
            "max_l_adpt": max_l_adpt
        })
    return node_specs

def build_pdf_bytes(graph: Graph, page_size: str = "Letter", title_block_data: TitleBlock = None) -> bytes:
    if not graph.nodes:
        return b""

    page_dims = PAGE_SIZES.get(page_size, PAGE_SIZES["Letter"])
    page_w_px = mm_to_px(page_dims["w"])
    page_h_px = mm_to_px(page_dims["h"])
    
    title_block_height = 135 * (page_w_px / 1916)
    print_h_px = page_h_px - (2 * mm_to_px(MARGIN_MM)) - title_block_height
    print_w_px = page_w_px - (2 * mm_to_px(MARGIN_MM))

    node_specs = _get_node_specs(graph)
    sorted_nodes = sorted(node_specs, key=lambda s: s['node'].deviceNomenclature or '')

    pages_content = []
    current_page_svg = ""
    
    cursor_x, cursor_y = 0, 0
    row_height = 0

    for spec in sorted_nodes:
        node_width = spec['width']
        node_height = spec['height']

        if cursor_x > 0 and (cursor_x + node_width) > print_w_px:
            cursor_x = 0
            cursor_y += row_height + BLOCK_V_SP_PX
            row_height = 0
        
        if (cursor_y + node_height) > print_h_px:
            if current_page_svg:
                pages_content.append(current_page_svg)
            
            current_page_svg = ""
            cursor_x, cursor_y = 0, 0
            row_height = 0

        # Calculate x_offset for the Device Body
        # Cursor starts at the far left edge of the block.
        # We need to push the device body right past the labels, gap, stub, and adapter.
        x_offset = cursor_x + spec['max_l_label'] + GAP_PX + LINE_LEN_PX + spec['max_l_adpt']
        y_offset = cursor_y

        device_svg, _ = _generate_device_svg(spec['node'], graph, x_offset, y_offset)
        current_page_svg += device_svg

        cursor_x += node_width + BLOCK_V_SP_PX
        row_height = max(row_height, node_height)

    if current_page_svg:
        pages_content.append(current_page_svg)

    pdf_writer = PdfWriter()
    total_pages = len(pages_content)
    for i, svg_content in enumerate(pages_content):
        title_block_svg = _generate_title_block_svg(title_block_data, i + 1, total_pages, page_w_px)
        full_svg = _generate_svg_page(svg_content, page_w_px, page_h_px, title_block_svg)
        try:
            pdf_page_bytes = cairosvg.svg2pdf(bytestring=full_svg.encode('utf-8'))
            pdf_reader = PdfReader(io.BytesIO(pdf_page_bytes))
            pdf_writer.add_page(pdf_reader.pages[0])
        except Exception:
            pass

    with io.BytesIO() as pdf_buffer:
        pdf_writer.write(pdf_buffer)
        pdf_writer.close()
        return pdf_buffer.getvalue()