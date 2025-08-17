import io
from typing import List, Dict, Optional, Union

from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.lib.enums import TA_CENTER

from .models import LoomLabel, CaseLabel

# --- Color Map for parsing color strings ---
COLOR_MAP = {
    'red': '#FF0000', 'orange': '#FFA500', 'yellow': '#FFFF00', 'green': '#008000', 
    'blue': '#0000FF', 'indigo': '#4B0082', 'violet': '#EE82EE', 'black': '#000000', 
    'white': '#FFFFFF', 'gray': '#808080', 'silver': '#C0C0C0', 'maroon': '#800000',
    'olive': '#808000', 'lime': '#00FF00', 'aqua': '#00FFFF', 'teal': '#008080',
    'navy': '#000080', 'fuchsia': '#FF00FF', 'purple': '#800080'
}

def parse_color(color_string: Optional[str]) -> colors.Color:
    """Parses a color string (name or hex) into a reportlab Color object."""
    if not color_string:
        return colors.black
    color_string = color_string.lower().strip()
    hex_val = COLOR_MAP.get(color_string)
    if not hex_val and color_string.startswith('#') and len(color_string) in [4, 7]:
        hex_val = color_string
    
    if not hex_val:
        return colors.black

    hex_val = hex_val.lstrip('#')
    if len(hex_val) == 3:
        hex_val = "".join([c*2 for c in hex_val])
    
    try:
        r, g, b = (int(hex_val[i:i+2], 16) / 255.0 for i in (0, 2, 4))
        return colors.Color(r, g, b)
    except (ValueError, IndexError):
        return colors.black

