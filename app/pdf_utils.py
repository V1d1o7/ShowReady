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

from .models import LoomLabel, CaseLabel, WireDiagramPDFPayload, Rack, RackPDFPayload, Loom, LoomBuilderPDFPayload, Cable, LoomWithCables

# Register Space Mono font
try:
    pdfmetrics.registerFont(TTFont('SpaceMono', 'fonts/SpaceMono-Regular.ttf'))
    pdfmetrics.registerFont(TTFont('SpaceMono-Bold', 'fonts/SpaceMono-Bold.ttf'))
    pdfmetrics.registerFont(TTFont('SpaceMono-Italic', 'fonts/SpaceMono-Italic.ttf'))
except Exception as e:
    print(f"Could not register Space Mono font: {e}")

# --- Image Checkbox Setup ---
# NOTE: This requires 'checked.png' and 'unchecked.png' files (e.g., 16x16 pixels)
# to be in the same directory as this python file.
try:
    # Get the directory where this script is located
    script_dir = os.path.dirname(__file__)
    checked_img_path = os.path.join(script_dir, 'checked.png')
    unchecked_img_path = os.path.join(script_dir, 'unchecked.png')

    # Create reusable Image objects. The table will center these perfectly.
    CHECKED_IMG = Image(checked_img_path, width=10, height=10)
    UNCHECKED_IMG = Image(unchecked_img_path, width=10, height=10)
    
    # Flag to confirm images loaded successfully
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
    """Parses a color string (name or hex) into a reportlab Color object."""
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
    """Generates a PDF document for a list of looms, with each loom on a separate page and cables in a table."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=portrait(letter))
    width, height = portrait(letter)
    
    if not payload.looms:
        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer

    for loom in payload.looms:
        # --- Header ---
        y_top = height - 0.25 * inch
        if show_branding:
            # To implement a logo in the future:
            # 1. Add 'logo_path' as an argument to this function.
            # 2. Uncomment the following lines and remove the text rendering.
            # 3. Ensure the logo_path is passed from the API layer.
            # try:
            #     c.drawImage(logo_path, 0.5 * inch, y_top - 10, height=0.25*inch, preserveAspectRatio=True, anchor='sw')
            # except Exception as e:
            #     print(f"Could not draw logo: {e}")
            
            # Current implementation: render text
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
        
        # --- Table of Cables ---
        if loom.cables:
            # --- Setup for multi-line header ---
            styles = getSampleStyleSheet()
            header_style = ParagraphStyle(
                name='HeaderStyle',
                parent=styles['Normal'],
                alignment=TA_CENTER,
                fontName='SpaceMono-Bold',
                fontSize=9,
                textColor=colors.whitesmoke,
                leading=11 # Line spacing for multi-line
            )
            
            # Get common location info from the first cable in the loom
            first_cable = loom.cables[0]
            common_origin_location = first_cable.origin.value
            common_dest_location = first_cable.destination.value

            origin_header_text = f"Origin<br/>{common_origin_location or 'N/A'}"
            dest_header_text = f"Destination<br/>{common_dest_location or 'N/A'}"
            origin_header_para = Paragraph(origin_header_text, header_style)
            dest_header_para = Paragraph(dest_header_text, header_style)

            # Create the header row
            header_row = ["Label", "Type", "Length", origin_header_para, dest_header_para, "RCVD", "Done"]
            data = [header_row]

            # --- Define base style for data cells ---
            base_data_style = ParagraphStyle(
                name='BaseDataStyle',
                parent=styles['Normal'],
                fontName='SpaceMono',
                fontSize=8,
                alignment=TA_CENTER
            )
            
            for cable in loom.cables:
                # Create Origin Cell with colored background and cable end text
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

                # Create Destination Cell with colored background and cable end text
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

                # Use Image objects for checkboxes
                rcvd_checkbox = (CHECKED_IMG if cable.is_rcvd else UNCHECKED_IMG) if IMAGES_AVAILABLE else "Y" if cable.is_rcvd else "N"
                complete_checkbox = (CHECKED_IMG if cable.is_complete else UNCHECKED_IMG) if IMAGES_AVAILABLE else "Y" if cable.is_complete else "N"

                # --- Create Label cell with dynamic font size ---
                label_text = cable.label_content
                label_font_size = 8
                if len(label_text or "") > 16: # Threshold to shrink font
                    label_font_size = 7
                
                label_style = ParagraphStyle(
                    name='LabelStyle',
                    parent=base_data_style,
                    fontSize=label_font_size
                )
                label_cell = Paragraph(label_text, label_style)

                # Create other cells as Paragraphs for consistency
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
                
                # Header styles
                ('FONTNAME', (0, 0), (2, 0), 'SpaceMono-Bold'), # Style for first 3 header cells
                ('FONTNAME', (5, 0), (6, 0), 'SpaceMono-Bold'), # Style for last 2 header cells
                ('TEXTCOLOR', (0, 0), (2, 0), colors.whitesmoke),
                ('TEXTCOLOR', (5, 0), (6, 0), colors.whitesmoke),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 0),
                ('TOPPADDING', (0, 0), (-1, 0), 0),

                # Data row font
                ('FONTNAME', (0, 1), (-1, -1), 'SpaceMono'),
                
                # Grid lines
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
    """Draws a single rack, including its front and rear views, onto the canvas."""
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

def draw_title_block(c: canvas.Canvas, title_block_info: dict, x: float, y: float, width: float, height: float, current_page_num: int, total_pages: int):
    """
    Draws the standardized title block onto the canvas.
    
    This function renders an SVG template for the main structure and text of the title block,
    and then draws the show and company logos directly onto the canvas over the SVG.
    This approach is used to ensure that logo transparency is handled correctly.
    """
    c.saveState()
    
    try:
        # --- 1. Render the SVG without logos ---
        with open("app/title_block.svg", "r") as f:
            svg_template = f.read()

        # Replace text placeholders
        replacements = {
            "{{SHOW_NAME}}": title_block_info.get('show_name', ''),
            "{{SHOW_PM}}": title_block_info.get('production_manager', ''),
            "{{SHOW_TD}}": title_block_info.get('technical_director', ''),
            "{{SHOW_DESIGNER}}": title_block_info.get('designer', ''),
            "{{USERS_FULL_NAME}}": title_block_info.get('drawn_by', ''),
            "{{USERS_PRODUCTION_ROLE}}": title_block_info.get('drawn_role', ''),
            "{{DATE_FILE_GENERATED}}": title_block_info.get('generated_at').strftime('%Y-%m-%d'),
            "{{FILE_NAME}}": title_block_info.get('file_name', ''),
            "{{SHEET_TITLE}}": title_block_info.get('sheet_title', ''),
            "{{PAGE_NUM}}": str(current_page_num),
            "{{TOTAL_PAGES}}": str(total_pages),
        }

        for placeholder, value in replacements.items():
            str_value = str(value) if value is not None else ''
            svg_template = svg_template.replace(placeholder, str_value)
        
        # Ensure logo placeholders are empty so they don't render as text
        svg_template = svg_template.replace("{{SHOW_LOGO}}", "")
        svg_template = svg_template.replace("{{COMPANY_LOGO}}", "")

        # Render SVG
        drawing = svg2rlg(io.StringIO(svg_template))
        
        # Calculate scale to fit the provided drawing area
        svg_original_width = 1916
        svg_original_height = 135
        scale_x = width / svg_original_width
        scale_y = height / svg_original_height
        
        drawing.scale(scale_x, scale_y)
        drawing.drawOn(c, x, y)

        # --- 2. Draw logos directly on the canvas ---
        
        def draw_logo_in_box(logo_bytes, box_x, box_y, box_width, box_height):
            if not logo_bytes:
                return
            try:
                logo_reader = ImageReader(io.BytesIO(logo_bytes))
                img_width, img_height = logo_reader.getSize()
                
                ratio = min(box_width / img_width, box_height / img_height) if img_width > 0 and img_height > 0 else 1
                new_width = img_width * ratio
                new_height = img_height * ratio
                
                img_x = box_x + (box_width - new_width) / 2
                img_y = box_y + (box_height - new_height) / 2
                
                c.drawImage(logo_reader, img_x, img_y, width=new_width, height=new_height, mask='auto')
            except Exception as e:
                print(f"Failed to draw logo: {e}")

        # Show Logo
        show_logo_bytes = title_block_info.get('show_logo')
        show_logo_box_x = x + (0 * scale_x)
        show_logo_box_y = y 
        show_logo_box_width = 240 * scale_x
        show_logo_box_height = 135 * scale_y
        draw_logo_in_box(show_logo_bytes, show_logo_box_x, show_logo_box_y, show_logo_box_width, show_logo_box_height)
        
        # Company Logo
        company_logo_bytes = title_block_info.get('company_logo')
        company_logo_box_x = x + (1674.83651 * scale_x)
        company_logo_box_y = y
        company_logo_box_width = 240 * scale_x
        company_logo_box_height = 135 * scale_y
        draw_logo_in_box(company_logo_bytes, company_logo_box_x, company_logo_box_y, company_logo_box_width, company_logo_box_height)

    except Exception as e:
        print(f"Error drawing title block: {e}")
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(x + width / 2, y + height / 2, "Error generating title block.")

    c.restoreState()

def generate_racks_pdf(payload: RackPDFPayload, show_branding: bool = True) -> io.BytesIO:
    """Generates a PDF document from a list of racks."""
    buffer = io.BytesIO()
    page_size_base = PAGE_SIZES.get(payload.page_size.lower(), letter)
    page_size = portrait(page_size_base)
    c = canvas.Canvas(buffer, pagesize=page_size)
    width, height = page_size
    
    MARGIN = 0.25 * inch
    
    for rack in payload.racks:
        title_x = MARGIN
        if show_branding:
            # To implement a logo in the future:
            # 1. Add 'logo_path' as an argument to this function.
            # 2. Uncomment the following lines and remove the text rendering.
            # 3. Ensure the logo_path is passed from the API layer.
            # try:
            #     c.drawImage(logo_path, MARGIN, height - MARGIN, height=0.5*inch, preserveAspectRatio=True, anchor='nw')
            #     title_x = MARGIN + 1.3 * inch 
            # except Exception as e:
            #     print(f"Could not draw logo: {e}")

            # Current implementation: render text at top left
            c.setFont("SpaceMono", 8)
            c.drawString(MARGIN, height - MARGIN, "Created using ShowReady")
            # We will render the main title below this branding text
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

# --- Layout Algorithm ---
TITLE_AREA_HEIGHT = 45  # For the title that sits above the main box
NODE_WIDTH = 250
HEADER_HEIGHT = 100 # Height of the info section *inside* the box
PORT_ROW_HEIGHT = 30
FOOTER_HEIGHT = 20
VERTICAL_GAP = 50
HORIZONTAL_GAP = 300
COLUMN_THRESHOLD = NODE_WIDTH * 0.75

def _calculate_node_height(node):
    """Calculates the total height of a device SVG, including the title area."""
    try:
        num_ports = len(node.data.equipment_templates.ports)
    except (AttributeError, TypeError):
        num_ports = 0
    
    content_height = HEADER_HEIGHT + (num_ports * PORT_ROW_HEIGHT) + FOOTER_HEIGHT
    return TITLE_AREA_HEIGHT + content_height

def layout_diagram(nodes: List) -> (Dict, float, float):
    """
    Arranges nodes to prevent overlap based on their initial positions from the UI.
    Returns a dictionary mapping node_id to its new position and dimensions,
    and the total width and height of the layout.
    """
    if not nodes:
        return {}, 0, 0

    node_dims = {
        node.id: {
            "width": NODE_WIDTH,
            "height": _calculate_node_height(node)
        }
        for node in nodes
    }

    sorted_nodes = sorted(nodes, key=lambda n: n.position.x)
    
    columns = []
    if sorted_nodes:
        current_column = []
        column_x_start = -1
        for node in sorted_nodes:
            if not current_column:
                current_column.append(node)
                column_x_start = node.position.x
            elif node.position.x < column_x_start + COLUMN_THRESHOLD:
                current_column.append(node)
            else:
                columns.append(current_column)
                current_column = [node]
                column_x_start = node.position.x
        columns.append(current_column)

    layout = {}
    current_x = 0
    max_layout_height = 0

    for column in columns:
        sorted_column = sorted(column, key=lambda n: n.position.y)
        
        current_y = 0
        column_width = 0
        
        for node in sorted_column:
            node_id = node.id
            dims = node_dims[node_id]
            
            layout[node_id] = {
                "x": current_x,
                "y": current_y,
                "width": dims["width"],
                "height": dims["height"]
            }
            
            current_y += dims["height"] + VERTICAL_GAP
            if dims["width"] > column_width:
                column_width = dims["width"]
        
        column_height = current_y - VERTICAL_GAP if sorted_column else 0
        if column_height > max_layout_height:
            max_layout_height = column_height

        current_x += column_width + HORIZONTAL_GAP

    total_width = current_x - HORIZONTAL_GAP if columns else 0
    total_height = max_layout_height

    return layout, total_width, total_height


# --- SVG Generation ---

def create_equipment_svg_group(node, node_dims):
    """Creates a detailed SVG <g> element for a single piece of equipment."""
    group = ET.Element('g')
    width = node_dims['width']
    height = node_dims['height']
    template = node.data.equipment_templates

    # Device Nomenclature (centered, above the box)
    title = ET.SubElement(group, 'text', {
        'x': str(width / 2),
        'y': str(TITLE_AREA_HEIGHT - 20), # Positioned in the middle of the title area
        'font-size': '24', 'font-weight': 'bold', 'fill': '#f59e0b',
        'text-anchor': 'middle'
    })
    title.text = node.data.label or ''

    # Main rectangle (the border), shifted down to be below the title
    box_y_start = TITLE_AREA_HEIGHT
    box_height = height - TITLE_AREA_HEIGHT
    ET.SubElement(group, 'rect', {
        'x': '0', 'y': str(box_y_start), 'width': str(width), 'height': str(box_height),
        'stroke': '#000000', 'stroke-width': '2', 'fill': 'none'
    })

    # Model Number, Rack Info, IP Address (shifted down)
    info_y_start = box_y_start + 30 # Start 30px inside the box
    info_line_height = 20
    
    model_text = f"({template.model_number})" if template and template.model_number else ''
    model = ET.SubElement(group, 'text', {
        'x': str(width / 2), 'y': str(info_y_start), 'font-size': '14', 'fill': '#000000',
        'text-anchor': 'middle'
    })
    model.text = model_text

    rack_name = node.data.rack_name or ''
    ru_pos = node.data.ru_position or ''
    rack_info_text = f"{rack_name}.RU{ru_pos}" if rack_name or ru_pos else ''
    rack_info = ET.SubElement(group, 'text', {
        'x': str(width / 2), 'y': str(info_y_start + info_line_height), 'font-size': '14', 'fill': '#666666',
        'text-anchor': 'middle'
    })
    rack_info.text = rack_info_text

    ip_addr_text = node.data.ip_address or ''
    ip_addr = ET.SubElement(group, 'text', {'x': '15', 'y': str(info_y_start + 2 * info_line_height), 'font-size': '14', 'font-weight': 'bold', 'fill': '#3f007f'})
    ip_addr.text = ip_addr_text

    # Port rendering logic (shifted down)
    port_locations = {}
    if template and template.ports:
        input_ports = sorted([p for p in template.ports if p.type == 'input'], key=lambda p: p.id)
        output_ports = sorted([p for p in template.ports if p.type == 'output'], key=lambda p: p.id)
        io_ports = sorted([p for p in template.ports if p.type == 'io'], key=lambda p: p.id)

        port_y_start = box_y_start + HEADER_HEIGHT
        y_in = port_y_start
        y_out = port_y_start
        
        for port in input_ports:
            ET.SubElement(group, 'path', {'d': f"M 5,{y_in-5} L 15,{y_in} L 5,{y_in+5} Z", 'fill': '#5fbf00'})
            port_text = ET.SubElement(group, 'text', {'x': '25', 'y': str(y_in + 5), 'font-size': '14', 'fill': '#000000'})
            port_text.text = port.label
            port_locations[f"port-in-{port.id}"] = (0, y_in)
            y_in += PORT_ROW_HEIGHT

        for port in output_ports:
            ET.SubElement(group, 'path', {'d': f"M {width-15},{y_out-5} L {width-5},{y_out} L {width-15},{y_out+5} Z", 'fill': '#bf0000'})
            port_text = ET.SubElement(group, 'text', {'x': str(width - 25), 'y': str(y_out + 5), 'font-size': '14', 'fill': '#000000', 'text-anchor': 'end'})
            port_text.text = port.label
            port_locations[f"port-out-{port.id}"] = (width, y_out)
            y_out += PORT_ROW_HEIGHT
            
        y_io = max(y_in, y_out)
        if y_io == port_y_start: # If there were no in/out ports, start io ports from the beginning
            y_io = port_y_start
        
        for port in io_ports:
            ET.SubElement(group, 'path', {'d': f"M 5,{y_io-5} L 15,{y_io} L 5,{y_io+5} Z", 'fill': '#5fbf00'})
            ET.SubElement(group, 'path', {'d': f"M {width-15},{y_io-5} L {width-5},{y_io} L {width-15},{y_io+5} Z", 'fill': '#bf0000'})
            
            # Add connecting lines for I/O ports
            ET.SubElement(group, 'line', {
                'x1': '20', 'y1': str(y_io), 'x2': str((width/2) - 40), 'y2': str(y_io),
                'stroke': '#000000', 'stroke-width': '1'
            })
            ET.SubElement(group, 'line', {
                'x1': str((width/2) + 40), 'y1': str(y_io), 'x2': str(width - 20), 'y2': str(y_io),
                'stroke': '#000000', 'stroke-width': '1'
            })

            port_text = ET.SubElement(group, 'text', {'x': str(width / 2), 'y': str(y_io + 5), 'font-size': '14', 'fill': '#000000', 'text-anchor': 'middle'})
            port_text.text = port.label
            port_locations[f"port-in-{port.id}"] = (0, y_io)
            port_locations[f"port-out-{port.id}"] = (width, y_io)
            y_io += PORT_ROW_HEIGHT

    return group, port_locations

def create_connection_label_svg(text):
    """Creates an SVG <g> element for a connection label."""
    group = ET.Element('g')
    ET.SubElement(group, 'rect', {
        'width': '250', 'height': '56', 'stroke': '#000000', 'fill': '#f59e0b', 'stroke-width': '1'
    })
    text_element = ET.SubElement(group, 'text', {
        'x': '125', 'y': '35', 'font-family': "Noto Sans JP, sans-serif",
        'font-size': '18', 'fill': '#000000', 'text-anchor': 'middle'
    })
    text_element.text = text
    return group

def generate_page_svg(page_data, all_nodes_map, all_edges, page_layout, total_width, total_height):
    """
    Generates a complete SVG string for a single page of the wire diagram.
    """
    svg_width = str(total_width + HORIZONTAL_GAP)
    svg_height = str(total_height + VERTICAL_GAP)
    
    root = ET.Element('svg', {
        'width': svg_width, 'height': svg_height, 'xmlns': "http://www.w3.org/2000/svg",
        'font-family': "Noto Sans JP, sans-serif"
    })
    
    main_group = ET.SubElement(root, 'g', {'transform': f'translate({HORIZONTAL_GAP / 2}, {VERTICAL_GAP / 2})'})

    port_positions = {}  # Stores {node_id: {port_handle: (abs_x, abs_y)}}

    # 1. Draw Equipment Nodes and calculate absolute port positions
    for node in page_data.nodes:
        node_id = node.id
        layout_info = page_layout[node_id]
        
        equipment_group, relative_ports = create_equipment_svg_group(node, layout_info)
        equipment_group.set('transform', f"translate({layout_info['x']}, {layout_info['y']})")
        main_group.append(equipment_group)

        port_positions[node_id] = {}
        for handle, (rel_x, rel_y) in relative_ports.items():
            abs_x = layout_info['x'] + rel_x
            abs_y = layout_info['y'] + rel_y
            port_positions[node_id][handle] = (abs_x, abs_y)

    # 2. Draw Connection Lines and Labels (with debugging)
    debug_group = ET.SubElement(root, 'g', {'transform': 'translate(10, 20)'})
    debug_y = 0
    
    current_page_node_ids = set(port_positions.keys())
    for i, edge in enumerate(all_edges):
        debug_y += 20
        debug_text_element = ET.SubElement(debug_group, 'text', {'x': '0', 'y': str(debug_y), 'font-size': '10', 'fill': '#ff0000'})

        source_node_id = edge.source
        target_node_id = edge.target
        source_on_page = source_node_id in current_page_node_ids
        
        debug_info = [f"Edge {i}: {source_node_id}->{target_node_id}", f"OnPage: {source_on_page}"]

        if not source_on_page:
            debug_text_element.text = " | ".join(debug_info)
            continue

        source_info = all_nodes_map.get(source_node_id)
        target_info = all_nodes_map.get(target_node_id)
        
        def get_port_from_handle(node_info, handle):
            try:
                port_id_str = handle.split('-')[-1]
                return next(p for p in node_info['node'].data.equipment_templates.ports if str(p.id) == port_id_str)
            except (IndexError, StopIteration, AttributeError):
                return None

        start_pos = port_positions[source_node_id].get(edge.sourceHandle)
        target_port = get_port_from_handle(target_info, edge.targetHandle)
        
        debug_info.append(f"Handle: {edge.sourceHandle}")
        debug_info.append(f"StartPos: {'Found' if start_pos else 'NOT FOUND'}")
        debug_info.append(f"TargetPort: {'Found' if target_port else 'NOT FOUND'}")
        debug_text_element.text = " | ".join(debug_info)

        if start_pos and target_port:
            label_text = f"{target_info['node'].data.label}.{target_port.label}"
            target_on_page = target_node_id in current_page_node_ids
            if not target_on_page:
                label_text += f" (P.{target_info['page']})"
            
            is_output_handle = 'port-out' in edge.sourceHandle
            if is_output_handle:
                label_x, line_end_x = start_pos[0] + 20, start_pos[0] + 20
            else: # port-in
                label_x, line_end_x = start_pos[0] - 250 - 20, start_pos[0] - 20
            
            label_y = start_pos[1] - 28
            label_group = create_connection_label_svg(label_text)
            label_group.set('transform', f'translate({label_x}, {label_y})')
            main_group.append(label_group)
            ET.SubElement(main_group, 'line', {
                'x1': str(start_pos[0]), 'y1': str(start_pos[1]),
                'x2': str(line_end_x), 'y2': str(start_pos[1]),
                'stroke': '#333', 'stroke-width': '1'
            })


    return ET.tostring(root, encoding='unicode')


def draw_port_symbol(c, x, y, port_type, scale):
    size = 4 * scale
    if port_type in ['input', 'io']:
        c.setFillColor(colors.green)
        p = c.beginPath()
        p.moveTo(x + size, y - size)
        p.lineTo(x, y)
        p.lineTo(x + size, y + size)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
    if port_type in ['output', 'io']: # Draw red symbol for output and io
        c.setFillColor(colors.red)
        p = c.beginPath()
        p.moveTo(x - size, y - size)
        p.lineTo(x, y)
        p.lineTo(x - size, y + size)
        p.close()
        c.drawPath(p, fill=1, stroke=0)

def draw_diagram_page(c: canvas.Canvas, page_data, all_nodes_map, all_edges, show_name, current_page_num, total_pages, title_block_info: dict):
    """
    Generates a single page of the wire diagram PDF by creating an SVG,
    converting it to a ReportLab drawing, and placing it on the canvas.
    """
    width, height = c._pagesize
    MARGIN = 0.25 * inch
    
    # 1. Define Title Block and Drawing Area
    title_block_height = height / 8.0
    draw_area_width = width - (2 * MARGIN)
    draw_area_height = height - (2 * MARGIN) - title_block_height
    draw_area_x = MARGIN
    draw_area_y = MARGIN + title_block_height

    # 2. Perform Layout and Generate SVG
    page_nodes = page_data.nodes
    page_layout, total_width, total_height = layout_diagram(page_nodes)
    
    if not page_layout: # If there are no nodes on the page, just draw title block and return
        draw_title_block(c, title_block_info, 0, 0, width, title_block_height, current_page_num, total_pages)
        return

    svg_string = generate_page_svg(page_data, all_nodes_map, all_edges, page_layout, total_width, total_height)

    # 3. Convert SVG to ReportLab Drawing
    drawing = svg2rlg(io.StringIO(svg_string))

    # 4. Scale and Position Drawing
    svg_native_width = drawing.width
    svg_native_height = drawing.height

    if svg_native_width <= 0 or svg_native_height <= 0:
        scale = 1.0
    else:
        scale_x = draw_area_width / svg_native_width
        scale_y = draw_area_height / svg_native_height
        scale = min(scale_x, scale_y)

    scaled_width = svg_native_width * scale
    scaled_height = svg_native_height * scale

    # Center the drawing in the drawing area
    offset_x = (draw_area_width - scaled_width) / 2
    offset_y = (draw_area_height - scaled_height) / 2
    
    drawing.scale(scale, scale)
    drawing.drawOn(c, draw_area_x + offset_x, draw_area_y + offset_y)

    # 5. Draw Title Block
    draw_title_block(c, title_block_info, 0, 0, width, title_block_height, current_page_num, total_pages)


def generate_wire_diagram_pdf(payload: WireDiagramPDFPayload, title_block_info: dict, show_branding: bool = True) -> io.BytesIO:
    buffer = io.BytesIO()
    page_size_base = PAGE_SIZES.get(payload.page_size.lower(), letter)
    page_size = landscape(page_size_base)
    c = canvas.Canvas(buffer, pagesize=page_size)

    if not payload.pages:
        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer

    all_nodes_map = {}
    all_edges = []
    for page_data in payload.pages:
        for node in page_data.nodes:
            all_nodes_map[node.id] = {"node": node, "page": page_data.page_number}
        if page_data.edges:
            all_edges.extend(page_data.edges)
    
    total_pages = len(payload.pages)
    for i, page_data in enumerate(payload.pages):
        draw_diagram_page(c, page_data, all_nodes_map, all_edges, payload.show_name, i + 1, total_pages, title_block_info)
        c.showPage()

    c.save()
    buffer.seek(0)
    return buffer

