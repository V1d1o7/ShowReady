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

# Page dimensions (US Letter Landscape)
PAGE_W_MM = 279.4
PAGE_H_MM = 215.9
MARGIN_MM = 10

PAGE_W_PX = mm_to_px(PAGE_W_MM)
PAGE_H_PX = mm_to_px(PAGE_H_MM)
MARGIN_PX = mm_to_px(MARGIN_MM)

# Printable area
PRINT_W_PX = PAGE_W_PX - (2 * MARGIN_PX)
PRINT_H_PX = PAGE_H_PX - (2 * MARGIN_PX)

# Component dimensions
DEV_W_MM = 63.7
# DEV_H_MM is now calculated dynamically based on port count
CONTENT_TOP_MM = 12.3
# CONTENT_H_MM is also dynamic
LAB_W_MM = 66.1
LAB_H_MM = 14.8
LINE_LEN_MM = 8
GAP_MM = 4
BLOCK_V_SP_MM = 6

DEV_W_PX = mm_to_px(DEV_W_MM)
# DEV_H_PX is dynamic
CONTENT_TOP_PX = mm_to_px(CONTENT_TOP_MM)
# CONTENT_H_PX is dynamic
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
HEADER_HEIGHT = 75 # Estimated height for the top part of the device card
PORT_LIST_PADDING = 10 # Padding above and below the list of ports

# SVG paths for arrows
ARROW_RIGHT_PATH = "m0,3.5l5,-3.5l-5,-3.5l0,7z"
ARROW_LEFT_PATH = "m5,3.5l-5,-3.5l5,-3.5l0,7z"


# --- Helper Functions ---

def _get_handle_num(handle_id: str) -> int:
    if not handle_id: return 0
    match = re.search(r'(\d+)$', handle_id)
    return int(match.group(1)) if match else 0

def _get_port_label(node: Node, handle_id: str) -> str:
    port_name = handle_id or "Port"
    if handle_id and node.ports and handle_id in node.ports and node.ports[handle_id].name:
        port_name = node.ports[handle_id].name
    return f"{escape(node.deviceNomenclature)}.{escape(port_name)}"

def _vertically_distribute(index: int, count: int, y_start: float, height: float, item_height: float) -> float:
    if count <= 0: return y_start + height / 2
    if count == 1:
        return y_start + height / 2

    total_items_height = count * item_height
    if total_items_height > height:
        return y_start + (index * item_height) + (item_height / 2)

    spacing = (height - total_items_height) / (count -1 if count > 1 else 1)
    return y_start + (index * (item_height + spacing)) + (item_height / 2)


