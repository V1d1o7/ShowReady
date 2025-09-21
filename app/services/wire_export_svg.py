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
DEV_W_PX = 240.564 * SCALE_FACTOR
LAB_H_MM = 3.5
LINE_LEN_MM = 4
GAP_MM = 1.5
BLOCK_V_SP_MM = 15

LAB_H_PX = mm_to_px(LAB_H_MM)
LINE_LEN_PX = mm_to_px(LINE_LEN_MM)
GAP_PX = mm_to_px(GAP_MM)
BLOCK_V_SP_PX = mm_to_px(BLOCK_V_SP_MM)

# Colors
TITLE_COLOR = "#f59e0b"
BLACK_COLOR = "#000000"
GREY_COLOR = "#666666"
IP_ADDRESS_COLOR = "#3f007f"
INPUT_ARROW_COLOR = "#5fbf00"
OUTPUT_ARROW_COLOR = "#bf0000"
CONNECTION_LABEL_COLOR = "#f59e0b"

# Fonts & Layout
FONT_FAMILY = "'Space Mono', 'Ubuntu Mono', monospace"
TITLE_FONT_SIZE = 12 * SCALE_FACTOR
META_FONT_SIZE = 8 * SCALE_FACTOR
PORT_FONT_SIZE = 8 * SCALE_FACTOR
PORT_LINE_HEIGHT = 18 * SCALE_FACTOR
TITLE_AREA_HEIGHT = 15 * SCALE_FACTOR
HEADER_INTERNAL_HEIGHT = 70 * SCALE_FACTOR
PORT_LIST_PADDING = 12 * SCALE_FACTOR

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
    if not remote_node: return "Unknown.Device"

    port_name = remote_handle_id
    if remote_handle_id and remote_node.ports and remote_handle_id in remote_node.ports:
        port_name = remote_node.ports[remote_handle_id].name or port_name

    return f"{escape(remote_node.deviceNomenclature)}.{escape(port_name)}"

