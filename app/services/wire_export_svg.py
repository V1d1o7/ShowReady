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
PAGE_W_MM = 279.4
PAGE_H_MM = 215.9
MARGIN_MM = 10
PAGE_W_PX = mm_to_px(PAGE_W_MM)
PAGE_H_PX = mm_to_px(PAGE_H_MM)
MARGIN_PX = mm_to_px(MARGIN_MM)
PRINT_W_PX = PAGE_W_PX - (2 * MARGIN_PX)
PRINT_H_PX = PAGE_H_PX - (2 * MARGIN_PX)

# Component dimensions
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
HEADER_INTERNAL_HEIGHT = 60 * SCALE_FACTOR # Increased for IP address spacing
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
    if not remote_node:
        return "Unknown.Device"

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

    svg = f'<g transform="translate({x_offset}, {y_offset})">'
    svg += f'<text class="t-title" x="{dev_cx - x_offset}" y="0">{escape(node.deviceNomenclature)}</text>'

    box_y_offset = TITLE_AREA_HEIGHT
    svg += f'<rect class="device" x="0" y="{box_y_offset}" width="{DEV_W_PX}" height="{dynamic_dev_h}"/>'

    svg += f'<text class="t-meta" x="{dev_cx - x_offset}" y="{box_y_offset + 15}">{escape(node.modelNumber)}</text>'
    svg += f'<text class="t-meta t-dim" x="{dev_cx - x_offset}" y="{box_y_offset + 28}">{escape(node.rackName)}.RU{node.deviceRu}</text>'
    if node.ipAddress:
        svg += f'<text class="t-ip" x="{dev_cx - x_offset}" y="{box_y_offset + 41}">{escape(node.ipAddress)}</text>'

    ports_y_start = box_y_offset + HEADER_INTERNAL_HEIGHT + PORT_LIST_PADDING
    port_y_positions = {}

    for i, (handle_id, port) in enumerate(all_input_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[handle_id] = y_offset + y_pos
        svg += f'<polygon class="arrow-in" points="{2},{y_pos} {7},{y_pos-4} {7},{y_pos+4}"/>'
        svg += f'<text class="t-port" x="12" y="{y_pos}" dominant-baseline="middle">{escape(port.name or "")}</text>'

    for i, (handle_id, port) in enumerate(all_output_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[handle_id] = y_offset + y_pos
        svg += f'<polygon class="arrow-out" points="{DEV_W_PX-2},{y_pos} {DEV_W_PX-7},{y_pos-4} {DEV_W_PX-7},{y_pos+4}"/>'
        svg += f'<text class="t-port" x="{DEV_W_PX - 12}" y="{y_pos}" dominant-baseline="middle" text-anchor="end">{escape(port.name or "")}</text>'

    svg += '</g>'

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

    return svg, total_block_height

def _generate_svg_page(content: str) -> str:
    return f"""
<svg width="{PAGE_W_PX}px" height="{PAGE_H_PX}px" viewBox="0 0 {PAGE_W_PX} {PAGE_H_PX}"
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
    <g transform="translate({MARGIN_PX}, {MARGIN_PX})">
        {content}
    </g>
</svg>
"""

def build_pdf_bytes(graph: Graph) -> bytes:
    if not graph.nodes:
        return b""

    pages_content = []
    current_page_svg = ""

    nodes_per_column = (len(graph.nodes) + 1) // 2
    col1_nodes = graph.nodes[:nodes_per_column]
    col2_nodes = graph.nodes[nodes_per_column:]

    col1_x = 0
    col2_x = PRINT_W_PX / 2

    # Process column 1
    y_cursor = 0
    for node in col1_nodes:
        device_svg, actual_height = _generate_device_svg(node, graph, col1_x, y_cursor)
        current_page_svg += device_svg
        y_cursor += actual_height + BLOCK_V_SP_PX

    # Process column 2
    y_cursor = 0
    for node in col2_nodes:
        device_svg, actual_height = _generate_device_svg(node, graph, col2_x, y_cursor)
        current_page_svg += device_svg
        y_cursor += actual_height + BLOCK_V_SP_PX

    if current_page_svg:
        pages_content.append(current_page_svg)

    # Note: This implementation does not handle pagination for more nodes than fit in two columns.
    # It will just render them off the page. A more robust solution would be needed for that.

    pdf_writer = PdfWriter()
    for svg_content in pages_content:
        full_svg = _generate_svg_page(svg_content)
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
