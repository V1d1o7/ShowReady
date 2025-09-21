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
DEV_W_MM = 63.7
LAB_W_MM = 66.1
LAB_H_MM = 10
LINE_LEN_MM = 8
GAP_MM = 4
BLOCK_V_SP_MM = 25

DEV_W_PX = mm_to_px(DEV_W_MM)
LAB_W_PX = mm_to_px(LAB_W_MM)
LAB_H_PX = mm_to_px(LAB_H_MM)
LINE_LEN_PX = mm_to_px(LINE_LEN_MM)
GAP_PX = mm_to_px(GAP_MM)
BLOCK_V_SP_PX = mm_to_px(BLOCK_V_SP_MM)

# Colors
AMBER_COLOR = "#f59e0b"
DARK_PURPLE_COLOR = "#3f007f"
GREY_COLOR = "#666666"
BLACK_COLOR = "#000000"
WHITE_COLOR = "#FFFFFF"
INPUT_ARROW_COLOR = "#5fbf00"
OUTPUT_ARROW_COLOR = "#bf0000"

# Fonts & Layout
FONT_FAMILY = "Noto Sans JP, Arial, Helvetica, sans-serif"
PORT_FONT_SIZE = 8
PORT_LINE_HEIGHT = 12
TITLE_HEIGHT = 20
HEADER_INTERNAL_HEIGHT = 55
PORT_LIST_PADDING = 10

# SVG paths for arrows
ARROW_RIGHT_PATH = "m0,3.5l5,-3.5l-5,-3.5l0,7z"

# --- Helper Functions ---

def _get_port_label(node: Node, handle_id: str) -> str:
    port_name = handle_id or "Port"
    if handle_id and node.ports and handle_id in node.ports and node.ports[handle_id].name:
        port_name = node.ports[handle_id].name
    return f"{escape(node.deviceNomenclature)}.{escape(port_name)}"