def _estimate_text_width(text: str, font_size: float) -> float:
    return len(text) * font_size * 0.55 + 15

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
    dynamic_dev_h = HEADER_INTERNAL_HEIGHT + ports_list_height + (2 * PORT_LIST_PADDING if total_port_rows > 0 else 0)
    total_block_height = dynamic_dev_h + TITLE_AREA_HEIGHT

    # --- SVG Generation ---
    dev_cx = x_offset + DEV_W_PX / 2
    svg = f'<g>'

    svg += f'<text class="t-title" x="{dev_cx}" y="{y_offset}">{escape(node.deviceNomenclature)}</text>'

    box_y_offset = y_offset + TITLE_AREA_HEIGHT
    svg += f'<rect class="device" x="{x_offset}" y="{box_y_offset}" width="{DEV_W_PX}" height="{dynamic_dev_h}"/>'

    svg += f'<text class="t-meta" x="{dev_cx}" y="{box_y_offset + 15}">{escape(node.modelNumber)}</text>'
    svg += f'<text class="t-meta t-dim" x="{dev_cx}" y="{box_y_offset + 28}">{escape(node.rackName)}.RU{node.deviceRu}</text>'
    if node.ipAddress:
        svg += f'<text class="t-ip" x="{dev_cx}" y="{box_y_offset + 35}">{escape(node.ipAddress)}</text>'

    ports_y_start = box_y_offset + HEADER_INTERNAL_HEIGHT + PORT_LIST_PADDING
    port_y_positions = {}

    # Draw input ports (left-aligned)
    for i, port_info in enumerate(input_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[port_info['in']] = y_pos
        svg += f'<polygon class="arrow-in" points="{x_offset+2},{y_pos} {x_offset+7},{y_pos-4} {x_offset+7},{y_pos+4}"/>'
        svg += f'<text class="t-port-aligned" x="{x_offset+12}" y="{y_pos}">{escape(port_info["name"] or "")}</text>'

    # Draw output ports (right-aligned)
    for i, port_info in enumerate(output_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[port_info['out']] = y_pos
        svg += f'<polygon class="arrow-out" points="{x_offset+DEV_W_PX-2},{y_pos} {x_offset+DEV_W_PX-7},{y_pos-4} {x_offset+DEV_W_PX-7},{y_pos+4}"/>'
        svg += f'<text class="t-port-aligned" x="{x_offset+DEV_W_PX - 12}" y="{y_pos}" text-anchor="end">{escape(port_info["name"] or "")}</text>'

    # Draw IO ports (centered)
    io_y_start = ports_y_start + (num_in_out_rows * PORT_LINE_HEIGHT)
    for i, port_info in enumerate(io_ports):
        y_pos = io_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[port_info['in']] = y_pos
        port_y_positions[port_info['out']] = y_pos
        
        text_width = _estimate_text_width(port_info["name"] or "", PORT_FONT_SIZE)
        gap_width = text_width + 10
        arrow_width = 10 # A bit of buffer for the arrow
        line_start_x = x_offset + arrow_width
        line_end_x = x_offset + DEV_W_PX - arrow_width
        text_start_x = dev_cx - (gap_width / 2)
        text_end_x = dev_cx + (gap_width / 2)
        
        svg += f'<line class="port-line" x1="{line_start_x}" y1="{y_pos}" x2="{text_start_x}" y2="{y_pos}"/>'
        svg += f'<line class="port-line" x1="{text_end_x}" y1="{y_pos}" x2="{line_end_x}" y2="{y_pos}"/>'

        svg += f'<polygon class="arrow-in" points="{x_offset+2},{y_pos} {x_offset+7},{y_pos-4} {x_offset+7},{y_pos+4}"/>'
        svg += f'<polygon class="arrow-out" points="{x_offset+DEV_W_PX-2},{y_pos} {x_offset+DEV_W_PX-7},{y_pos-4} {x_offset+DEV_W_PX-7},{y_pos+4}"/>'
        
        svg += f'<text class="t-port" x="{dev_cx}" y="{y_pos}">{escape(port_info["name"] or "")}</text>'


    left_label_x_base = x_offset - GAP_PX
    for edge in [e for e in graph.edges if e.target == node.id]:
        y_mid = port_y_positions.get(edge.targetHandle)
        if y_mid:
            label_text = _get_connection_label(edge, False, graph)
            text_width = _estimate_text_width(label_text, PORT_FONT_SIZE)
            rect_x = left_label_x_base - text_width - LINE_LEN_PX
            svg += f'<line class="connector" x1="{left_label_x_base - LINE_LEN_PX}" y1="{y_mid}" x2="{x_offset}" y2="{y_mid}"/>'
            svg += f'<rect class="label-box" x="{rect_x}" y="{y_mid - LAB_H_PX/2}" width="{text_width}" height="{LAB_H_PX}"/>'
            svg += f'<text class="label-text" x="{rect_x + text_width / 2}" y="{y_mid}">{label_text}</text>'

    right_label_x_base = x_offset + DEV_W_PX + GAP_PX
    for edge in [e for e in graph.edges if e.source == node.id]:
        y_mid = port_y_positions.get(edge.sourceHandle)
        if y_mid:
            label_text = _get_connection_label(edge, True, graph)
            text_width = _estimate_text_width(label_text, PORT_FONT_SIZE)
            svg += f'<line class="connector" x1="{x_offset + DEV_W_PX}" y1="{y_mid}" x2="{right_label_x_base + LINE_LEN_PX}" y2="{y_mid}"/>'
            svg += f'<rect class="label-box" x="{right_label_x_base + LINE_LEN_PX}" y="{y_mid - LAB_H_PX/2}" width="{text_width}" height="{LAB_H_PX}"/>'
            svg += f'<text class="label-text" x="{right_label_x_base + LINE_LEN_PX + text_width / 2}" y="{y_mid}">{label_text}</text>'

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
          .device {{ fill: none; stroke: #000; stroke-width: 1; }}
          .connector {{ fill: none; stroke: #000; stroke-width: 0.75; }}
          .label-box {{ fill: {CONNECTION_LABEL_COLOR}; stroke: none; }}
          .arrow-in {{ fill: {INPUT_ARROW_COLOR}; }}
          .arrow-out {{ fill: {OUTPUT_ARROW_COLOR}; }}
          .t-title {{ font: 700 {TITLE_FONT_SIZE}pt {FONT_FAMILY},monospace; fill: {TITLE_COLOR}; text-anchor: middle; }}
          .t-meta  {{ font: 400 {META_FONT_SIZE}pt  {FONT_FAMILY},monospace; fill: #000; text-anchor: middle; }}
          .t-dim   {{ fill: {GREY_COLOR}; }}
          .t-ip    {{ font: 700 {META_FONT_SIZE}pt  {FONT_FAMILY},monospace; fill: {IP_ADDRESS_COLOR}; text-anchor: middle; dominant-baseline: middle; }}
          .t-port  {{ font: 400 {PORT_FONT_SIZE}pt  {FONT_FAMILY},monospace; fill: #000; text-anchor: middle; dominant-baseline: middle;}}
          .t-port-aligned {{ font: 400 {PORT_FONT_SIZE}pt  {FONT_FAMILY},monospace; fill: #000; dominant-baseline: middle;}}
          .port-line {{ fill: none; stroke: #ccc; stroke-width: 0.5; }}
          .label-text {{ font: 400 {PORT_FONT_SIZE-1}pt  {FONT_FAMILY},monospace; fill: #000; text-anchor: middle; dominant-baseline: middle; }}
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
        dynamic_dev_h = HEADER_INTERNAL_HEIGHT + ports_list_height + (2 * PORT_LIST_PADDING if total_port_rows > 0 else 0)
        total_height = dynamic_dev_h + TITLE_AREA_HEIGHT

        left_labels = [_get_connection_label(e, False, graph) for e in graph.edges if e.target == node.id]
        right_labels = [_get_connection_label(e, True, graph) for e in graph.edges if e.source == node.id]
        max_left_width = max([_estimate_text_width(l, PORT_FONT_SIZE) for l in left_labels] or [0])
        max_right_width = max([_estimate_text_width(l, PORT_FONT_SIZE) for l in right_labels] or [0])
        total_width = max_left_width + GAP_PX + DEV_W_PX + GAP_PX + max_right_width

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

        left_labels = [_get_connection_label(e, False, graph) for e in graph.edges if e.target == spec['node'].id]
        max_left_width = max([_estimate_text_width(l, PORT_FONT_SIZE) for l in left_labels] or [0])
        
        x_offset = cursor_x + max_left_width + GAP_PX
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
