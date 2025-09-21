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
SCALE_FACTOR = 0.8
DEV_W_PX = 240.564 * SCALE_FACTOR
LAB_H_MM = 4
LINE_LEN_MM = 8
GAP_MM = 4
BLOCK_V_SP_MM = 35

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
PORT_FONT_SIZE = 9
PORT_LINE_HEIGHT = 15
TITLE_HEIGHT = 25
HEADER_INTERNAL_HEIGHT = 60
PORT_LIST_PADDING = 15

# --- Helper Functions ---
def _get_port_label(node: Node, handle_id: str) -> str:
    port_name = handle_id or "Port"
    if handle_id and node.ports and handle_id in node.ports and node.ports[handle_id].name:
        port_name = node.ports[handle_id].name
    return f"{escape(node.deviceNomenclature)}.{escape(port_name)}"

def _estimate_text_width(text: str, font_size: float) -> float:
    return len(text) * font_size * 0.6 + 10

def _generate_device_svg(node: Node, connected_inputs: List[Edge], connected_outputs: List[Edge], y_offset: float) -> Tuple[str, float]:
    all_input_ports = sorted([p for p in node.ports.items() if 'in' in p[0]], key=lambda p: p[1].name or '')
    all_output_ports = sorted([p for p in node.ports.items() if 'out' in p[0]], key=lambda p: p[1].name or '')

    max_ports_on_a_side = max(len(all_input_ports), len(all_output_ports))

    ports_list_height = max_ports_on_a_side * PORT_LINE_HEIGHT
    dynamic_dev_h = HEADER_INTERNAL_HEIGHT + ports_list_height + (2 * PORT_LIST_PADDING)
    total_block_height = dynamic_dev_h + TITLE_HEIGHT

    center_x = (PRINT_W_PX - DEV_W_PX) / 2
    dev_cx = DEV_W_PX / 2

    svg = f'<g transform="translate({center_x}, {y_offset})">'
    svg += f'<text class="t-title" x="{dev_cx}" y="0">{escape(node.deviceNomenclature)}</text>'

    box_y_offset = TITLE_HEIGHT
    svg += f'<rect class="device" x="0" y="{box_y_offset}" width="{DEV_W_PX}" height="{dynamic_dev_h}"/>'

    svg += f'<text class="t-meta" x="{dev_cx}" y="{box_y_offset + 20}">{escape(node.modelNumber)}</text>'
    svg += f'<text class="t-meta t-dim" x="{dev_cx}" y="{box_y_offset + 35}">{escape(node.rackName)}.RU{node.deviceRu}</text>'
    if node.ipAddress:
        svg += f'<text class="t-ip" x="{dev_cx}" y="{box_y_offset + 50}">{escape(node.ipAddress)}</text>'

    ports_y_start = box_y_offset + HEADER_INTERNAL_HEIGHT + PORT_LIST_PADDING
    port_y_positions = {}

    for i, (handle_id, port) in enumerate(all_input_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[handle_id] = y_offset + y_pos
        svg += f'<polygon class="arrow-in" points="{0},{y_pos} {5},{y_pos-5} {5},{y_pos+5}"/>'
        svg += f'<text class="t-port" x="12" y="{y_pos}" dominant-baseline="middle">{escape(port.name or "")}</text>'

    for i, (handle_id, port) in enumerate(all_output_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[handle_id] = y_offset + y_pos
        svg += f'<polygon class="arrow-out" points="{DEV_W_PX},{y_pos} {DEV_W_PX-5},{y_pos-5} {DEV_W_PX-5},{y_pos+5}"/>'
        svg += f'<text class="t-port" x="{DEV_W_PX - 12}" y="{y_pos}" dominant-baseline="middle" text-anchor="end">{escape(port.name or "")}</text>'

    svg += '</g>'

    left_label_x_base = center_x - GAP_PX - LINE_LEN_PX
    for edge in connected_inputs:
        y_mid = port_y_positions.get(edge.targetHandle)
        if y_mid:
            label_text = _get_port_label(node, edge.targetHandle)
            text_width = _estimate_text_width(label_text, PORT_FONT_SIZE)
            rect_x = left_label_x_base - text_width
            svg += f'<line class="connector" x1="{left_label_x_base}" y1="{y_mid}" x2="{center_x}" y2="{y_mid}"/>'
            svg += f'<rect class="label-box" x="{rect_x}" y="{y_mid - LAB_H_PX/2}" width="{text_width}" height="{LAB_H_PX}"/>'
            svg += f'<text class="label-text" x="{rect_x + text_width / 2}" y="{y_mid}">{label_text}</text>'

    right_label_x_base = center_x + DEV_W_PX + GAP_PX
    for edge in connected_outputs:
        y_mid = port_y_positions.get(edge.sourceHandle)
        if y_mid:
            label_text = _get_port_label(node, edge.sourceHandle)
            text_width = _estimate_text_width(label_text, PORT_FONT_SIZE)
            svg += f'<line class="connector" x1="{center_x + DEV_W_PX}" y1="{y_mid}" x2="{right_label_x_base + LINE_LEN_PX}" y2="{y_mid}"/>'
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
          .t-title {{ font: 700 12pt '{FONT_FAMILY}',monospace; fill: {TITLE_COLOR}; text-anchor: middle; }}
          .t-meta  {{ font: 400 8pt  '{FONT_FAMILY}',monospace; fill: #000; text-anchor: middle; }}
          .t-dim   {{ fill: {GREY_COLOR}; }}
          .t-ip    {{ font: 700 8pt  '{FONT_FAMILY}',monospace; fill: {IP_ADDRESS_COLOR}; text-anchor: middle; }}
          .t-port  {{ font: 400 {PORT_FONT_SIZE}pt  '{FONT_FAMILY}',monospace; fill: #000; }}
          .label-text {{ font: 400 {PORT_FONT_SIZE-1}pt  '{FONT_FAMILY}',monospace; fill: #000; text-anchor: middle; dominant-baseline: middle; }}
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
        except Exception:
            pass

    with io.BytesIO() as pdf_buffer:
        pdf_writer.write(pdf_buffer)
        pdf_writer.close()
        return pdf_buffer.getvalue()
