import io
import re
import cairosvg
from pypdf import PdfWriter, PdfReader
from typing import List, Tuple, Dict
from xml.sax.saxutils import escape

from app.schemas.wire_export import Graph, Node, Edge

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
LINE_LEN_MM = 8
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
HEADER_INTERNAL_HEIGHT = 60 * SCALE_FACTOR
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
    all_input_ports = sorted([p for p in node.ports.items() if 'in' in p[0]], key=lambda p: p[1].name or '')
    all_output_ports = sorted([p for p in node.ports.items() if 'out' in p[0]], key=lambda p: p[1].name or '')

    max_ports_on_a_side = max(len(all_input_ports), len(all_output_ports))

    ports_list_height = max_ports_on_a_side * PORT_LINE_HEIGHT
    dynamic_dev_h = HEADER_INTERNAL_HEIGHT + ports_list_height + (2 * PORT_LIST_PADDING)
    total_block_height = dynamic_dev_h + TITLE_AREA_HEIGHT

    dev_cx = x_offset + DEV_W_PX / 2

    svg = f'<g>' # Group for the entire device block, translation handled by caller
    svg += f'<text class="t-title" x="{dev_cx}" y="{y_offset}">{escape(node.deviceNomenclature)}</text>'

    box_y_offset = y_offset + TITLE_AREA_HEIGHT
    svg += f'<rect class="device" x="{x_offset}" y="{box_y_offset}" width="{DEV_W_PX}" height="{dynamic_dev_h}"/>'

    svg += f'<text class="t-meta" x="{dev_cx}" y="{box_y_offset + 15}">{escape(node.modelNumber)}</text>'
    svg += f'<text class="t-meta t-dim" x="{dev_cx}" y="{box_y_offset + 28}">{escape(node.rackName)}.RU{node.deviceRu}</text>'
    if node.ipAddress:
        svg += f'<text class="t-ip" x="{dev_cx}" y="{box_y_offset + 41}">{escape(node.ipAddress)}</text>'

    ports_y_start = box_y_offset + HEADER_INTERNAL_HEIGHT + PORT_LIST_PADDING
    port_y_positions = {}

    for i, (handle_id, port) in enumerate(all_input_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[handle_id] = y_pos
        svg += f'<polygon class="arrow-in" points="{x_offset+2},{y_pos} {x_offset+7},{y_pos-4} {x_offset+7},{y_pos+4}"/>'
        svg += f'<text class="t-port" x="{x_offset+12}" y="{y_pos}" dominant-baseline="middle">{escape(port.name or "")}</text>'

    for i, (handle_id, port) in enumerate(all_output_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[handle_id] = y_pos
        svg += f'<polygon class="arrow-out" points="{x_offset+DEV_W_PX-2},{y_pos} {x_offset+DEV_W_PX-7},{y_pos-4} {x_offset+DEV_W_PX-7},{y_pos+4}"/>'
        svg += f'<text class="t-port" x="{x_offset+DEV_W_PX - 12}" y="{y_pos}" dominant-baseline="middle" text-anchor="end">{escape(port.name or "")}</text>'

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

def _generate_svg_page(content: str, page_w_px: float, page_h_px: float) -> str:
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
          .t-ip    {{ font: 700 {META_FONT_SIZE}pt  {FONT_FAMILY},monospace; fill: {IP_ADDRESS_COLOR}; text-anchor: middle; }}
          .t-port  {{ font: 400 {PORT_FONT_SIZE}pt  {FONT_FAMILY},monospace; fill: #000; }}
          .label-text {{ font: 400 {PORT_FONT_SIZE-1}pt  {FONT_FAMILY},monospace; fill: #000; text-anchor: middle; dominant-baseline: middle; }}
        </style>
    </defs>
    <g transform="translate({mm_to_px(MARGIN_MM)}, {mm_to_px(MARGIN_MM)})">
        {content}
    </g>
</svg>
"""

def build_pdf_bytes(graph: Graph, page_size: str = "Letter") -> bytes:
    if not graph.nodes:
        return b""

    page_dims = PAGE_SIZES.get(page_size, PAGE_SIZES["Letter"])
    page_w_px = mm_to_px(page_dims["w"])
    page_h_px = mm_to_px(page_dims["h"])
    print_h_px = page_h_px - (2 * mm_to_px(MARGIN_MM))
    print_w_px = page_w_px - (2 * mm_to_px(MARGIN_MM))

    num_cols = 3
    col_width = print_w_px / num_cols

    pages_content = []
    current_page_svg = ""
    col_y_cursors = [0] * num_cols

    for node in graph.nodes:
        # Find the column with the minimum current height
        target_col = min(range(num_cols), key=lambda i: col_y_cursors[i])

        # Calculate block height
        all_input_ports = [p for p in node.ports.items() if 'in' in p[0]]
        all_output_ports = [p for p in node.ports.items() if 'out' in p[0]]
        max_ports = max(len(all_input_ports), len(all_output_ports))
        ports_h = max_ports * PORT_LINE_HEIGHT
        total_h = HEADER_INTERNAL_HEIGHT + ports_h + (2 * PORT_LIST_PADDING) + TITLE_AREA_HEIGHT

        if col_y_cursors[target_col] > 0 and col_y_cursors[target_col] + total_h > print_h_px:
            # This logic is imperfect; a full column might not be the best place.
            # A more sophisticated packing algorithm would be needed for perfect layout.
            # For now, we just wrap around, which will create a new page if all are full.
            # This part needs to be implemented if multi-page is a hard requirement.
            pass

        x_offset = (target_col * col_width) + (col_width / 2) - (DEV_W_PX / 2)
        y_offset = col_y_cursors[target_col]

        device_svg, actual_height = _generate_device_svg(node, graph, x_offset, y_offset)
        current_page_svg += device_svg
        col_y_cursors[target_col] += actual_height + BLOCK_V_SP_PX

    if current_page_svg:
        pages_content.append(current_page_svg)

    pdf_writer = PdfWriter()
    for svg_content in pages_content:
        full_svg = _generate_svg_page(svg_content, page_w_px, page_h_px)
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
