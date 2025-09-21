import io
import os
from typing import List, Dict, Optional, Union
from datetime import datetime

from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.pagesizes import letter, landscape, portrait
from reportlab.lib import colors
from reportlab.platypus import Paragraph, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import base64
from svglib.svglib import svg2rlg
import xml.etree.ElementTree as ET

from .models import LoomLabel, CaseLabel, Rack, RackPDFPayload, Loom, LoomBuilderPDFPayload, Cable, LoomWithCables

# Register Space Mono font
try:
    pdfmetrics.registerFont(TTFont('SpaceMono', 'fonts/SpaceMono-Regular.ttf'))
    pdfmetrics.registerFont(TTFont('SpaceMono-Bold', 'fonts/SpaceMono-Bold.ttf'))
    pdfmetrics.registerFont(TTFont('SpaceMono-Italic', 'fonts/SpaceMono-Italic.ttf'))
except Exception as e:
    print(f"Could not register Space Mono font: {e}")

# --- Image Checkbox Setup ---
try:
    script_dir = os.path.dirname(__file__)
    checked_img_path = os.path.join(script_dir, 'checked.png')
    unchecked_img_path = os.path.join(script_dir, 'unchecked.png')
    CHECKED_IMG = Image(checked_img_path, width=10, height=10)
    UNCHECKED_IMG = Image(unchecked_img_path, width=10, height=10)
    IMAGES_AVAILABLE = True
except Exception as e:
    print(f"Could not load checkbox images: {e}")
    IMAGES_AVAILABLE = False


tabloid = (11 * inch, 17 * inch)
PAGE_SIZES = {
    "letter": letter,
    "tabloid": tabloid,
    "22x17": (22 * inch, 17 * inch),
}

def parse_color(color_string: Optional[str]) -> colors.Color:
    if not color_string:
        return colors.black
    color_string = color_string.lower().strip()
    hex_val = {
        'red': '#FF0000', 'orange': '#FFA500', 'yellow': '#FFFF00', 'green': '#008000', 
        'blue': '#0000FF', 'indigo': '#4B0082', 'violet': '#EE82EE', 'black': '#000000', 
        'white': '#FFFFFF', 'gray': '#808000', 'silver': '#C0C0C0', 'maroon': '#800000',
        'olive': '#808000', 'lime': '#00FF00', 'aqua': '#00FFFF', 'teal': '#008080',
        'navy': '#000080', 'fuchsia': '#FF00FF', 'purple': '#800080'
    }.get(color_string)
    
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
        int_placement = {int(k): v for k, v in placement.items()}
        for slot, label_index in sorted(int_placement.items()):
            if 0 <= label_index < len(labels):
                labels_to_draw.append((slot, labels[label_index]))
    else:
        labels_to_draw = list(enumerate(labels))

    for slot, label in labels_to_draw:
        if slot >= 24: continue

        row = slot // NUM_COLUMNS
        col = slot % NUM_COLUMNS
        
        x = LEFT_MARGIN + (col * (LABEL_WIDTH + HORIZONTAL_SPACING))
        y = height - TOP_MARGIN - (row * (LABEL_HEIGHT + VERTICAL_SPACING)) - LABEL_HEIGHT
        
        center_x, center_y = x + LABEL_WIDTH / 2, y + LABEL_HEIGHT / 2
        font_size = 14
        c.setFont("SpaceMono-Bold", font_size)
        c.setFillColor(colors.black)
        c.drawCentredString(center_x, center_y - (font_size * 0.25), label.loom_name or 'N/A')
        
        bar_color = parse_color(label.color)
        c.setFillColor(bar_color)
        bar_height, bar_y_offset = 0.05 * inch, 0.18 * inch
        c.roundRect(x, center_y + bar_y_offset, LABEL_WIDTH, bar_height, CORNER_RADIUS, fill=1, stroke=0)
        c.roundRect(x, center_y - bar_y_offset - bar_height, LABEL_WIDTH, bar_height, CORNER_RADIUS, fill=1, stroke=0)
        
        c.setFont("SpaceMono", 7)
        c.setFillColor(colors.black)
        padding, bottom_y = 0.08 * inch, y + 0.1 * inch
        c.drawString(x + padding, bottom_y, f"SRC: {label.source or 'N/A'}")
        c.drawRightString(x + LABEL_WIDTH - padding, bottom_y, f"DST: {label.destination or 'N/A'}")

    c.showPage()
    c.save()
    
    buffer.seek(0)
    return buffer

