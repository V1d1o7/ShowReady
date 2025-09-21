import io
import re
import cairosvg
from pypdf import PdfWriter, PdfReader
from typing import List, Tuple, Dict
from xml.sax.saxutils import escape
import json

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

# --- Template-based constants ---
# Dimensions from user's SVG template (241x372 px)
DEV_W_PX = 240.564
LAB_W_MM = 66.1
LAB_H_MM = 12
LINE_LEN_MM = 8
GAP_MM = 4
BLOCK_V_SP_MM = 30

LAB_W_PX = mm_to_px(LAB_W_MM)
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

# Fonts & Layout from template
FONT_FAMILY = "Noto Sans JP, Arial, Helvetica, sans-serif"
PORT_LINE_HEIGHT = 28 # Vertical distance between ports, from SVG

# --- Helper Functions ---
def _get_port_label(node: Node, handle_id: str) -> str:
    port_name = handle_id or "Port"
    if handle_id and node.ports and handle_id in node.ports and node.ports[handle_id].name:
        port_name = node.ports[handle_id].name
    return f"{escape(node.deviceNomenclature)}.{escape(port_name)}"

def _generate_device_svg(node: Node, connected_inputs: List[Edge], connected_outputs: List[Edge], y_offset: float) -> Tuple[str, float]:
    all_input_ports = sorted([p for p in node.ports.items() if p[0].startswith('port-in-') or 'io' in p[0]], key=lambda p: p[1].name or '')
    all_output_ports = sorted([p for p in node.ports.items() if p[0].startswith('port-out-') or 'io' in p[0]], key=lambda p: p[1].name or '')
    max_ports_on_a_side = max(len(all_input_ports), len(all_output_ports))

    # Calculate height based on template's proportions
    base_height = 120 # Height of the header area in the template
    ports_list_height = max_ports_on_a_side * PORT_LINE_HEIGHT
    dynamic_dev_h = base_height + ports_list_height

    center_x = (PRINT_W_PX - DEV_W_PX) / 2

    # --- Replicate SVG Template ---
    svg = f'<g transform="translate({center_x}, {y_offset})">'
    svg += f'<rect stroke="{BLACK_COLOR}" stroke-width="2" height="{dynamic_dev_h}" width="{DEV_W_PX}" y="46.5" x="0" fill="none"/>'
    svg += f'<text font-weight="bold" font-family="{FONT_FAMILY}" font-size="24" y="21.1" x="6.8" fill="{TITLE_COLOR}">{escape(node.deviceNomenclature)}</text>'
    svg += f'<text font-family="{FONT_FAMILY}" font-size="14" y="62.1" x="73.5" fill="{BLACK_COLOR}">{escape(node.modelNumber)}</text>'
    svg += f'<text font-family="{FONT_FAMILY}" font-size="14" y="80.6" x="40.6" fill="{GREY_COLOR}">{escape(node.rackName)}.RU{node.deviceRu}</text>'
    if node.ipAddress:
        svg += f'<text font-weight="bold" font-family="{FONT_FAMILY}" font-size="14" y="99.1" x="84.9" fill="{IP_ADDRESS_COLOR}">{escape(node.ipAddress)}</text>'

    port_y_positions = {}

    for i, (handle_id, port) in enumerate(all_input_ports):
        y_pos = 163.4 + (i * PORT_LINE_HEIGHT)
        port_y_positions[handle_id] = y_offset + y_pos
        svg += f'<path transform="translate(4.3, {y_pos - 6}) rotate(90)" d="m0,5.7l-6.6,-5.7l6.6,-5.7l0,11.4z" fill="{INPUT_ARROW_COLOR}"/>'
        svg += f'<text font-family="{FONT_FAMILY}" font-size="14" y="{y_pos}" x="7.7">{escape(port.name or "")}</text>'

    for i, (handle_id, port) in enumerate(all_output_ports):
        y_pos = 163.4 + (i * PORT_LINE_HEIGHT)
        port_y_positions[handle_id] = y_offset + y_pos
        svg += f'<path transform="translate({DEV_W_PX - 4.3}, {y_pos - 6}) rotate(90)" d="m0,5.7l-6.6,-5.7l6.6,-5.7l0,11.4z" fill="{OUTPUT_ARROW_COLOR}"/>'
        svg += f'<text font-family="{FONT_FAMILY}" font-size="14" y="{y_pos}" x="150.8" text-anchor="start">{escape(port.name or "")}</text>'

    svg += '</g>'

    left_label_x = center_x - GAP_PX - LINE_LEN_PX - LAB_W_PX
    line_start_x = left_label_x + LAB_W_PX
    line_end_x = line_start_x + LINE_LEN_PX

    for edge in connected_inputs:
        y_mid = port_y_positions.get(edge.targetHandle)
        if y_mid:
            label_text = _get_port_label(node, edge.targetHandle)
            svg += f'<rect x="{left_label_x}" y="{y_mid - LAB_H_PX/2}" width="{LAB_W_PX}" height="{LAB_H_PX}" fill="{CONNECTION_LABEL_COLOR}" stroke="{BLACK_COLOR}" stroke-width="1"/>'
            svg += f'<text x="{left_label_x + LAB_W_PX/2}" y="{y_mid}" class="label-text">{label_text}</text>'
            svg += f'<line x1="{line_start_x}" y1="{y_mid}" x2="{line_end_x}" y2="{y_mid}" stroke="{BLACK_COLOR}" stroke-width="1.5"/>'

    right_label_x = center_x + DEV_W_PX + GAP_PX + LINE_LEN_PX
    line_start_x = right_label_x - LINE_LEN_PX
    line_end_x = right_label_x

    for edge in connected_outputs:
        y_mid = port_y_positions.get(edge.sourceHandle)
        if y_mid:
            label_text = _get_port_label(node, edge.sourceHandle)
            svg += f'<rect x="{right_label_x}" y="{y_mid - LAB_H_PX/2}" width="{LAB_W_PX}" height="{LAB_H_PX}" fill="{CONNECTION_LABEL_COLOR}" stroke="{BLACK_COLOR}" stroke-width="1"/>'
            svg += f'<text x="{right_label_x + LAB_W_PX/2}" y="{y_mid}" class="label-text">{label_text}</text>'
            svg += f'<line x1="{line_start_x}" y1="{y_mid}" x2="{line_end_x}" y2="{y_mid}" stroke="{BLACK_COLOR}" stroke-width="1.5"/>'

    return svg, dynamic_dev_h + 47

