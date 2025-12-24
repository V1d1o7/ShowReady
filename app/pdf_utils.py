import io
import os
import pprint
from typing import List, Dict, Optional, Union
from datetime import datetime, timedelta, date
import uuid

from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.pagesizes import letter, landscape, portrait
from reportlab.lib import colors
from reportlab.platypus import Paragraph, Table, TableStyle, Image, Spacer, SimpleDocTemplate
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from .models import LoomLabel, CaseLabel, Rack, RackPDFPayload, Loom, LoomBuilderPDFPayload, Cable, LoomWithCables, WeeklyTimesheet

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

# --- COLOR CONSTANTS ---
COLOR_BLUE_ACCENT = colors.Color(0.388, 0.702, 0.929)  # #63b3ed (Front)
COLOR_ORANGE_ACCENT = colors.Color(0.965, 0.678, 0.333) # #f6ad55 (Rear)
COLOR_PURPLE_BG = colors.Color(0.502, 0.353, 0.835)     # #805AD5 (Shared)
COLOR_GRAY_BG = colors.Color(0.29, 0.334, 0.408)        # #4A5568 (Standard)

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

def generate_equipment_list_pdf(show_name: str, table_data: List[List[str]], show_branding: bool = True) -> io.BytesIO:
    """Generates a PDF listing equipment for a show."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=portrait(letter),
        rightMargin=0.5*inch,
        leftMargin=0.5*inch,
        topMargin=0.5*inch,
        bottomMargin=0.5*inch,
    )
    story = []
    styles = getSampleStyleSheet()
    styles['Normal'].fontName = "SpaceMono"
    styles['Title'].fontName = "SpaceMono-Bold"
    styles['Title'].fontSize = 18
    styles['Title'].spaceAfter = 16

    # --- Title ---
    story.append(Paragraph(f"{show_name} - Equipment List", styles["Title"]))

    # --- Table ---
    if table_data:
        # Calculate column widths to fit the page
        col_widths = [3*inch, 3.5*inch, 1*inch] 

        # Apply paragraph styles to all cells for consistent formatting
        styled_table_data = []
        header_style = ParagraphStyle(name='Header', parent=styles['Normal'], fontName='SpaceMono-Bold', alignment=TA_LEFT)
        body_style = ParagraphStyle(name='Body', parent=styles['Normal'], alignment=TA_LEFT)

        # Header Row
        styled_table_data.append([Paragraph(cell, header_style) for cell in table_data[0]])
        # Data Rows
        for row in table_data[1:]:
            styled_table_data.append([Paragraph(cell, body_style) for cell in row])
        
        table = Table(styled_table_data, colWidths=col_widths, hAlign='LEFT')
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkgrey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LINEBELOW', (0, 0), (-1, 0), 2, colors.black),
            ('LINEBELOW', (0, 1), (-1, -1), 1, colors.lightgrey),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(table)

    # --- Footer and Build ---
    def footer(canvas, doc):
        if show_branding:
            canvas.saveState()
            canvas.setFont('SpaceMono', 8)
            canvas.drawString(0.5 * inch, 0.5 * inch, "Created using ShowReady")
            canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    
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
            
            width_type = equip_template.width if hasattr(equip_template, 'width') else 'full'
            
            if width_type == 'half':
                equip_width = RACK_FRAME_WIDTH / 2
                equip_x_start = view_x_start + (RACK_FRAME_WIDTH / 2 if equip.rack_side.endswith('-right') else 0)
            elif width_type == 'third':
                equip_width = RACK_FRAME_WIDTH / 3
                if equip.rack_side.endswith('-middle'):
                    equip_x_start = view_x_start + RACK_FRAME_WIDTH / 3
                elif equip.rack_side.endswith('-right'):
                    equip_x_start = view_x_start + (RACK_FRAME_WIDTH / 3 * 2)
                else:
                    equip_x_start = view_x_start
            else: # Full width
                equip_width = RACK_FRAME_WIDTH
                equip_x_start = view_x_start

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

def draw_rack_side_view(c: canvas.Canvas, x_start: float, y_top: float, rack_data: Rack):
    """
    Draws the side view of the rack matching exactly the visual style of draw_single_rack
    (light grey grid, numbers outside, transparent frame) but adding color-coded mounting markers.
    """
    RACK_FRAME_WIDTH = 3.5 * inch
    RACK_LABEL_WIDTH = 0.3 * inch
    RACK_DEPTH_INCHES = 24.0
    RU_HEIGHT = 0.22 * inch
    
    # We use the FULL frame width for depth calculations now (24" = 3.5 inches)
    # The visual "Rails" are just overlays, they don't eat capacity.
    DRAWING_AREA_WIDTH = RACK_FRAME_WIDTH

    rack_content_height = rack_data.ru_height * RU_HEIGHT
    y_bottom = y_top - rack_content_height

    # --- 1. Draw Container Frame (Exact copy from draw_single_rack) ---
    c.setStrokeColor(colors.black)
    c.setLineWidth(1)
    c.rect(x_start, y_bottom, RACK_FRAME_WIDTH, rack_content_height)
    
    # Header
    c.setFont("SpaceMono-Bold", 12)
    c.setFillColor(colors.black)
    c.drawCentredString(x_start + RACK_FRAME_WIDTH / 2, y_top + 0.15 * inch, f"{rack_data.rack_name} - SIDE VIEW")

    # --- 2. Draw Grid & Numbers (Exact loop from draw_single_rack) ---
    c.setFont("SpaceMono", 5)
    c.setStrokeColor(colors.lightgrey)
    for ru in range(1, rack_data.ru_height + 1):
        ru_y_top = y_bottom + ru * RU_HEIGHT
        
        # Grid line across entire rack
        c.line(x_start, ru_y_top, x_start + RACK_FRAME_WIDTH, ru_y_top)
        
        # Numbers (Left & Right)
        c.setFillColor(colors.black)
        text_y = ru_y_top - (RU_HEIGHT / 2) - 2
        c.drawCentredString(x_start - (RACK_LABEL_WIDTH / 2), text_y, str(ru))
        c.drawCentredString(x_start + RACK_FRAME_WIDTH + (RACK_LABEL_WIDTH / 2), text_y, str(ru))

    # --- 3. Process Equipment (Grouping Logic) ---
    groups = {}
    for equip in rack_data.equipment:
        side_key = 'front' if equip.rack_side.lower().startswith('front') else 'rear'
        key = f"{equip.ru_position}-{side_key}"
        if key not in groups: groups[key] = []
        groups[key].append(equip)

    for key in groups:
        groups[key].sort(key=lambda x: (x.instance_name or ""))

    # --- 4. Draw Equipment ---
    for key, members in groups.items():
        count = len(members)
        is_shared_slot = count > 1
        
        for index, equip in enumerate(members):
            template = equip.equipment_templates
            if not template: continue

            # Dimensions
            depth_inches = template.depth if hasattr(template, 'depth') and template.depth else 10.0
            
            # Map Depth to Drawing Width (24" = 100%)
            item_width_pts = (depth_inches / RACK_DEPTH_INCHES) * DRAWING_AREA_WIDTH
            if item_width_pts > DRAWING_AREA_WIDTH: item_width_pts = DRAWING_AREA_WIDTH

            # Vertical Position
            full_item_height_pts = template.ru_height * RU_HEIGHT
            split_height_pts = full_item_height_pts / count
            
            # PDF Y is bottom-up
            item_y_bottom = y_bottom + ((equip.ru_position - 1) * RU_HEIGHT) + (index * split_height_pts)

            # Horizontal Alignment
            is_front = equip.rack_side.lower().startswith('front')
            
            if is_front:
                # Anchored to Front Rail (Left)
                item_x = x_start
            else:
                # Anchored to Rear Rail (Right)
                item_x = (x_start + RACK_FRAME_WIDTH) - item_width_pts

            # Styling
            # Default to Gray background, or Purple if shared
            fill_color = COLOR_PURPLE_BG if is_shared_slot else COLOR_GRAY_BG
            c.setFillColor(fill_color)
            
            c.setStrokeColor(colors.black)
            c.setLineWidth(1)
            
            # Draw Box
            box_height = max(split_height_pts, 1) 
            c.rect(item_x, item_y_bottom, item_width_pts, box_height, fill=1, stroke=1)

            # Draw Mounting Marker (Thick Colored Line)
            c.setLineWidth(3)
            if is_front:
                c.setStrokeColor(COLOR_BLUE_ACCENT)
                # Line on Left Edge
                c.line(item_x, item_y_bottom, item_x, item_y_bottom + box_height)
            else:
                c.setStrokeColor(COLOR_ORANGE_ACCENT)
                # Line on Right Edge
                c.line(item_x + item_width_pts, item_y_bottom, item_x + item_width_pts, item_y_bottom + box_height)

            # Label
            c.setFillColor(colors.white)
            font_size = 6 if is_shared_slot and count >= 3 else 8
            c.setFont("SpaceMono-Bold", font_size)
            
            center_x = item_x + (item_width_pts / 2)
            center_y = item_y_bottom + (box_height / 2) - (font_size / 2) + 1
            
            label = equip.instance_name or "Unknown"
            if len(label) > 15: label = label[:12] + "..."
            
            c.drawCentredString(center_x, center_y, label)

    # --- 5. Draw Legend ---
    # Position below the rack
    legend_y = y_bottom - 0.25 * inch
    c.setFont("SpaceMono", 8)
    
    # Calculate widths for dynamic centering
    box_sz = 8
    gap = 4
    spacing = 15
    
    w_front = box_sz + gap + c.stringWidth("Front Mount", "SpaceMono", 8)
    w_rear = box_sz + gap + c.stringWidth("Rear Mount", "SpaceMono", 8)
    w_shared = box_sz + gap + c.stringWidth("Shared Slot", "SpaceMono", 8)
    
    total_legend_width = w_front + spacing + w_rear + spacing + w_shared
    
    current_x = x_start + (RACK_FRAME_WIDTH - total_legend_width) / 2
    
    # Front Legend
    c.setFillColor(COLOR_BLUE_ACCENT)
    c.setStrokeColor(colors.black)
    c.setLineWidth(1)
    c.rect(current_x, legend_y, box_sz, box_sz, fill=1, stroke=1)
    c.setFillColor(colors.black)
    c.drawString(current_x + box_sz + gap, legend_y + 1, "Front Mount")
    
    current_x += w_front + spacing

    # Rear Legend
    c.setFillColor(COLOR_ORANGE_ACCENT)
    c.rect(current_x, legend_y, box_sz, box_sz, fill=1, stroke=1)
    c.setFillColor(colors.black)
    c.drawString(current_x + box_sz + gap, legend_y + 1, "Rear Mount")
    
    current_x += w_rear + spacing

    # Shared Legend
    c.setFillColor(COLOR_PURPLE_BG)
    c.rect(current_x, legend_y, box_sz, box_sz, fill=1, stroke=1)
    c.setFillColor(colors.black)
    c.drawString(current_x + box_sz + gap, legend_y + 1, "Shared Slot")


def generate_racks_pdf(payload: RackPDFPayload, show_branding: bool = True) -> io.BytesIO:
    buffer = io.BytesIO()
    page_size_base = PAGE_SIZES.get(payload.page_size.lower(), letter)
    page_size = portrait(page_size_base)
    c = canvas.Canvas(buffer, pagesize=page_size)
    width, height = page_size
    
    MARGIN = 0.5 * inch
    
    for i, rack in enumerate(payload.racks):
        # --- PAGE 1: Front and Rear Views ---
        title_y = height - MARGIN
        if show_branding:
            c.setFont("SpaceMono", 8)
            c.setFillColor(colors.grey)
            c.drawString(MARGIN, title_y + 10, "Created using ShowReady")
        
        c.setFillColor(colors.black)
        c.setFont("SpaceMono-Bold", 16)
        c.drawString(MARGIN, title_y - 10, f"{payload.show_name}")
        c.setFont("SpaceMono", 10)
        date_str = datetime.now().strftime('%Y-%m-%d %H:%M')
        c.drawRightString(width - MARGIN, title_y - 10, f"Generated: {date_str}")

        # Increased top margin slightly to ensure bottom fits
        y_top = height - MARGIN - (0.6 * inch)
        
        RACK_FRAME_WIDTH = 3.5 * inch
        SIDE_PADDING = 0.5 * inch
        TOTAL_WIDTH = (RACK_FRAME_WIDTH * 2) + SIDE_PADDING
        x_start = (width - TOTAL_WIDTH) / 2
        
        draw_single_rack(c, x_start, y_top, rack)
        c.showPage()

        # --- PAGE 2: Side View ---
        title_y = height - MARGIN
        if show_branding:
            c.setFont("SpaceMono", 8)
            c.setFillColor(colors.grey)
            c.drawString(MARGIN, title_y + 10, "Created using ShowReady")
        
        c.setFillColor(colors.black)
        c.setFont("SpaceMono-Bold", 16)
        c.drawString(MARGIN, title_y - 10, f"{payload.show_name}")
        c.setFont("SpaceMono", 10)
        c.drawRightString(width - MARGIN, title_y - 10, f"Generated: {date_str}")

        y_top = height - MARGIN - (0.6 * inch)
        
        x_start_side = (width - RACK_FRAME_WIDTH) / 2
        
        draw_rack_side_view(c, x_start_side, y_top, rack)
        c.showPage()

    c.save()
    buffer.seek(0)
    return buffer

# --- Timesheet Footer ---
def draw_timesheet_footer(canvas: canvas.Canvas, doc: SimpleDocTemplate):
    canvas.saveState()
    canvas.setFont('SpaceMono', 8)
    canvas.setFillColor(colors.grey)
    page_number_text = f"Page {doc.page}"
    canvas.drawCentredString(doc.width / 2 + doc.leftMargin, 0.25 * inch, page_number_text)
    canvas.drawString(doc.leftMargin, 0.25 * inch, "Created using ShowReady")
    canvas.restoreState()

# --- Shared Header ---
def _build_header_table(show, user, generation_date, show_logo_bytes, company_logo_bytes, styles):
    MAX_LOGO_HEIGHT = 50
    MAX_LOGO_WIDTH = 180

    show_logo_img = None
    company_logo_img = None

    if show_logo_bytes:
        try:
            img_file = io.BytesIO(show_logo_bytes)
            show_logo_img = Image(img_file, hAlign="LEFT")
            width, height = show_logo_img.drawWidth, show_logo_img.drawHeight
            aspect_ratio = height / width
            new_width = MAX_LOGO_WIDTH
            new_height = new_width * aspect_ratio
            if new_height > MAX_LOGO_HEIGHT:
                new_height = MAX_LOGO_HEIGHT
                new_width = new_height / aspect_ratio
            show_logo_img.drawWidth = new_width
            show_logo_img.drawHeight = new_height
        except Exception as e:
            print(f"Warning: Could not load show logo bytes: {e}")
            show_logo_img = None

    if company_logo_bytes:
        try:
            img_file = io.BytesIO(company_logo_bytes)
            company_logo_img = Image(img_file, hAlign="RIGHT")
            width, height = company_logo_img.drawWidth, company_logo_img.drawHeight
            aspect_ratio = height / width
            new_width = MAX_LOGO_WIDTH
            new_height = new_width * aspect_ratio
            if new_height > MAX_LOGO_HEIGHT:
                new_height = MAX_LOGO_HEIGHT
                new_width = new_height / aspect_ratio
            company_logo_img.drawWidth = new_width
            company_logo_img.drawHeight = new_height
        except Exception as e:
            print(f"Warning: Could not load company logo bytes: {e}")
            company_logo_img = None

    header_left = []
    if show_logo_img:
        header_left.append(show_logo_img)
        header_left.append(Spacer(1, 12))
    header_left.append(Paragraph(show.get("name", "Show Name"), styles["HeaderShowName"]))

    header_right = []
    if company_logo_img:
        header_right.append(company_logo_img)
        header_right.append(Spacer(1, 12))
        
    header_right.append(Paragraph(user.get("full_name", "User Name"), styles["HeaderUserName"]))
    if user.get("position"):
        header_right.append(Paragraph(user.get("position"), styles["HeaderCompanyName"]))
    if user.get("company"):
        header_right.append(Paragraph(user.get("company"), styles["HeaderCompanyName"]))
    header_right.append(Spacer(1, 6))
    header_right.append(Paragraph(f"Generated: {generation_date}", styles["HeaderDate"]))

    header_table = Table([[header_left, header_right]], colWidths=["60%", "40%"])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    return header_table

def generate_hours_pdf(user: dict, show: dict, timesheet_data: dict, show_logo_bytes: Optional[bytes], company_logo_bytes: Optional[bytes], show_branding: bool = True):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        rightMargin=0.25*inch, leftMargin=0.25*inch,
        topMargin=0.5*inch, bottomMargin=0.5*inch,
    )
    styles = getSampleStyleSheet()
    styles['Normal'].fontName = "SpaceMono"
    styles['Normal'].fontSize = 8

    styles['Title'].fontName = "SpaceMono-Bold"
    styles['Title'].fontSize = 16
    styles['Title'].alignment = TA_CENTER

    styles.add(ParagraphStyle(name="HeaderShowName", parent=styles["Normal"], fontName="SpaceMono-Bold", fontSize=14, alignment=TA_LEFT))
    styles.add(ParagraphStyle(name="HeaderUserName", parent=styles["Normal"], fontName="SpaceMono-Bold", fontSize=14, alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name="HeaderCompanyName", parent=styles["Normal"], fontSize=10, alignment=TA_RIGHT, spaceBefore=4))
    styles.add(ParagraphStyle(name="HeaderDate", parent=styles["Normal"], fontSize=8, alignment=TA_RIGHT, textColor=colors.grey, spaceBefore=4))
    styles.add(ParagraphStyle(name="DateRange", parent=styles["Normal"], fontSize=12, spaceAfter=12, alignment=TA_CENTER))
    styles.add(ParagraphStyle(name="CrewName", parent=styles["Normal"], alignment=TA_LEFT, leading=10))
    styles.add(ParagraphStyle(name="CellCenter", parent=styles["Normal"], alignment=TA_CENTER))
    styles.add(ParagraphStyle(name="TotalsLabel", parent=styles["Normal"], fontName="SpaceMono-Bold", alignment=TA_LEFT))
    styles.add(ParagraphStyle(name="TotalsValue", parent=styles["Normal"], fontName="SpaceMono-Bold", alignment=TA_CENTER))
    styles.add(ParagraphStyle(name="HeaderCenter", parent=styles["Normal"], fontName="SpaceMono-Bold", alignment=TA_CENTER, textColor=colors.whitesmoke))

    story = []

    generation_date = datetime.now().strftime("%B %d, %Y %I:%M %p")
    header = _build_header_table(show, user, generation_date, show_logo_bytes, company_logo_bytes, styles)
    story.append(header)
    story.append(Spacer(1, 12))
    
    story.append(Paragraph(f"{show.get('name', 'Show')} - Weekly Timesheet", styles["Title"]))
    
    week_start_date = timesheet_data['week_start_date']
    week_end_date = timesheet_data['week_end_date']
    if isinstance(week_start_date, str):
        week_start_date = datetime.strptime(week_start_date, '%Y-%m-%d').date()
    if isinstance(week_end_date, str):
        week_end_date = datetime.strptime(week_end_date, '%Y-%m-%d').date()

    story.append(Paragraph(f"{week_start_date.strftime('%m/%d/%y')} to {week_end_date.strftime('%m/%d/%y')}", styles["DateRange"]))
    
    dates = [(week_start_date + timedelta(days=i)) for i in range(7)]
    
    header_row_text = ['Crew Member', 'Rate'] + [f"{d.strftime('%a').upper()}<br/>{d.strftime('%m/%d')}" for d in dates] + ['Regular', 'OT', 'Cost']
    table_data = [[Paragraph(text, styles["HeaderCenter"]) for text in header_row_text]]
    
    crew_hours = timesheet_data.get('crew_hours', [])
    ot_daily_threshold = timesheet_data.get('ot_daily_threshold', 10)
    ot_weekly_threshold = timesheet_data.get('ot_weekly_threshold', 40)

    grouped_crew = {}
    for c in crew_hours:
        roster_id = c.get('roster_id') or str(uuid.uuid4())
        if roster_id not in grouped_crew:
            grouped_crew[roster_id] = []
        grouped_crew[roster_id].append(c)

    total_cost_grand = 0

    for roster_id, members in grouped_crew.items():
        members.sort(key=lambda x: (x.get('rate_type') != 'daily', -1 * (x.get('hourly_rate') or 0)))
        
        weekly_regular_hours_tracker = 0

        for m in members:
            m['calc_stats'] = {'regular': 0.0, 'ot': 0.0, 'cost': 0.0, 'daily_breakdown': {}}

        for day in dates:
            day_entries = []
            for m in members:
                raw_hours = m.get('hours_by_date', {}).get(day, 0)
                h_val = float(raw_hours) if raw_hours else 0
                if h_val > 0:
                    day_entries.append({'member': m, 'hours': h_val})
            
            if not day_entries: continue

            hours_consumed_in_daily_bucket = 0
            has_day_rate_on_day = any(e['member'].get('rate_type') == 'daily' for e in day_entries)

            for entry in day_entries:
                m = entry['member']
                worked = entry['hours']
                entry_cost = 0
                regular_h = 0
                ot_h = 0

                if m.get('rate_type') == 'daily':
                    entry_cost += (m.get('daily_rate') or 0)
                    if worked <= ot_daily_threshold:
                        regular_h = worked
                    else:
                        regular_h = ot_daily_threshold
                        ot_h = worked - ot_daily_threshold
                        implied_rate = (m.get('daily_rate') or 0) / (ot_daily_threshold if ot_daily_threshold > 0 else 10)
                        entry_cost += ot_h * (implied_rate * 1.5)
                    hours_consumed_in_daily_bucket += ot_daily_threshold
                else:
                    current_rate = m.get('hourly_rate') or 0
                    remaining_bucket = max(0, ot_daily_threshold - hours_consumed_in_daily_bucket)
                    
                    if has_day_rate_on_day:
                        absorbed_hours = min(worked, remaining_bucket)
                        overflow_hours = worked - absorbed_hours
                        regular_h = absorbed_hours
                        ot_h = overflow_hours
                        entry_cost += overflow_hours * (current_rate * 1.5)
                        hours_consumed_in_daily_bucket += absorbed_hours
                    else:
                        straight_portion = min(worked, remaining_bucket)
                        ot_portion = worked - straight_portion
                        entry_cost += straight_portion * current_rate
                        entry_cost += ot_portion * (current_rate * 1.5)
                        regular_h = straight_portion
                        ot_h = ot_portion
                        hours_consumed_in_daily_bucket += straight_portion
                
                m['calc_stats']['regular'] += regular_h
                m['calc_stats']['ot'] += ot_h
                m['calc_stats']['cost'] += entry_cost
                if m.get('rate_type') == 'hourly':
                    weekly_regular_hours_tracker += regular_h

        if weekly_regular_hours_tracker > ot_weekly_threshold:
            weekly_ot_hours = weekly_regular_hours_tracker - ot_weekly_threshold
            
            for m in reversed(members):
                if m.get('rate_type') == 'hourly' and weekly_ot_hours > 0:
                    current_rate = m.get('hourly_rate') or 0
                    regular_hours_in_member = m['calc_stats']['regular']

                    ot_to_apply = min(weekly_ot_hours, regular_hours_in_member)
                    
                    m['calc_stats']['regular'] -= ot_to_apply
                    m['calc_stats']['ot'] += ot_to_apply
                    
                    m['calc_stats']['cost'] -= ot_to_apply * current_rate
                    m['calc_stats']['cost'] += ot_to_apply * (current_rate * 1.5)
                    
                    weekly_ot_hours -= ot_to_apply
        
    all_crew_sorted = sorted(crew_hours, key=lambda c: (
        (c.get('first_name') or '').lower(),
        (c.get('last_name') or '').lower()
    ))
    
    grand_total_regular = 0
    grand_total_ot = 0

    for c in all_crew_sorted:
        crew_hours_map = c.get('hours_by_date', {}) or {}
        if not any(float(h or 0) > 0 for h in crew_hours_map.values()):
            continue

        rate_val = c.get('daily_rate') or 0 if c.get('rate_type') == 'daily' else c.get('hourly_rate') or 0
        rate_suffix = "/day" if c.get('rate_type') == 'daily' else "/hr"
        rate_str = f"${rate_val:,.2f}{rate_suffix}"
        
        first_name = c.get('first_name') or 'N/A'
        last_name = c.get('last_name') or ''
        name_p = Paragraph(f"{first_name} {last_name}", styles['CrewName'])
        position_p = Paragraph(f"<font size=7 color=grey>{c.get('position', 'N/A')}</font>", styles['CrewName'])

        row = [[name_p, position_p], Paragraph(rate_str, styles['CellCenter'])]
        
        for day in dates:
            h_val = float(crew_hours_map.get(day) or 0)
            row.append(Paragraph(str(h_val) if h_val > 0 else "-", styles['CellCenter']))

        stats = c.get('calc_stats', {'regular': 0, 'ot': 0, 'cost': 0})
        row.append(Paragraph(f"{stats['regular']:.2f}", styles['CellCenter']))
        row.append(Paragraph(f"{stats['ot']:.2f}", styles['CellCenter']))
        row.append(Paragraph(f"${stats['cost']:,.2f}", styles['CellCenter']))
        
        table_data.append(row)

        grand_total_regular += stats['regular']
        grand_total_ot += stats['ot']
        total_cost_grand += stats['cost']

    totals_row = [
        Paragraph("Totals", styles['TotalsLabel']), "",
    ] + [""] * len(dates) + [
        Paragraph(f"{grand_total_regular:.2f}", styles['TotalsValue']),
        Paragraph(f"{grand_total_ot:.2f}", styles['TotalsValue']),
        Paragraph(f"${total_cost_grand:,.2f}", styles['TotalsValue']),
    ]
    table_data.append(totals_row)

    col_widths = ['16%', '10%'] + ['6%'] * len(dates) + ['8%', '8%', '10%']
    table = Table(table_data, colWidths=col_widths, hAlign='CENTER')
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.darkgrey),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, colors.lightgrey),
        ("LINEABOVE", (0, -1), (-1, -1), 1.5, colors.black),
        ('SPAN', (0, -1), (1, -1)),
    ]))
    
    for i, row_data in enumerate(table_data):
        if i > 0 and i < len(table_data) -1:
            if isinstance(row_data[0], list):
                 table.setStyle(TableStyle([('SPAN', (0, i), (0, i))]))

    story.append(table)

    if show_branding:
        doc.build(story, onFirstPage=draw_timesheet_footer, onLaterPages=draw_timesheet_footer)
    else:
        doc.build(story)

    buffer.seek(0)
    return buffer