def generate_loom_label_pdf(labels: List[LoomLabel], placement: Optional[Dict[str, int]] = None) -> io.BytesIO:
    """Generates a PDF for loom labels in a BytesIO buffer."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    LABEL_WIDTH, LABEL_HEIGHT = 2.5 * inch, 1 * inch
    TOP_MARGIN, LEFT_MARGIN = 0.625 * inch, 0.325 * inch
    HORIZONTAL_SPACING, VERTICAL_SPACING = 0.175 * inch, 0.25 * inch
    CORNER_RADIUS = 0.0625 * inch
    NUM_COLUMNS = 3

    labels_to_draw = []
    if placement:
        # Convert string keys from JSON to integers for sorting and calculation
        int_placement = {int(k): v for k, v in placement.items()}
        for slot, label_index in sorted(int_placement.items()):
            if 0 <= label_index < len(labels):
                labels_to_draw.append((slot, labels[label_index]))
    else:
        labels_to_draw = list(enumerate(labels))

    for slot, label in labels_to_draw:
        if slot >= 24: continue

        # Corrected calculation for row-major order to match the UI grid
        row = slot // NUM_COLUMNS
        col = slot % NUM_COLUMNS
        
        x = LEFT_MARGIN + (col * (LABEL_WIDTH + HORIZONTAL_SPACING))
        y = height - TOP_MARGIN - (row * (LABEL_HEIGHT + VERTICAL_SPACING)) - LABEL_HEIGHT
        
        center_x, center_y = x + LABEL_WIDTH / 2, y + LABEL_HEIGHT / 2
        font_size = 14
        c.setFont("Helvetica-Bold", font_size)
        c.setFillColor(colors.black)
        c.drawCentredString(center_x, center_y - (font_size * 0.25), label.loom_name or 'N/A')
        
        bar_color = parse_color(label.color)
        c.setFillColor(bar_color)
        bar_height, bar_y_offset = 0.05 * inch, 0.18 * inch
        c.roundRect(x, center_y + bar_y_offset, LABEL_WIDTH, bar_height, CORNER_RADIUS, fill=1, stroke=0)
        c.roundRect(x, center_y - bar_y_offset - bar_height, LABEL_WIDTH, bar_height, CORNER_RADIUS, fill=1, stroke=0)
        
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.black)
        padding, bottom_y = 0.08 * inch, y + 0.1 * inch
        c.drawString(x + padding, bottom_y, f"SRC: {label.source or 'N/A'}")
        c.drawRightString(x + LABEL_WIDTH - padding, bottom_y, f"DST: {label.destination or 'N/A'}")

    c.showPage()
    c.save()
    
    buffer.seek(0)
    return buffer

def draw_single_case_label(c, label_index: int, image_data: Optional[bytes], send_to_text: str, contents_text: str):
    """Draws a single case label onto the canvas."""
    LABEL_WIDTH = 8.5 * inch
    LABEL_HEIGHT = 5.5 * inch
    y_start = LABEL_HEIGHT if label_index % 2 == 0 else 0
    padding = 0.25 * inch
    center_x = LABEL_WIDTH / 2
    c.setStrokeColor(colors.lightgrey)
    c.setLineWidth(2)
    corner_radius = 0.1 * inch
    box_x, box_y = padding, y_start + padding
    box_width, box_height = LABEL_WIDTH - (2 * padding), LABEL_HEIGHT - (2 * padding)
    c.roundRect(box_x, box_y, box_width, box_height, corner_radius, stroke=1, fill=0)
    h_line_y = y_start + LABEL_HEIGHT - (2.0 * inch)
    c.line(box_x, h_line_y, box_x + box_width, h_line_y)
    v_line_x = 4.5 * inch
    c.line(v_line_x, h_line_y, v_line_x, box_y + box_height)
    
    if image_data:
        try:
            image_reader = ImageReader(io.BytesIO(image_data))
            img_box_width, img_box_height = v_line_x - box_x, (box_y + box_height) - h_line_y
            img_box_center_x, img_box_center_y = box_x + (img_box_width / 2), h_line_y + (img_box_height / 2)
            max_img_width, max_img_height = 4.0 * inch, 1.6 * inch
            img_width, img_height = image_reader.getSize()
            ratio = min(max_img_width / img_width, max_img_height / img_height)
            new_width, new_height = img_width * ratio, img_height * ratio
            img_x, img_y = img_box_center_x - (new_width / 2), img_box_center_y - (new_height / 2)
            c.drawImage(image_reader, img_x, img_y, width=new_width, height=new_height, mask='auto')
        except Exception as e:
            c.setFont("Helvetica", 10)
            c.drawCentredString(box_x + (v_line_x - box_x)/2, h_line_y + 0.5*inch, f"Image failed to load: {e}")

    c.setFillColor(colors.black)
    c.setFont("Helvetica", 20)
    c.drawString(v_line_x + (0.1 * inch), (box_y + box_height) - (0.3 * inch), "SEND TO:")
    font_size = 48
    text_to_draw = send_to_text.upper()
    max_text_width = (box_x + box_width) - v_line_x - (0.2 * inch)
    while c.stringWidth(text_to_draw, "Helvetica-Bold", font_size) > max_text_width and font_size > 8: font_size -= 1
    c.setFont("Helvetica-Bold", font_size)
    send_to_box_center_x = v_line_x + ((box_x + box_width - v_line_x) / 2)
    c.drawCentredString(send_to_box_center_x, y_start + LABEL_HEIGHT - (1.35 * inch), text_to_draw)
    c.setFont("Helvetica", 20)
    c.drawString(padding + (0.1 * inch), h_line_y - (0.3 * inch), "CONTENTS:")
    
    style_body = ParagraphStyle(
        name='BodyText',
        fontName='Helvetica-Bold',
        fontSize=28,
        leading=34,
        alignment=TA_CENTER
    )
    
    p = Paragraph((contents_text or "").replace('\n', '<br/>').upper(), style=style_body)
    p_width, p_height = p.wrapOn(c, LABEL_WIDTH - (2 * padding) - 0.2 * inch, h_line_y - box_y - 0.5 * inch)
    p.drawOn(c, center_x - p_width / 2, h_line_y - 0.5 * inch - p_height)

def generate_case_label_pdf(labels: List[CaseLabel], logo_bytes: Optional[bytes] = None, placement: Optional[Dict[str, int]] = None) -> io.BytesIO:
    """Generates a PDF for case labels in a BytesIO buffer."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    
    labels_to_draw = []
    if placement:
        # Convert string keys from JSON to integers for sorting and calculation
        int_placement = {int(k): v for k, v in placement.items()}
        for slot_index, label_index in sorted(int_placement.items()):
            if 0 <= label_index < len(labels):
                labels_to_draw.append((slot_index, labels[label_index]))
    else:
        labels_to_draw = list(enumerate(labels))

    for i, (slot_index_or_label_index, label_info) in enumerate(labels_to_draw):
        slot_index = slot_index_or_label_index if placement else i % 2
        draw_single_case_label(c, slot_index, logo_bytes, label_info.send_to, label_info.contents)
        
        # If it's the second label on a page, or the very last label, create a new page
        if slot_index == 1 or i == len(labels_to_draw) - 1:
            c.showPage()

    c.save()
    buffer.seek(0)
    return buffer

from .models import WireDiagramPDFPayload
from reportlab.lib.pagesizes import letter, legal, A4, elevenSeventeen

PAGE_SIZES = {
    "letter": letter,
    "legal": legal,
    "tabloid": elevenSeventeen,
    "a4": A4,
}

