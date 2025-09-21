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

# --- Template-based constants ---
DEV_W_PX = 240.564
LAB_W_MM = 66.1
LAB_H_MM = 10
LINE_LEN_MM = 8
GAP_MM = 4
BLOCK_V_SP_MM = 35

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
PORT_LINE_HEIGHT = 28
HEADER_AREA_H = 120
PORT_START_Y = 163.4

# SVG paths for arrows
ARROW_PATH_RIGHT = "m0,5.71333l-6.58738,-5.71333l6.58738,-5.71333l0,11.42666z"

# --- Helper Functions ---
def _get_port_label(node: Node, handle_id: str) -> str:
    port_name = handle_id or "Port"
    if handle_id and node.ports and handle_id in node.ports and node.ports[handle_id].name:
        port_name = node.ports[handle_id].name
    return f"{escape(node.deviceNomenclature)}.{escape(port_name)}"

def _generate_device_svg(node: Node, connected_inputs: List[Edge], connected_outputs: List[Edge], y_offset: float) -> Tuple[str, float]:
    all_input_ports = sorted([p for p in node.ports.items() if 'in' in p[0]], key=lambda p: p[1].name or '')
    all_output_ports = sorted([p for p in node.ports.items() if 'out' in p[0]], key=lambda p: p[1].name or '')
    all_io_ports = sorted([p for p in node.ports.items() if 'io' in p[0]], key=lambda p: p[1].name or '')

    # IO ports appear on both lists for height calculation
    max_ports_on_a_side = max(len(all_input_ports) + len(all_io_ports), len(all_output_ports) + len(all_io_ports))

    ports_list_height = max_ports_on_a_side * PORT_LINE_HEIGHT
    dynamic_dev_h = HEADER_AREA_H + ports_list_height
    total_block_height = dynamic_dev_h + 47 # From template's y-offset for rect

    center_x = (PRINT_W_PX - DEV_W_PX) / 2
    dev_cx = DEV_W_PX / 2

    svg = f'<g transform="translate({center_x}, {y_offset})">'
    svg += f'<rect class="device" x="0" y="46.5" width="{DEV_W_PX}" height="{dynamic_dev_h}"/>'

    svg += f'<text class="t-title" x="{dev_cx}" y="21.1">{escape(node.deviceNomenclature)}</text>'
    svg += f'<text class="t-meta" x="{dev_cx}" y="62.1">{escape(node.modelNumber)}</text>'
    svg += f'<text class="t-meta t-dim" x="{dev_cx}" y="80.6">{escape(node.rackName)}.RU{node.deviceRu}</text>'
    if node.ipAddress:
        svg += f'<text class="t-ip" x="{dev_cx}" y="99.1">{escape(node.ipAddress)}</text>'

    port_y_positions = {}

    # Inputs
    input_ports_with_io = all_input_ports + all_io_ports
    for i, (handle_id, port) in enumerate(input_ports_with_io):
        y_pos = PORT_START_Y + (i * PORT_LINE_HEIGHT)
        port_y_positions[handle_id] = y_offset + y_pos
        svg += f'<polygon class="arrow-in" points="{0},{y_pos} {2},{y_pos-2} {2},{y_pos+2}"/>'
        svg += f'<text class="t-port" x="7.7" y="{y_pos}" dominant-baseline="middle">{escape(port.name or "")}</text>'

    # Outputs
    output_ports_with_io = all_output_ports + all_io_ports
    for i, (handle_id, port) in enumerate(output_ports_with_io):
        y_pos = PORT_START_Y + (i * PORT_LINE_HEIGHT)
        port_y_positions[handle_id] = y_offset + y_pos
        svg += f'<polygon class="arrow-out" points="{DEV_W_PX},{y_pos} {DEV_W_PX-2},{y_pos-2} {DEV_W_PX-2},{y_pos+2}"/>'
        svg += f'<text class="t-port" x="{DEV_W_PX - 7.7}" y="{y_pos}" dominant-baseline="middle" text-anchor="end">{escape(port.name or "")}</text>'

    svg += '</g>'

    left_label_x = center_x - GAP_PX - LINE_LEN_PX - LAB_W_PX
    for edge in connected_inputs:
        y_mid = port_y_positions.get(edge.targetHandle)
        if y_mid:
            svg += f'<line class="connector" x1="{left_label_x + LAB_W_PX + GAP_PX}" y1="{y_mid}" x2="{center_x}" y2="{y_mid}"/>'
            svg += f'<rect class="label-box" x="{left_label_x}" y="{y_mid - LAB_H_PX/2}" width="{LAB_W_PX}" height="{LAB_H_PX}"/>'
            svg += f'<text class="t-port" x="{left_label_x + LAB_W_PX - 2}" y="{y_mid}" dominant-baseline="middle" text-anchor="end">{_get_port_label(node, edge.targetHandle)}</text>'

    right_label_x = center_x + DEV_W_PX + GAP_PX
    for edge in connected_outputs:
        y_mid = port_y_positions.get(edge.sourceHandle)
        if y_mid:
            svg += f'<line class="connector" x1="{center_x + DEV_W_PX}" y1="{y_mid}" x2="{right_label_x + LINE_LEN_PX}" y2="{y_mid}"/>'
            svg += f'<rect class="label-box" x="{right_label_x + LINE_LEN_PX}" y="{y_mid - LAB_H_PX/2}" width="{LAB_W_PX}" height="{LAB_H_PX}"/>'
            svg += f'<text class="t-port" x="{right_label_x + LINE_LEN_PX + 2}" y="{y_mid}" dominant-baseline="middle" text-anchor="start">{_get_port_label(node, edge.sourceHandle)}</text>'

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
          .t-title {{ font: 700 12pt '{FONT_FAMILY}',monospace; fill: {TITLE_COLOR}; text-anchor: middle; }}
          .t-meta  {{ font: 400 8pt  '{FONT_FAMILY}',monospace; fill: #000; text-anchor: middle; }}
          .t-dim   {{ fill: {GREY_COLOR}; }}
          .t-ip    {{ font: 700 8pt  '{FONT_FAMILY}',monospace; fill: {IP_ADDRESS_COLOR}; text-anchor: middle; }}
          .t-port  {{ font: 400 8pt  '{FONT_FAMILY}',monospace; fill: #000; }}
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
        all_input_ports = [p for p in node.ports.items() if 'in' in p[0]]
        all_output_ports = [p for p in node.ports.items() if 'out' in p[0]]
        all_io_ports = [p for p in node.ports.items() if 'io' in p[0]]
        max_ports_on_a_side = max(len(all_input_ports) + len(all_io_ports), len(all_output_ports) + len(all_io_ports))
        ports_list_height = max_ports_on_a_side * PORT_LINE_HEIGHT
        total_block_height = HEADER_AREA_H + ports_list_height + 47

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
        except Exception:
            pass

    with io.BytesIO() as pdf_buffer:
        pdf_writer.write(pdf_buffer)
        pdf_writer.close()
        return pdf_buffer.getvalue()