def _generate_device_svg(node: Node, connected_inputs: List[Edge], connected_outputs: List[Edge], y_offset: float) -> Tuple[str, float]:
    all_input_ports = sorted([p for p in node.ports.items() if p[0].startswith('port-in-')], key=lambda p: p[1].name or '')
    all_output_ports = sorted([p for p in node.ports.items() if p[0].startswith('port-out-')], key=lambda p: p[1].name or '')
    max_ports_on_a_side = max(len(all_input_ports), len(all_output_ports))

    ports_list_height = max_ports_on_a_side * PORT_LINE_HEIGHT
    dynamic_dev_h = HEADER_INTERNAL_HEIGHT + ports_list_height + (2 * PORT_LIST_PADDING)
    total_block_height = dynamic_dev_h + TITLE_HEIGHT

    center_x = (PRINT_W_PX - DEV_W_PX) / 2

    svg = f'<text x="{center_x}" y="{y_offset}" class="device-title">{escape(node.deviceNomenclature)}</text>'

    box_y_offset = y_offset + TITLE_HEIGHT
    svg += f'<rect x="{center_x}" y="{box_y_offset}" width="{DEV_W_PX}" height="{dynamic_dev_h}" fill="{WHITE_COLOR}" stroke="{BLACK_COLOR}" stroke-width="2"/>'

    svg += f'<text x="{center_x + 10}" y="{box_y_offset + 20}" class="device-text">{escape(node.modelNumber)}</text>'
    svg += f'<text x="{center_x + 10}" y="{box_y_offset + 35}" class="device-text-grey">{escape(node.rackName)}.RU{node.deviceRu}</text>'
    if node.ipAddress:
        svg += f'<text x="{center_x + 10}" y="{box_y_offset + 50}" class="device-ip">{escape(node.ipAddress)}</text>'

    ports_y_start = box_y_offset + HEADER_INTERNAL_HEIGHT + PORT_LIST_PADDING
    port_y_positions = {}

    for i, (handle_id, port) in enumerate(all_input_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[handle_id] = y_pos
        svg += f'<path transform="translate({center_x + 8}, {y_pos - 3.5})" d="{ARROW_RIGHT_PATH}" fill="{INPUT_ARROW_COLOR}"/>'
        svg += f'<text x="{center_x + 20}" y="{y_pos}" class="port-text">{escape(port.name or "")}</text>'

    for i, (handle_id, port) in enumerate(all_output_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[handle_id] = y_pos
        svg += f'<path transform="translate({center_x + DEV_W_PX - 8}, {y_pos - 3.5}) rotate(180)" d="{ARROW_RIGHT_PATH}" fill="{OUTPUT_ARROW_COLOR}"/>'
        svg += f'<text x="{center_x + DEV_W_PX - 20}" y="{y_pos}" text-anchor="end" class="port-text">{escape(port.name or "")}</text>'

    left_label_x = center_x - GAP_PX - LINE_LEN_PX - LAB_W_PX
    line_start_x = left_label_x + LAB_W_PX
    line_end_x = line_start_x + LINE_LEN_PX

    for edge in connected_inputs:
        y_mid = port_y_positions.get(edge.targetHandle)
        if y_mid:
            label_text = _get_port_label(node, edge.targetHandle)
            svg += f'<rect x="{left_label_x}" y="{y_mid - LAB_H_PX/2}" width="{LAB_W_PX}" height="{LAB_H_PX}" fill="{AMBER_COLOR}" stroke="{BLACK_COLOR}" stroke-width="1"/>'
            svg += f'<text x="{left_label_x + LAB_W_PX/2}" y="{y_mid}" class="label-text">{label_text}</text>'
            svg += f'<line x1="{line_start_x}" y1="{y_mid}" x2="{line_end_x}" y2="{y_mid}" stroke="{BLACK_COLOR}" stroke-width="1.5"/>'

    right_label_x = center_x + DEV_W_PX + GAP_PX + LINE_LEN_PX
    line_start_x = right_label_x - LINE_LEN_PX
    line_end_x = right_label_x

    for edge in connected_outputs:
        y_mid = port_y_positions.get(edge.sourceHandle)
        if y_mid:
            label_text = _get_port_label(node, edge.sourceHandle)
            svg += f'<rect x="{right_label_x}" y="{y_mid - LAB_H_PX/2}" width="{LAB_W_PX}" height="{LAB_H_PX}" fill="{AMBER_COLOR}" stroke="{BLACK_COLOR}" stroke-width="1"/>'
            svg += f'<text x="{right_label_x + LAB_W_PX/2}" y="{y_mid}" class="label-text">{label_text}</text>'
            svg += f'<line x1="{line_start_x}" y1="{y_mid}" x2="{line_end_x}" y2="{y_mid}" stroke="{BLACK_COLOR}" stroke-width="1.5"/>'

    return svg, total_block_height

def _generate_svg_page(content: str) -> str:
    return f"""
<svg width="{PAGE_W_PX}px" height="{PAGE_H_PX}px" viewBox="0 0 {PAGE_W_PX} {PAGE_H_PX}"
     xmlns="http://www.w3.org/2000/svg">
    <style>
        .device-title {{ font-family: {FONT_FAMILY}; font-size: 14px; font-weight: bold; fill: {BLACK_COLOR}; }}
        .device-text {{ font-family: {FONT_FAMILY}; font-size: 10px; fill: {BLACK_COLOR}; }}
        .device-text-grey {{ font-family: {FONT_FAMILY}; font-size: 10px; fill: {GREY_COLOR}; }}
        .device-ip {{ font-family: {FONT_FAMILY}; font-size: 10px; font-weight: bold; fill: {DARK_PURPLE_COLOR}; }}
        .label-text {{ font-family: {FONT_FAMILY}; font-size: 9px; text-anchor: middle; dominant-baseline: central; }}
        .port-text {{ font-family: {FONT_FAMILY}; font-size: {PORT_FONT_SIZE}px; fill: {BLACK_COLOR}; dominant-baseline: middle; }}
    </style>
    <g transform="translate({MARGIN_PX}, {MARGIN_PX})">
        {content}
    </g>
</svg>
"""

def build_pdf_bytes(graph: Graph) -> bytes:
    if not graph.nodes:
        return b""

    node_to_inputs: Dict[str, List[Edge]] = {node.id: [] for node in graph.nodes}
    node_to_outputs: Dict[str, List[Edge]] = {node.id: [] for node in graph.nodes}
    for edge in graph.edges:
        if edge.target in node_to_inputs:
            node_to_inputs[edge.target].append(edge)
        if edge.source in node_to_outputs:
            node_to_outputs[edge.source].append(edge)

    pages_content = []
    current_page_svg = ""
    y_cursor = 0

    for node in graph.nodes:
        all_input_ports = [p for p in node.ports.items() if p[0].startswith('port-in-')]
        all_output_ports = [p for p in node.ports.items() if p[0].startswith('port-out-')]
        max_ports_on_a_side = max(len(all_input_ports), len(all_output_ports))
        ports_list_height = max_ports_on_a_side * PORT_LINE_HEIGHT
        total_block_height = HEADER_INTERNAL_HEIGHT + ports_list_height + (2 * PORT_LIST_PADDING) + TITLE_HEIGHT

        if y_cursor > 0 and y_cursor + total_block_height > PRINT_H_PX:
            pages_content.append(current_page_svg)
            current_page_svg = ""
            y_cursor = 0

        inputs = node_to_inputs.get(node.id, [])
        outputs = node_to_outputs.get(node.id, [])

        device_svg, actual_height = _generate_device_svg(node, inputs, outputs, y_cursor)
        current_page_svg += device_svg

        y_cursor += actual_height + BLOCK_V_SP_PX

    if current_page_svg:
        pages_content.append(current_page_svg)

    pdf_writer = PdfWriter()
    pdf_page_readers = []

    for svg_content in pages_content:
        full_svg = _generate_svg_page(svg_content)
        try:
            pdf_page_bytes = cairosvg.svg2pdf(bytestring=full_svg.encode('utf-8'))
            pdf_reader = PdfReader(io.BytesIO(pdf_page_bytes))
            pdf_page_readers.append(pdf_reader)
            pdf_writer.add_page(pdf_reader.pages[0])
        except Exception as e:
            print(f"[ERROR] Failed to convert or merge page: {e}")
            pass

    with io.BytesIO() as pdf_buffer:
        pdf_writer.write(pdf_buffer)
        pdf_writer.close()
        return pdf_buffer.getvalue()