def draw_single_case_label(c, label_index: int, image_data: Optional[bytes], send_to_text: str, contents_text: str):
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
            c.setFont("SpaceMono", 10)
            c.drawCentredString(box_x + (v_line_x - box_x)/2, h_line_y + 0.5*inch, f"Image failed to load: {e}")

    c.setFillColor(colors.black)
    c.setFont("SpaceMono", 20)
    c.drawString(v_line_x + (0.1 * inch), (box_y + box_height) - (0.3 * inch), "SEND TO:")
    font_size = 48
    text_to_draw = send_to_text.upper()
    max_text_width = (box_x + box_width) - v_line_x - (0.2 * inch)
    while c.stringWidth(text_to_draw, "SpaceMono-Bold", font_size) > max_text_width and font_size > 8: font_size -= 1
    c.setFont("SpaceMono-Bold", font_size)
    send_to_box_center_x = v_line_x + ((box_x + box_width - v_line_x) / 2)
    c.drawCentredString(send_to_box_center_x, y_start + LABEL_HEIGHT - (1.35 * inch), text_to_draw)
    c.setFont("SpaceMono", 20)
    c.drawString(padding + (0.1 * inch), h_line_y - (0.3 * inch), "CONTENTS:")
    
    style_body = ParagraphStyle(
        name='BodyText', fontName='SpaceMono-Bold', fontSize=28, leading=34, alignment=TA_CENTER)
    p = Paragraph((contents_text or "").replace('\n', '<br/>').upper(), style=style_body)
    p_width, p_height = p.wrapOn(c, LABEL_WIDTH - (2 * padding) - 0.2 * inch, h_line_y - box_y - 0.5 * inch)
    p.drawOn(c, center_x - p_width / 2, h_line_y - 0.5 * inch - p_height)

def generate_case_label_pdf(labels: List[CaseLabel], logo_bytes: Optional[bytes] = None, placement: Optional[Dict[str, int]] = None) -> io.BytesIO:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    
    labels_to_draw = []
    if placement:
        int_placement = {int(k): v for k, v in placement.items()}
        for slot_index, label_index in sorted(int_placement.items()):
            if 0 <= label_index < len(labels):
                labels_to_draw.append((slot_index, labels[label_index]))
    else:
        labels_to_draw = list(enumerate(labels))

    for i, (slot_index_or_label_index, label_info) in enumerate(labels_to_draw):
        slot_index = slot_index_or_label_index if placement else i % 2
        draw_single_case_label(c, slot_index, logo_bytes, label_info.send_to, label_info.contents)
        if slot_index == 1 or i == len(labels_to_draw) - 1:
            c.showPage()
    c.save()
    buffer.seek(0)
    return buffer

def generate_loom_builder_pdf(payload: "LoomBuilderPDFPayload", show_branding: bool = True) -> io.BytesIO:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=portrait(letter))
    width, height = portrait(letter)
    
    if not payload.looms:
        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer

    for loom in payload.looms:
        y_top = height - 0.25 * inch
        if show_branding:
            c.setFont("SpaceMono", 8)
            c.drawString(0.5 * inch, y_top - 10, "Created Using ShowReady")

        c.setFont("SpaceMono-Bold", 18)
        c.drawCentredString(width / 2, y_top - 12, "Loom Build Sheet")
        c.setFont("SpaceMono", 8)
        c.drawRightString(width - 0.5 * inch, y_top - 10, f"Generated: {datetime.now().strftime('%Y-%m-%d')}")
        y_pos = y_top - (0.6 * inch)
        c.setFont("SpaceMono-Bold", 14)
        c.drawString(0.5 * inch, y_pos, f"Show: {payload.show_name}")
        c.drawRightString(width - 0.5 * inch, y_pos, f"Loom: {loom.name}")
        y_pos -= 0.25 * inch
        
        if loom.cables:
            styles = getSampleStyleSheet()
            header_style = ParagraphStyle(
                name='HeaderStyle',
                parent=styles['Normal'],
                alignment=TA_CENTER,
                fontName='SpaceMono-Bold',
                fontSize=9,
                textColor=colors.whitesmoke,
                leading=11
            )
            
            first_cable = loom.cables[0]
            common_origin_location = first_cable.origin.value
            common_dest_location = first_cable.destination.value

            origin_header_text = f"Origin<br/>{common_origin_location or 'N/A'}"
            dest_header_text = f"Destination<br/>{common_dest_location or 'N/A'}"
            origin_header_para = Paragraph(origin_header_text, header_style)
            dest_header_para = Paragraph(dest_header_text, header_style)

            header_row = ["Label", "Type", "Length", origin_header_para, dest_header_para, "RCVD", "Done"]
            data = [header_row]

            base_data_style = ParagraphStyle(
                name='BaseDataStyle',
                parent=styles['Normal'],
                fontName='SpaceMono',
                fontSize=8,
                alignment=TA_CENTER
            )
            
            for cable in loom.cables:
                origin_color = parse_color(cable.origin_color)
                origin_style = ParagraphStyle(
                    name='OriginStyle', 
                    backColor=origin_color,
                    textColor=colors.white if (origin_color.red + origin_color.green + origin_color.blue) < 1.5 else colors.black,
                    alignment=TA_CENTER,
                    fontName='SpaceMono',
                    fontSize=8,
                    borderPadding=(2, 4)
                )
                origin_cell = Paragraph(cable.origin.end, origin_style)

                destination_color = parse_color(cable.destination_color)
                destination_style = ParagraphStyle(
                    name='DestinationStyle', 
                    backColor=destination_color,
                    textColor=colors.white if (destination_color.red + destination_color.green + destination_color.blue) < 1.5 else colors.black,
                    alignment=TA_CENTER,
                    fontName='SpaceMono',
                    fontSize=8,
                    borderPadding=(2, 4)
                )
                destination_cell = Paragraph(cable.destination.end, destination_style)

                rcvd_checkbox = (CHECKED_IMG if cable.is_rcvd else UNCHECKED_IMG) if IMAGES_AVAILABLE else "Y" if cable.is_rcvd else "N"
                complete_checkbox = (CHECKED_IMG if cable.is_complete else UNCHECKED_IMG) if IMAGES_AVAILABLE else "Y" if cable.is_complete else "N"

                label_text = cable.label_content
                label_font_size = 8
                if len(label_text or "") > 16:
                    label_font_size = 7
                
                label_style = ParagraphStyle(
                    name='LabelStyle',
                    parent=base_data_style,
                    fontSize=label_font_size
                )
                label_cell = Paragraph(label_text, label_style)

                type_cell = Paragraph(cable.cable_type, base_data_style)
                length_text = f"{int(cable.length_ft)}" if cable.length_ft is not None else "N/A"
                length_cell = Paragraph(length_text, base_data_style)

                data.append([
                    label_cell,
                    type_cell,
                    length_cell,
                    origin_cell,
                    destination_cell,
                    rcvd_checkbox,
                    complete_checkbox,
                ])

            table = Table(data, colWidths=[1.4*inch, 1.4*inch, 0.7*inch, 1.6*inch, 1.6*inch, 0.4*inch, 0.4*inch])
            
            style = TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('FONTNAME', (0, 0), (2, 0), 'SpaceMono-Bold'),
                ('FONTNAME', (5, 0), (6, 0), 'SpaceMono-Bold'),
                ('TEXTCOLOR', (0, 0), (2, 0), colors.whitesmoke),
                ('TEXTCOLOR', (5, 0), (6, 0), colors.whitesmoke),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 0),
                ('TOPPADDING', (0, 0), (-1, 0), 0),
                ('FONTNAME', (0, 1), (-1, -1), 'SpaceMono'),
                ('LINEBELOW', (0, 0), (-1, 0), 1.5, colors.black),
                ('LINEBELOW', (0, 1), (-1, -1), 0.5, colors.lightgrey),
            ])
            table.setStyle(style)
            
            table_width, table_height = table.wrapOn(c, width - 1 * inch, height)
            table.drawOn(c, 0.25 * inch, y_pos - table_height)

        c.showPage()

    c.save()
    buffer.seek(0)
    return buffer

def draw_single_rack(c: canvas.Canvas, x_start: float, y_top: float, rack_data: Rack):
    RACK_FRAME_WIDTH = 3.5 * inch
    RACK_LABEL_WIDTH = 0.3 * inch
    SIDE_PADDING = 0.5 * inch
    RU_HEIGHT = 0.22 * inch

    rack_content_height = rack_data.ru_height * RU_HEIGHT
    
    for i, view in enumerate(['front', 'rear']):
        view_x_start = x_start + (i * (RACK_FRAME_WIDTH + SIDE_PADDING))
        y_bottom = y_top - rack_content_height

        c.setStrokeColor(colors.black)
        c.setLineWidth(1)
        c.rect(view_x_start, y_bottom, RACK_FRAME_WIDTH, rack_content_height)
        c.setFont("SpaceMono-Bold", 12)
        c.drawCentredString(view_x_start + RACK_FRAME_WIDTH / 2, y_top + 0.15 * inch, f"{rack_data.rack_name} - {view.upper()}")

        c.setFont("SpaceMono", 5)
        c.setStrokeColor(colors.lightgrey)
        for ru in range(1, rack_data.ru_height + 1):
            ru_y_top = y_bottom + ru * RU_HEIGHT
            c.line(view_x_start, ru_y_top, view_x_start + RACK_FRAME_WIDTH, ru_y_top)
            c.setFillColor(colors.black)
            text_y = ru_y_top - (RU_HEIGHT / 2) - 2
            c.drawCentredString(view_x_start - (RACK_LABEL_WIDTH / 2), text_y, str(ru))
            c.drawCentredString(view_x_start + RACK_FRAME_WIDTH + (RACK_LABEL_WIDTH / 2), text_y, str(ru))
        
        equip_list = [e for e in rack_data.equipment if e.rack_side and e.rack_side.startswith(view)]
        
        for equip in equip_list:
            equip_template = equip.equipment_templates
            if not equip_template: continue
            
            equip_ru_height = equip_template.ru_height
            equip_bottom_y = y_bottom + (equip.ru_position - 1) * RU_HEIGHT
            equip_height = equip_ru_height * RU_HEIGHT
            is_half_width = equip_template.width == 'half'
            equip_width = (RACK_FRAME_WIDTH / 2) if is_half_width else RACK_FRAME_WIDTH
            equip_x_start = view_x_start
            if is_half_width and equip.rack_side.endswith('-right'):
                equip_x_start += RACK_FRAME_WIDTH / 2
            
            c.setFillColorRGB(0.88, 0.88, 0.88)
            c.setStrokeColor(colors.black)
            c.rect(equip_x_start, equip_bottom_y, equip_width, equip_height, fill=1, stroke=1)
            
            c.setFillColor(colors.black)
            c.setFont("SpaceMono-Bold", 8)
            text_x = equip_x_start + (equip_width / 2)
            text_y = equip_bottom_y + (equip_height / 2) - 4
            c.drawCentredString(text_x, text_y, equip.instance_name or equip_template.model_number)
            c.setFont("SpaceMono", 6)
            c.drawRightString(equip_x_start + equip_width - 0.05 * inch, equip_bottom_y + equip_height - 0.1 * inch, equip_template.model_number)

def generate_racks_pdf(payload: RackPDFPayload, show_branding: bool = True) -> io.BytesIO:
    buffer = io.BytesIO()
    page_size_base = PAGE_SIZES.get(payload.page_size.lower(), letter)
    page_size = portrait(page_size_base)
    c = canvas.Canvas(buffer, pagesize=page_size)
    width, height = page_size
    
    MARGIN = 0.25 * inch
    
    for rack in payload.racks:
        title_x = MARGIN
        if show_branding:
            c.setFont("SpaceMono", 8)
            c.drawString(MARGIN, height - MARGIN, "Created using ShowReady")
            title_y_offset = 0.2 * inch
        else:
            title_y_offset = 0

        c.setFont("SpaceMono-Bold", 16)
        c.drawString(title_x, height - MARGIN - title_y_offset, payload.show_name)
        c.setFont("SpaceMono", 10)
        c.drawRightString(width - MARGIN, height - MARGIN, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        
        y_top = height - MARGIN - (0.5 * inch)
        
        RACK_TOTAL_WIDTH = (3.5 * inch) * 2 + 0.5 * inch
        x_start = (width - RACK_TOTAL_WIDTH) / 2
        
        draw_single_rack(c, x_start, y_top, rack)
        
        c.showPage()

    c.save()
    buffer.seek(0)
    return buffer