def _generate_svg_page(content: str) -> str:
    return f"""
<svg width="{PAGE_W_PX}px" height="{PAGE_H_PX}px" viewBox="0 0 {PAGE_W_PX} {PAGE_H_PX}"
     xmlns="http://www.w3.org/2000/svg">
    <style>
        .device-title {{ font-family: "{FONT_FAMILY}"; font-size: 24px; font-weight: bold; fill: {TITLE_COLOR}; }}
        .device-text {{ font-family: "{FONT_FAMILY}"; font-size: 14px; fill: {BLACK_COLOR}; }}
        .device-text-grey {{ font-family: "{FONT_FAMILY}"; font-size: 14px; fill: {GREY_COLOR}; }}
        .device-ip {{ font-family: "{FONT_FAMILY}"; font-size: 14px; font-weight: bold; fill: {IP_ADDRESS_COLOR}; }}
        .label-text {{ font-family: "{FONT_FAMILY}"; font-size: 9px; text-anchor: middle; dominant-baseline: central; }}
        .port-text {{ font-family: "{FONT_FAMILY}"; font-size: 14px; fill: {BLACK_COLOR}; dominant-baseline: middle; }}
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
        all_input_ports = [p for p in node.ports.items() if p[0].startswith('port-in-') or 'io' in p[0]]
        all_output_ports = [p for p in node.ports.items() if p[0].startswith('port-out-') or 'io' in p[0]]
        max_ports_on_a_side = max(len(all_input_ports), len(all_output_ports))
        ports_list_height = max_ports_on_a_side * PORT_LINE_HEIGHT
        total_block_height = 120 + ports_list_height + 47

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