def _generate_device_svg(node: Node, connected_inputs: List[Edge], connected_outputs: List[Edge], y_offset: float) -> Tuple[str, float]:
    # --- DYNAMIC HEIGHT CALCULATION ---
    all_input_ports = sorted([p for p in node.ports.items() if p[0].startswith('port-in-')], key=lambda p: p[1].name or '')
    all_output_ports = sorted([p for p in node.ports.items() if p[0].startswith('port-out-')], key=lambda p: p[1].name or '')
    max_ports_on_a_side = max(len(all_input_ports), len(all_output_ports))

    ports_list_height = max_ports_on_a_side * PORT_LINE_HEIGHT
    dynamic_dev_h = HEADER_HEIGHT + ports_list_height + (2 * PORT_LIST_PADDING)
    content_h_for_labels = dynamic_dev_h - CONTENT_TOP_PX

    center_x = (PRINT_W_PX - DEV_W_PX) / 2

    svg = f'<rect x="{center_x}" y="{y_offset}" width="{DEV_W_PX}" height="{dynamic_dev_h}" fill="{WHITE_COLOR}" stroke="{BLACK_COLOR}" stroke-width="2"/>'
    svg += f'<rect x="{center_x}" y="{y_offset}" width="{DEV_W_PX}" height="{CONTENT_TOP_PX}" fill="#f0f0f0" />'

    svg += f'<text x="{center_x + DEV_W_PX / 2}" y="{y_offset + 15}" text-anchor="middle" class="device-title">{escape(node.deviceNomenclature)}</text>'
    svg += f'<text x="{center_x + 10}" y="{y_offset + 35}" class="device-text">{escape(node.modelNumber)}</text>'
    svg += f'<text x="{center_x + 10}" y="{y_offset + 50}" class="device-text-grey">{escape(node.rackName)}.RU{node.deviceRu}</text>'
    if node.ipAddress:
        svg += f'<text x="{center_x + 10}" y="{y_offset + 65}" class="device-ip">{escape(node.ipAddress)}</text>'

    ports_y_start = y_offset + HEADER_HEIGHT + PORT_LIST_PADDING

    for i, (handle_id, port) in enumerate(all_input_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        svg += f'<path transform="translate({center_x + 8}, {y_pos - 3.5})" d="{ARROW_RIGHT_PATH}" fill="{INPUT_ARROW_COLOR}"/>'
        svg += f'<text x="{center_x + 20}" y="{y_pos}" class="port-text">{escape(port.name or "")}</text>'

    for i, (handle_id, port) in enumerate(all_output_ports):
        y_pos = ports_y_start + (i * PORT_LINE_HEIGHT)
        svg += f'<path transform="translate({center_x + DEV_W_PX - 13}, {y_pos - 3.5})" d="{ARROW_LEFT_PATH}" fill="{OUTPUT_ARROW_COLOR}"/>'
        svg += f'<text x="{center_x + DEV_W_PX - 20}" y="{y_pos}" text-anchor="end" class="port-text">{escape(port.name or "")}</text>'

    content_y_for_labels = y_offset + CONTENT_TOP_PX

    left_label_x = center_x - GAP_PX - LINE_LEN_PX - LAB_W_PX
    line_start_x = left_label_x + LAB_W_PX
    line_end_x = line_start_x + LINE_LEN_PX

    for i, edge in enumerate(connected_inputs):
        y_mid = _vertically_distribute(i, len(connected_inputs), content_y_for_labels, content_h_for_labels, LAB_H_PX)
        label_text = _get_port_label(node, edge.targetHandle)
        svg += f'<rect x="{left_label_x}" y="{y_mid - LAB_H_PX/2}" width="{LAB_W_PX}" height="{LAB_H_PX}" fill="{AMBER_COLOR}" stroke="{BLACK_COLOR}" stroke-width="1"/>'
        svg += f'<text x="{left_label_x + LAB_W_PX/2}" y="{y_mid}" class="label-text">{label_text}</text>'
        svg += f'<line x1="{line_start_x}" y1="{y_mid}" x2="{line_end_x}" y2="{y_mid}" stroke="{BLACK_COLOR}" stroke-width="1.5"/>'

    right_label_x = center_x + DEV_W_PX + GAP_PX + LINE_LEN_PX
    line_start_x = right_label_x - LINE_LEN_PX
    line_end_x = right_label_x

    for i, edge in enumerate(connected_outputs):
        y_mid = _vertically_distribute(i, len(connected_outputs), content_y_for_labels, content_h_for_labels, LAB_H_PX)
        label_text = _get_port_label(node, edge.sourceHandle)
        svg += f'<rect x="{right_label_x}" y="{y_mid - LAB_H_PX/2}" width="{LAB_W_PX}" height="{LAB_H_PX}" fill="{AMBER_COLOR}" stroke="{BLACK_COLOR}" stroke-width="1"/>'
        svg += f'<text x="{right_label_x + LAB_W_PX/2}" y="{y_mid}" class="label-text">{label_text}</text>'
        svg += f'<line x1="{line_start_x}" y1="{y_mid}" x2="{line_end_x}" y2="{y_mid}" stroke="{BLACK_COLOR}" stroke-width="1.5"/>'

    return svg, dynamic_dev_h

def _generate_svg_page(content: str) -> str:
    return f"""
<svg width="{PAGE_W_PX}px" height="{PAGE_H_PX}px" viewBox="0 0 {PAGE_W_PX} {PAGE_H_PX}"
     xmlns="http://www.w3.org/2000/svg">
    <style>
        .device-title {{ font-family: {FONT_FAMILY}; font-size: 14px; font-weight: bold; fill: {AMBER_COLOR}; text-anchor: middle; }}
        .device-text {{ font-family: {FONT_FAMILY}; font-size: 12px; fill: {BLACK_COLOR}; }}
        .device-text-grey {{ font-family: {FONT_FAMILY}; font-size: 12px; fill: {GREY_COLOR}; }}
        .device-ip {{ font-family: {FONT_FAMILY}; font-size: 12px; font-weight: bold; fill: {DARK_PURPLE_COLOR}; }}
        .label-text {{ font-family: {FONT_FAMILY}; font-size: 10px; text-anchor: middle; dominant-baseline: central; }}
        .port-text {{ font-family: {FONT_FAMILY}; font-size: {PORT_FONT_SIZE}px; fill: {BLACK_COLOR}; dominant-baseline: middle; }}
    </style>
    <g transform="translate({MARGIN_PX}, {MARGIN_PX})">
        {content}
    </g>
</svg>
"""

def build_pdf_bytes(graph: Graph) -> bytes:
    print("\n" + "="*50)
    print("[DEBUG] Starting build_pdf_bytes")
    print("="*50)
    print(f"[DEBUG] Received graph with {len(graph.nodes)} nodes and {len(graph.edges)} edges.")
    try:
        graph_dict = graph.dict()
        print(f"[DEBUG] Full graph data:\n{json.dumps(graph_dict, indent=2)}")
    except Exception as e:
        print(f"[DEBUG] Could not serialize graph object: {e}")

    if not graph.nodes:
        return b""

    node_to_inputs: Dict[str, List[Edge]] = {node.id: [] for node in graph.nodes}
    node_to_outputs: Dict[str, List[Edge]] = {node.id: [] for node in graph.nodes}
    for edge in graph.edges:
        if edge.target in node_to_inputs:
            node_to_inputs[edge.target].append(edge)
        if edge.source in node_to_outputs:
            node_to_outputs[edge.source].append(edge)

    for node_id in node_to_inputs:
        node_to_inputs[node_id].sort(key=lambda e: _get_handle_num(e.targetHandle))
    for node_id in node_to_outputs:
        node_to_outputs[node_id].sort(key=lambda e: _get_handle_num(e.sourceHandle))

    pages_content = []
    current_page_svg = ""
    y_cursor = 0
    page_num = 1

    for i, node in enumerate(graph.nodes):
        all_input_ports = [p for p in node.ports.items() if p[0].startswith('port-in-')]
        all_output_ports = [p for p in node.ports.items() if p[0].startswith('port-out-')]
        max_ports_on_a_side = max(len(all_input_ports), len(all_output_ports))
        ports_list_height = max_ports_on_a_side * PORT_LINE_HEIGHT
        dynamic_dev_h = HEADER_HEIGHT + ports_list_height + (2 * PORT_LIST_PADDING)

        if y_cursor > 0 and y_cursor + dynamic_dev_h > PRINT_H_PX:
            pages_content.append(current_page_svg)
            current_page_svg = ""
            y_cursor = 0
            page_num += 1

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
            print(f"[ERROR] Failed to convert or merge page {i+1}: {e}")
            pass

    with io.BytesIO() as pdf_buffer:
        pdf_writer.write(pdf_buffer)
        pdf_writer.close()
        final_bytes = pdf_buffer.getvalue()
        print(f"[DEBUG] Final PDF size: {len(final_bytes)} bytes. build_pdf_bytes finished.")
        print("="*50 + "\n")
        return final_bytes