def generate_wire_diagram_pdf(payload: WireDiagramPDFPayload) -> io.BytesIO:
    buffer = io.BytesIO()
    page_size = PAGE_SIZES.get(payload.page_size.lower(), letter)
    c = canvas.Canvas(buffer, pagesize=page_size)
    width, height = page_size

    LEFT_MARGIN = 0.25 * inch
    RIGHT_MARGIN = 0.25 * inch
    TOP_MARGIN = 0.25 * inch
    BOTTOM_MARGIN = 0.25 * inch
    TITLE_BLOCK_WIDTH = 1.25 * inch

    draw_area_x_start = TITLE_BLOCK_WIDTH + LEFT_MARGIN

    c.saveState()
    c.setStrokeColor(colors.grey)
    c.setLineWidth(1)
    c.rect(LEFT_MARGIN, BOTTOM_MARGIN, TITLE_BLOCK_WIDTH, height - TOP_MARGIN - BOTTOM_MARGIN)
    c.translate(LEFT_MARGIN + TITLE_BLOCK_WIDTH / 2, height - TOP_MARGIN)
    c.rotate(-90)
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(colors.black)
    c.drawCentredString(0, -TITLE_BLOCK_WIDTH / 2 - 6, payload.show_name)
    c.restoreState()
    
    node_map = {node.id: node for node in payload.nodes}
    port_map = {}

    for node in payload.nodes:
        node_x = draw_area_x_start + node.position.x
        node_y = height - TOP_MARGIN - node.position.y - node.height
        if node_y < BOTTOM_MARGIN or node_y > height - TOP_MARGIN: continue

        port_map[node.id] = {}
        c.setStrokeColorRGB(0.6, 0.6, 0.6)
        c.setFillColorRGB(0.15, 0.15, 0.18)
        c.roundRect(node_x, node_y, node.width, node.height, 4, stroke=1, fill=1)
        c.setFillColorRGB(0.1, 0.1, 0.1)
        c.roundRect(node_x, node_y + node.height - 28, node.width, 28, 4, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(node_x + 10, node_y + node.height - 18, node.data.label)
        c.setFont("Helvetica", 7)
        c.setFillColorRGB(0.8, 0.8, 0.8)
        c.drawString(node_x + 8, node_y + node.height - 45, f"IP: {node.data.ip_address or 'N/A'}")
        c.drawString(node_x + 8, node_y + node.height - 58, f"Loc: {node.data.rack_name or ''} / RU {node.data.ru_position or ''}")

        port_spacing = 25
        port_start_y = node_y + node.height - 80
        
        # Use the correct field names: 'label' and 'type'
        input_ports = [p for p in node.data.equipment_templates.ports if p.type == 'input']
        output_ports = [p for p in node.data.equipment_templates.ports if p.type == 'output']

        for i, port in enumerate(input_ports):
            port_y = port_start_y - (i * port_spacing)
            c.setFillColor(colors.HexColor("#34d399"))
            c.circle(node_x, port_y, 3, fill=1, stroke=0)
            c.setFillColor(colors.white)
            c.setFont("Helvetica", 7)
            c.drawString(node_x + 10, port_y - 3, port.label)
            c.setFont("Helvetica-Oblique", 6)
            c.setFillColor(colors.grey)
            c.drawString(node_x + 10, port_y - 11, f"({port.connector_type})")
            port_map[node.id][f"port-in-{port.id}"] = (node_x, port_y)

        for i, port in enumerate(output_ports):
            port_y = port_start_y - (i * port_spacing)
            c.setFillColor(colors.HexColor("#fbbf24"))
            c.circle(node_x + node.width, port_y, 3, fill=1, stroke=0)
            c.setFillColor(colors.white)
            c.setFont("Helvetica", 7)
            c.drawRightString(node_x + node.width - 10, port_y - 3, port.label)
            c.setFont("Helvetica-Oblique", 6)
            c.setFillColor(colors.grey)
            c.drawRightString(node_x + node.width - 10, port_y - 11, f"({port.connector_type})")
            port_map[node.id][f"port-out-{port.id}"] = (node_x + node.width, port_y)

    c.setStrokeColor(colors.HexColor("#fbbf24"))
    c.setLineWidth(0.8)
    for edge in payload.edges:
        if edge.source in port_map and edge.target in port_map:
            if edge.sourceHandle in port_map[edge.source] and edge.targetHandle in port_map[edge.target]:
                start_x, start_y = port_map[edge.source][edge.sourceHandle]
                end_x, end_y = port_map[edge.target][edge.targetHandle]
                path = c.beginPath()
                path.moveTo(start_x, start_y)
                control_offset = max(30, abs(start_x - end_x) * 0.3)
                path.curveTo(start_x + control_offset, start_y, end_x - control_offset, end_y, end_x, end_y)
                c.drawPath(path)
                if edge.label:
                    mid_x = (start_x + end_x) / 2
                    mid_y = (start_y + end_y) / 2
                    c.setFillColor(colors.black)
                    c.setFont("Helvetica-Bold", 6)
                    text_width = c.stringWidth(edge.label, "Helvetica-Bold", 6)
                    c.setFillColorRGB(0.9, 0.9, 0.9, 0.8)
                    c.roundRect(mid_x - text_width/2 - 2, mid_y - 4, text_width + 4, 10, 2, fill=1, stroke=0)
                    c.setFillColor(colors.black)
                    c.drawCentredString(mid_x, mid_y - 2, edge.label)

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer
