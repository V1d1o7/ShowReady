import io
import cairosvg
from pypdf import PdfWriter, PdfReader
from typing import List, Tuple, Dict
from xml.sax.saxutils import escape

from app.schemas.wire_export import Graph, Node

DPI, MM_PER_INCH = 96, 25.4
def mm_to_px(mm): return (mm / MM_PER_INCH) * DPI

PAGE_SIZES = {"Letter": (279.4, 215.9), "A4": (297, 210), "Legal": (355.6, 215.9), "Tabloid": (431.8, 279.4)}
MARGIN_MM = 10
SCALE_FACTOR = 0.7
DEV_W_PX = 240.564 * SCALE_FACTOR
LAB_H_MM, LINE_LEN_MM, GAP_MM, BLOCK_V_SP_MM = 3.5, 4, 2, 20
LAB_H_PX, LINE_LEN_PX, GAP_PX, BLOCK_V_SP_PX = mm_to_px(LAB_H_MM), mm_to_px(LINE_LEN_MM), mm_to_px(GAP_MM), mm_to_px(BLOCK_V_SP_MM)

# Styles
TITLE_COLOR, BLACK_COLOR, GREY_COLOR, IP_ADDRESS_COLOR = "#f59e0b", "#000000", "#666666", "#3f007f"
INPUT_ARROW_COLOR, OUTPUT_ARROW_COLOR, CONNECTION_LABEL_COLOR = "#5fbf00", "#bf0000", "#f59e0b"
FONT_FAMILY = "'Space Mono', 'Ubuntu Mono', monospace"
TITLE_FONT_SIZE, META_FONT_SIZE, PORT_FONT_SIZE = 12 * SCALE_FACTOR, 9 * SCALE_FACTOR, 9 * SCALE_FACTOR
PORT_LINE_HEIGHT, TITLE_AREA_HEIGHT, HEADER_INTERNAL_HEIGHT, PORT_LIST_PADDING = 20 * SCALE_FACTOR, 15 * SCALE_FACTOR, 70 * SCALE_FACTOR, 15 * SCALE_FACTOR

def _get_connection_label(edge, is_source, graph):
    nodes_by_id = {node.id: node for node in graph.nodes}
    remote_node_id = edge.target if is_for_source else edge.source
    remote_handle_id = edge.targetHandle if is_for_source else edge.sourceHandle
    remote_node = nodes_by_id.get(remote_node_id)
    if not remote_node: return "Unknown.Device"
    port_name = next((p.name for h, p in remote_node.ports.items() if h == remote_handle_id), remote_handle_id)
    return f"{escape(remote_node.deviceNomenclature)}.{escape(port_name or '')}"

def _estimate_text_width(text, font_size): return len(text) * font_size * 0.6 + 20

def _generate_device_svg(node, graph, x_offset, y_offset):
    all_ports = node.ports.items()
    input_ports = sorted([p for p in all_ports if 'in' in p[0]], key=lambda p: p[1].name or '')
    output_ports = sorted([p for p in all_ports if 'out' in p[0]], key=lambda p: p[1].name or '')
    io_ports = sorted([p for p in all_ports if 'io' in p[0]], key=lambda p: p[1].name or '')

    ports_on_left = input_ports + io_ports
    ports_on_right = output_ports + io_ports
    max_ports = max(len(ports_on_left), len(ports_on_right))

    ports_list_height = max_ports * PORT_LINE_HEIGHT
    dynamic_dev_h = HEADER_INTERNAL_HEIGHT + ports_list_height + (2 * PORT_LIST_PADDING)
    total_block_height = dynamic_dev_h + TITLE_AREA_HEIGHT
    dev_cx = x_offset + DEV_W_PX / 2

    svg = f'<g>'
    svg += f'<text class="t-title" x="{dev_cx}" y="{y_offset}">{escape(node.deviceNomenclature)}</text>'
    box_y = y_offset + TITLE_AREA_HEIGHT
    svg += f'<rect class="device" x="{x_offset}" y="{box_y}" width="{DEV_W_PX}" height="{dynamic_dev_h}"/>'
    svg += f'<text class="t-meta" x="{dev_cx}" y="{box_y + 20}">{escape(node.modelNumber)}</text>'
    svg += f'<text class="t-meta t-dim" x="{dev_cx}" y="{box_y + 35}">{escape(node.rackName)}.RU{node.deviceRu}</text>'
    if node.ipAddress: svg += f'<text class="t-ip" x="{dev_cx}" y="{box_y + 50}">{escape(node.ipAddress)}</text>'

    ports_y_start = box_y + HEADER_INTERNAL_HEIGHT + PORT_LIST_PADDING
    port_y_positions = {}
    for i, (h, p) in enumerate(ports_on_left):
        y = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[h] = y
        svg += f'<polygon class="arrow-in" points="{x_offset+2},{y} {x_offset+8},{y-4} {x_offset+8},{y+4}"/>'
        svg += f'<text class="t-port" x="{x_offset+14}" y="{y}">{escape(p.name or "")}</text>'
    for i, (h, p) in enumerate(ports_on_right):
        y = ports_y_start + (i * PORT_LINE_HEIGHT)
        port_y_positions[h] = y
        svg += f'<polygon class="arrow-out" points="{x_offset+DEV_W_PX-2},{y} {x_offset+DEV_W_PX-8},{y-4} {x_offset+DEV_W_PX-8},{y+4}"/>'
        svg += f'<text class="t-port" x="{x_offset+DEV_W_PX-14}" y="{y}" text-anchor="end">{escape(p.name or "")}</text>'

    for edge in [e for e in graph.edges if e.target == node.id]:
        y_mid = port_y_positions.get(edge.targetHandle)
        if y_mid:
            label_text = _get_connection_label(edge, False, graph)
            text_w = _estimate_text_width(label_text, PORT_FONT_SIZE)
            rect_x = x_offset - GAP_PX - LINE_LEN_PX - text_w
            svg += f'<line class="connector" x1="{rect_x + text_w}" y1="{y_mid}" x2="{x_offset}" y2="{y_mid}"/>'
            svg += f'<rect class="label-box" x="{rect_x}" y="{y_mid - LAB_H_PX/2}" width="{text_w}" height="{LAB_H_PX}"/>'
            svg += f'<text class="label-text" x="{rect_x + text_w/2}" y="{y_mid}">{label_text}</text>'
    for edge in [e for e in graph.edges if e.source == node.id]:
        y_mid = port_y_positions.get(edge.sourceHandle)
        if y_mid:
            label_text = _get_connection_label(edge, True, graph)
            text_w = _estimate_text_width(label_text, PORT_FONT_SIZE)
            rect_x = x_offset + DEV_W_PX + GAP_PX + LINE_LEN_PX
            svg += f'<line class="connector" x1="{x_offset + DEV_W_PX}" y1="{y_mid}" x2="{rect_x}" y2="{y_mid}"/>'
            svg += f'<rect class="label-box" x="{rect_x}" y="{y_mid - LAB_H_PX/2}" width="{text_w}" height="{LAB_H_PX}"/>'
            svg += f'<text class="label-text" x="{rect_x + text_w/2}" y="{y_mid}">{label_text}</text>'
    svg += '</g>'
    return svg, total_block_height

def _generate_svg_page(content, page_w_px, page_h_px, graph):
    return f"""
<svg width="{page_w_px}px" height="{page_h_px}px" viewBox="0 0 {page_w_px} {page_h_px}" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <style>
          .device {{ fill: none; stroke: #000; stroke-width: 1; }}
          .connector {{ fill: none; stroke: #000; stroke-width: 0.75; }}
          .label-box {{ fill: {CONNECTION_LABEL_COLOR}; stroke: none; }}
          .arrow-in {{ fill: {INPUT_ARROW_COLOR}; }} .arrow-out {{ fill: {OUTPUT_ARROW_COLOR}; }}
          .t-title {{ font: 700 {TITLE_FONT_SIZE}pt {FONT_FAMILY},monospace; fill: {TITLE_COLOR}; text-anchor: middle; dominant-baseline:hanging; }}
          .t-meta  {{ font: 400 {META_FONT_SIZE}pt {FONT_FAMILY},monospace; fill: #000; text-anchor: middle; }}
          .t-dim   {{ fill: {GREY_COLOR}; }} .t-ip {{ font: 700 {META_FONT_SIZE}pt {FONT_FAMILY},monospace; fill: {IP_ADDRESS_COLOR}; text-anchor: middle; }}
          .t-port  {{ font: 400 {PORT_FONT_SIZE}pt {FONT_FAMILY},monospace; fill: #000; dominant-baseline:middle; }}
          .label-text {{ font: 400 {PORT_FONT_SIZE-1}pt {FONT_FAMILY},monospace; fill: #000; text-anchor: middle; dominant-baseline: middle; }}
        </style>
    </defs>
    <g transform="translate({mm_to_px(MARGIN_MM)}, {mm_to_px(MARGIN_MM)})">{content}</g>
</svg>"""

def build_pdf_bytes(graph: Graph) -> bytes:
    if not graph.nodes: return b""
    page_dims = PAGE_SIZES.get(graph.page_size, PAGE_SIZES["Letter"])
    page_w_px, page_h_px = mm_to_px(page_dims["w"]), mm_to_px(page_dims["h"])
    print_h_px, print_w_px = page_h_px - (2 * mm_to_px(MARGIN_MM)), page_w_px - (2 * mm_to_px(MARGIN_MM))

    num_cols = max(1, int(print_w_px / (DEV_W_PX + (2 * (GAP_PX + LINE_LEN_PX + 100))))) # Dynamic columns
    col_width = print_w_px / num_cols

    pages_content, current_page_svg, col_y_cursors = [], "", [0] * num_cols
    for node in graph.nodes:
        ports = node.ports.items()
        max_ports = max(len([p for p in ports if 'in' in p[0]]), len([p for p in ports if 'out' in p[0]]))
        total_h = HEADER_INTERNAL_HEIGHT + (max_ports * PORT_LINE_HEIGHT) + (2 * PORT_LIST_PADDING) + TITLE_AREA_HEIGHT

        target_col = min(range(num_cols), key=lambda i: col_y_cursors[i])
        if col_y_cursors[target_col] > 0 and col_y_cursors[target_col] + total_h > print_h_px:
            pages_content.append(current_page_svg)
            current_page_svg, col_y_cursors = "", [0] * num_cols
            target_col = 0

        x = (target_col * col_width) + (col_width - DEV_W_PX) / 2
        y = col_y_cursors[target_col]
        device_svg, h = _generate_device_svg(node, graph, x, y)
        current_page_svg += device_svg
        col_y_cursors[target_col] += h + BLOCK_V_SP_PX

    if current_page_svg: pages_content.append(current_page_svg)

    pdf_writer = PdfWriter()
    for svg_content in pages_content:
        full_svg = _generate_svg_page(svg_content, page_w_px, page_h_px, graph)
        try:
            pdf_bytes = cairosvg.svg2pdf(bytestring=full_svg.encode('utf-8'))
            pdf_reader = PdfReader(io.BytesIO(pdf_bytes))
            pdf_writer.add_page(pdf_reader.pages[0])
        except Exception: pass

    with io.BytesIO() as pdf_buffer:
        pdf_writer.write(pdf_buffer)
        pdf_writer.close()
        return pdf_buffer.getvalue()
