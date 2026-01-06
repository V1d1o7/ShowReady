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
LINE_LEN_MM = 12 # Extended stubs for better text clearance
GAP_MM = 1.0     # Small gap between stub end and text
BLOCK_V_SP_MM = 12

LAB_H_PX = mm_to_px(LAB_H_MM)
LINE_LEN_PX = mm_to_px(LINE_LEN_MM)
GAP_PX = mm_to_px(GAP_MM)
BLOCK_V_SP_PX = mm_to_px(BLOCK_V_SP_MM)

# Colors - ShowReady Tech Style
SHOWREADY_AMBER = "#f59e0b"
SHOWREADY_DARK = "#1f2937"  # Dark Header
SHOWREADY_BLACK = "#000000"
SHOWREADY_WHITE = "#ffffff"
STROKE_COLOR = "#000000"

# Fonts & Layout
FONT_FAMILY = "'Space Mono', 'Ubuntu Mono', monospace"
TITLE_FONT_SIZE = 11 * SCALE_FACTOR
META_FONT_SIZE = 7 * SCALE_FACTOR
PORT_FONT_SIZE = 7 * SCALE_FACTOR
PORT_LINE_HEIGHT = 18 * SCALE_FACTOR
TITLE_AREA_HEIGHT = 24 * SCALE_FACTOR 
HEADER_INTERNAL_HEIGHT = 65 * SCALE_FACTOR
PORT_LIST_PADDING = 12 * SCALE_FACTOR
CORNER_RADIUS = 8 * SCALE_FACTOR # Smooth rounded corners

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
        port_name = remote_node.ports[remote_handle_id].name or port_name

    # Format: DEVICE:PORT
    return f"{escape(remote_node.deviceNomenclature)}:{escape(port_name)}"

def _estimate_text_width(text: str, font_size: float) -> float:
    return len(text) * font_size * 0.6 + 5

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

def _generate_device_svg(node: Node, graph: Graph, x_offset: float, y_offset: float) -> Tuple[str, float]:
    # --- Port Grouping ---
    ports_by_id = {}
    for handle_id, port_data in node.ports.items():
        port_id = handle_id.split('-')[-1]
        if port_id not in ports_by_id:
            ports_by_id[port_id] = {'name': port_data.name, 'in': None, 'out': None}
        
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

    # 1. Device Header (Rounded Top, Stroked to match body width)
    header_path = _generate_rounded_header_path(x_offset, y_offset, DEV_W_PX, TITLE_AREA_HEIGHT, CORNER_RADIUS)
    svg += f'<path class="header-box" d="{header_path}"/>'
    svg += f'<text class="t-title" x="{dev_cx}" y="{y_offset + (TITLE_AREA_HEIGHT/2) + 1}">{escape(node.deviceNomenclature)}</text>'

    # 2. Device Body (Rectangular)
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
    port_y_positions = {}

    # Triangle Constants
    tri_w = 6
    tri_h = 4

    # Draw input ports (Left Side)
    for i, port_info in enumerate(input_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[port_info['in']] = y_pos
        
        # Solid Triangle pointing IN (>)
        # Base on edge, Tip inward
        p1 = f"{x_offset},{y_pos - tri_h}"
        p2 = f"{x_offset + tri_w},{y_pos}"
        p3 = f"{x_offset},{y_pos + tri_h}"
        svg += f'<polygon class="port-shape filled" points="{p1} {p2} {p3}"/>'
        
        svg += f'<text class="t-port-aligned" x="{x_offset + 14}" y="{y_pos}">{escape(port_info["name"] or "")}</text>'

    # Draw output ports (Right Side)
    for i, port_info in enumerate(output_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[port_info['out']] = y_pos
        
        # Solid Triangle pointing OUT (>)
        # Base inside, Tip on edge
        cx = x_offset + DEV_W_PX
        p1 = f"{cx - tri_w},{y_pos - tri_h}"
        p2 = f"{cx},{y_pos}"
        p3 = f"{cx - tri_w},{y_pos + tri_h}"
        svg += f'<polygon class="port-shape filled" points="{p1} {p2} {p3}"/>'
        
        svg += f'<text class="t-port-aligned" x="{x_offset + DEV_W_PX - 14}" y="{y_pos}" text-anchor="end">{escape(port_info["name"] or "")}</text>'

    # Draw IO ports (Both Sides)
    io_y_start = ports_y_start + (num_in_out_rows * PORT_LINE_HEIGHT)
    for i, port_info in enumerate(io_ports):
        y_pos = io_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[port_info['in']] = y_pos
        port_y_positions[port_info['out']] = y_pos
        
        text_width = _estimate_text_width(port_info["name"] or "", PORT_FONT_SIZE)
        gap_width = text_width + 10
        
        text_start_x = dev_cx - (gap_width / 2)
        text_end_x = dev_cx + (gap_width / 2)
        
        # Internal dashed guidelines
        svg += f'<line class="port-line" x1="{x_offset + 10}" y1="{y_pos}" x2="{text_start_x}" y2="{y_pos}"/>'
        svg += f'<line class="port-line" x1="{text_end_x}" y1="{y_pos}" x2="{x_offset + DEV_W_PX - 10}" y2="{y_pos}"/>'

        # Circles centered on the edge
        circ_r = 3
        svg += f'<circle class="port-shape filled" cx="{x_offset}" cy="{y_pos}" r="{circ_r}"/>'
        svg += f'<circle class="port-shape filled" cx="{x_offset + DEV_W_PX}" cy="{y_pos}" r="{circ_r}"/>'
        
        svg += f'<text class="t-port" x="{dev_cx}" y="{y_pos}">{escape(port_info["name"] or "")}</text>'

    # --- Connections (Clean Lines & Text) ---
    
    # LEFT Side Connections
    # Line goes Left from edge, Text is right-aligned to the stub end
    for edge in [e for e in graph.edges if e.target == node.id]:
        y_mid = port_y_positions.get(edge.targetHandle)
        if y_mid:
            label_text = _get_connection_label(edge, False, graph)
            # Stub line
            stub_start_x = x_offset
            stub_end_x = x_offset - LINE_LEN_PX
            
            svg += f'<line class="connector" x1="{stub_end_x}" y1="{y_mid}" x2="{stub_start_x}" y2="{y_mid}"/>'
            # Text
            text_x = stub_end_x - GAP_PX
            svg += f'<text class="label-text" x="{text_x}" y="{y_mid}" text-anchor="end">{label_text}</text>'

    # RIGHT Side Connections
    # Line goes Right from edge, Text is left-aligned to the stub end
    for edge in [e for e in graph.edges if e.source == node.id]:
        y_mid = port_y_positions.get(edge.sourceHandle)
        if y_mid:
            label_text = _get_connection_label(edge, True, graph)
            # Stub line
            stub_start_x = x_offset + DEV_W_PX
            stub_end_x = stub_start_x + LINE_LEN_PX
            
            svg += f'<line class="connector" x1="{stub_start_x}" y1="{y_mid}" x2="{stub_end_x}" y2="{y_mid}"/>'
            # Text
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

    except Exception as e:
        print(f"Error generating title block SVG: {e}")
        return ""

def _generate_svg_page(content: str, page_w_px: float, page_h_px: float, title_block_svg: str) -> str:
    title_block_height = 135 * (page_w_px / 1916)
    
    return f"""
<svg width="{page_w_px}px" height="{page_h_px}px" viewBox="0 0 {page_w_px} {page_h_px}"
     xmlns="http://www.w3.org/2000/svg">
    <defs>
        <style>
          /* ShowReady Tech Style Definitions */
          /* Stroke width ensures header matches body width exactly */
          .header-box {{ fill: {SHOWREADY_DARK}; stroke: {SHOWREADY_BLACK}; stroke-width: 1.5; }}
          .device-body {{ fill: {SHOWREADY_WHITE}; stroke: {SHOWREADY_BLACK}; stroke-width: 1.5; }}
          
          .connector {{ fill: none; stroke: {SHOWREADY_BLACK}; stroke-width: 1; }}
          
          .port-shape {{ fill: {SHOWREADY_WHITE}; stroke: {SHOWREADY_BLACK}; stroke-width: 1; }}
          .port-shape.filled {{ fill: {SHOWREADY_BLACK}; stroke: none; }}
          
          .separator {{ stroke: #e5e7eb; stroke-width: 1; }}
          .port-line {{ stroke: #e5e7eb; stroke-width: 1; stroke-dasharray: 2,2; }}

          .t-title {{ font: 700 {TITLE_FONT_SIZE}pt {FONT_FAMILY},monospace; fill: {SHOWREADY_AMBER}; text-anchor: middle; dominant-baseline: middle; letter-spacing: 0.5px; }}
          .t-meta  {{ font: 400 {META_FONT_SIZE}pt  {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; text-anchor: middle; }}
          .t-dim   {{ fill: #666; }}
          .t-accent {{ fill: {SHOWREADY_AMBER}; font-weight: 700; }}
          
          .t-port  {{ font: 400 {PORT_FONT_SIZE}pt  {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; text-anchor: middle; dominant-baseline: middle;}}
          .t-port-aligned {{ font: 400 {PORT_FONT_SIZE}pt  {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; dominant-baseline: middle;}}
          
          .label-text {{ font: 700 {PORT_FONT_SIZE-1}pt  {FONT_FAMILY},monospace; fill: {SHOWREADY_BLACK}; dominant-baseline: middle; }}
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
    """Pre-calculates the dimensions for each node, including labels."""
    node_specs = []
    for node in graph.nodes:
        ports_by_id = {}
        for handle_id, port_data in node.ports.items():
            port_id = handle_id.split('-')[-1]
            if port_id not in ports_by_id:
                ports_by_id[port_id] = {'name': port_data.name, 'in': None, 'out': None}
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

        left_labels = [_get_connection_label(e, False, graph) for e in graph.edges if e.target == node.id]
        right_labels = [_get_connection_label(e, True, graph) for e in graph.edges if e.source == node.id]
        max_left_width = max([_estimate_text_width(l, PORT_FONT_SIZE) for l in left_labels] or [0])
        max_right_width = max([_estimate_text_width(l, PORT_FONT_SIZE) for l in right_labels] or [0])
        
        # Total width includes the Device Width + Stub Lengths + Text Widths + Gaps
        total_width = max_left_width + GAP_PX + LINE_LEN_PX + DEV_W_PX + LINE_LEN_PX + GAP_PX + max_right_width

        node_specs.append({
            "node": node,
            "width": total_width,
            "height": total_height
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

        # Calculate max text widths again for correct positioning
        left_labels = [_get_connection_label(e, False, graph) for e in graph.edges if e.target == spec['node'].id]
        max_left_width = max([_estimate_text_width(l, PORT_FONT_SIZE) for l in left_labels] or [0])
        
        # x_offset is where the DEVICE BOX starts. 
        # So we shift past the left labels + gaps.
        x_offset = cursor_x + max_left_width + GAP_PX + LINE_LEN_PX
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
        except Exception as e:
            print(f"Error converting SVG to PDF: {e}")
            pass

    with io.BytesIO() as pdf_buffer:
        pdf_writer.write(pdf_buffer)
        pdf_writer.close()
        return pdf_buffer.getvalue()