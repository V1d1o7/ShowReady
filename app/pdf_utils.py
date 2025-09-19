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
        y_top = height - 0.5 * inch
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
            table.drawOn(c, 0.5 * inch, y_pos - table_height)

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

def generate_racks_pdf(payload: RackPDFPayload, show_branding: bool = True) -> io.BytesIO:
    """Generates a PDF document from a list of racks."""
    buffer = io.BytesIO()
    page_size_base = PAGE_SIZES.get(payload.page_size.lower(), letter)
    page_size = portrait(page_size_base)
    c = canvas.Canvas(buffer, pagesize=page_size)
    width, height = page_size
    
    MARGIN = 0.5 * inch
    
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

def draw_diagram_page(c: canvas.Canvas, payload: WireDiagramPDFPayload, page_data, all_nodes_map, show_name, current_page_num, total_pages, show_branding: bool = True):
    width, height = c._pagesize
    MARGIN = 0.5 * inch
    TITLE_BLOCK_HEIGHT = 0.75 * inch
    DRAW_AREA_WIDTH = width - (2 * MARGIN)
    DRAW_AREA_HEIGHT = height - (2 * MARGIN) - TITLE_BLOCK_HEIGHT
    
    # Pre-calculate node heights
    node_heights = {}
    for node in page_data.nodes:
        all_ports = node.data.equipment_templates.ports
        input_ports = [p for p in all_ports if p.type == 'input']
        output_ports = [p for p in all_ports if p.type == 'output']
        io_ports = [p for p in all_ports if p.type == 'io']
        
        port_rows = max(len(input_ports), len(output_ports))
        header_h = 25
        port_spacing = 25
        top_padding = 20
        bottom_padding = 10
        # Add height for IO ports, which will be drawn separately
        calculated_height = header_h + top_padding + (port_rows * port_spacing) + (len(io_ports) * port_spacing) + bottom_padding
        node_heights[node.id] = calculated_height

    min_x = min((n.position.x for n in page_data.nodes), default=0)
    max_x = max((n.position.x + n.width for n in page_data.nodes), default=DRAW_AREA_WIDTH)
    min_y = min((n.position.y for n in page_data.nodes), default=0)
    max_y = max((n.position.y + node_heights[n.id] for n in page_data.nodes), default=DRAW_AREA_HEIGHT)

    # Add padding to prevent text boxes from overlapping nodes at the edges
    horizontal_padding = 150 
    content_width = (max_x - min_x) + (2 * horizontal_padding)
    content_height = max_y - min_y

    scale_x = DRAW_AREA_WIDTH / content_width if content_width > 0 else 1
    scale_y = DRAW_AREA_HEIGHT / content_height if content_height > 0 else 1
    scale = min(scale_x, scale_y, 1.0)

    scaled_content_width = content_width * scale
    scaled_content_height = content_height * scale
    offset_x = (DRAW_AREA_WIDTH - scaled_content_width) / 2
    offset_y = (DRAW_AREA_HEIGHT - scaled_content_height) / 2

    c.saveState()
    # Apply padding to the translation
    c.translate(MARGIN + offset_x + (horizontal_padding * scale), height - MARGIN - TITLE_BLOCK_HEIGHT - offset_y)
    c.translate(-min_x * scale, min_y * scale)

    c.restoreState()
    c.saveState()
    c.setStrokeColor(colors.black)
    c.setLineWidth(1)
    # Removed the full page border rectangle, keeping only the underline for the title block
    c.line(MARGIN, MARGIN + DRAW_AREA_HEIGHT, width - MARGIN, MARGIN + DRAW_AREA_HEIGHT)
    
    # --- Title Block Content ---
    title_block_bottom = MARGIN + DRAW_AREA_HEIGHT
    
    # Define vertical positions for two lines within the title block
    line1_y = title_block_bottom + (TITLE_BLOCK_HEIGHT * 0.66)
    line2_y = title_block_bottom + (TITLE_BLOCK_HEIGHT * 0.25)
    
    # Define horizontal positions
    left_x = MARGIN + 0.1 * inch
    center_x = width / 2
    right_x = width - MARGIN - 0.1 * inch

    # Line 1: Show Title (Centered)
    c.setFont("SpaceMono-Bold", 14)
    c.drawCentredString(center_x, line1_y, f"{show_name} - Wire Diagram")
    
    # Line 2: Page Number (Left), Branding (if enabled), Generated Date (Right)
    c.setFont("SpaceMono", 10)
    c.drawString(left_x, line2_y, f"Page {current_page_num} of {total_pages}")
    
    if show_branding:
        c.setFont("SpaceMono", 8)
        c.drawCentredString(center_x, line2_y, "Created using ShowReady")

    c.setFont("SpaceMono", 10)
    c.drawRightString(right_x, line2_y, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    c.restoreState()
    
    # Main drawing canvas transform
    c.translate(MARGIN + offset_x + (horizontal_padding * scale), height - MARGIN - TITLE_BLOCK_HEIGHT - offset_y)
    c.translate(-min_x * scale, min_y * scale)

    port_locations = {}
    current_page_node_ids = {node.id for node in page_data.nodes}

    for node in page_data.nodes:
        node_w = node.width * scale
        node_h = node_heights[node.id] * scale
        
        node_x = node.position.x * scale
        node_y = -node.position.y * scale - node_h
        
        header_h = 25 * scale
        
        c.saveState()
        path = c.beginPath()
        path.roundRect(node_x, node_y, node_w, node_h, 4 * scale)
        c.clipPath(path, stroke=1, fill=0)
        c.setFillColor(colors.white)
        c.rect(node_x, node_y, node_w, node_h, fill=1, stroke=0)
        c.setFillColorRGB(0.2, 0.2, 0.2)
        c.rect(node_x, node_y + node_h - header_h, node_w, header_h, fill=1, stroke=0)
        c.restoreState()
        
        c.setFont("SpaceMono-Bold", 8 * scale)
        text_y = node_y + node_h - (15 * scale)
        header_padding = 5 * scale
        c.setFillColor(colors.white)
        c.drawString(node_x + header_padding, text_y, node.data.label)
        c.setFont("SpaceMono", 7 * scale)
        c.drawRightString(node_x + node_w - header_padding, text_y, f"{node.data.rack_name or ''} RU{node.data.ru_position or ''}")

        c.setFont("SpaceMono", 8 * scale)
        port_spacing = 25 * scale
        top_padding = 20 * scale
        port_start_y = node_y + node_h - header_h - top_padding - (port_spacing / 2)
        port_locations[node.id] = {}

        all_ports = node.data.equipment_templates.ports
        input_ports = sorted([p for p in all_ports if p.type == 'input'], key=lambda p: p.id)
        output_ports = sorted([p for p in all_ports if p.type == 'output'], key=lambda p: p.id)
        io_ports = sorted([p for p in all_ports if p.type == 'io'], key=lambda p: p.id)

        for i, port in enumerate(input_ports):
            y = port_start_y - (i * port_spacing)
            c.setFillColor(colors.black)
            c.drawString(node_x + (15 * scale), y - (3*scale), f"{port.label} ({port.connector_type})")
            draw_port_symbol(c, node_x + (4*scale), y, port.type, scale)
            port_locations[node.id][f"port-in-{port.id}"] = (node_x, y)
            
        for i, port in enumerate(output_ports):
            y = port_start_y - (i * port_spacing)
            c.setFillColor(colors.black)
            c.drawRightString(node_x + node_w - (15 * scale), y - (3*scale), f"({port.connector_type}) {port.label}")
            draw_port_symbol(c, node_x + node_w - (4*scale), y, port.type, scale)
            port_locations[node.id][f"port-out-{port.id}"] = (node_x + node_w, y)

        # Draw IO ports centered, below the dedicated inputs/outputs
        io_start_y = port_start_y - (max(len(input_ports), len(output_ports)) * port_spacing)
        for i, port in enumerate(io_ports):
            y = io_start_y - (i * port_spacing)
            c.setFillColor(colors.black)
            c.drawCentredString(node_x + node_w / 2, y - (3 * scale), f"{port.label} ({port.connector_type})")
            draw_port_symbol(c, node_x + (4*scale), y, port.type, scale)
            draw_port_symbol(c, node_x + node_w - (4*scale), y, port.type, scale)
            port_locations[node.id][f"port-in-{port.id}"] = (node_x, y)
            port_locations[node.id][f"port-out-io-{port.id}"] = (node_x + node_w, y)

    all_edges = [edge for p in payload.pages for edge in p.edges]

    for edge in all_edges:
        source_node_info = all_nodes_map.get(edge.source)
        target_node_info = all_nodes_map.get(edge.target)
        if not source_node_info or not target_node_info:
            continue

        source_node_data = source_node_info['node']
        target_node_data = target_node_info['node']
        
        def get_port_id_from_handle(handle):
            parts = handle.split('-')
            if len(parts) > 2:
                return '-'.join(parts[2:])
            return None

        source_port_id_str = get_port_id_from_handle(edge.sourceHandle)
        target_port_id_str = get_port_id_from_handle(edge.targetHandle)

        if not source_port_id_str or not target_port_id_str:
            continue

        source_port = next((p for p in source_node_data.data.equipment_templates.ports if str(p.id) == source_port_id_str), None)
        target_port = next((p for p in target_node_data.data.equipment_templates.ports if str(p.id) == target_port_id_str), None)

        if not source_port or not target_port:
            continue
        
        source_handle = edge.sourceHandle if source_port.type != 'io' else f"port-out-io-{source_port.id}" if edge.sourceHandle.startswith('port-out') else edge.sourceHandle
        target_handle = edge.targetHandle

        # Draw source-side text box if the source node is on the current page
        if edge.source in port_locations and source_handle in port_locations[edge.source]:
            text = f"{target_node_data.data.label}.{target_port.label}"
            is_off_page = edge.target not in current_page_node_ids
            if is_off_page:
                text += f" (P.{target_node_info['page']})"
            
            start_x, start_y = port_locations[edge.source][source_handle]
            
            box_width = 150 * scale 
            box_height = 15 * scale # Made smaller
            
            is_output_side = source_port.type == 'output' or (source_port.type == 'io' and edge.sourceHandle.startswith('port-out'))
            box_x = start_x + (5 * scale) if is_output_side else start_x - box_width - (5 * scale)
            box_y = start_y - (box_height / 2)

            c.setStrokeColor(colors.gray)
            c.setLineWidth(0.5)
            line_end_x = box_x if is_output_side else box_x + box_width
            c.line(start_x, start_y, line_end_x, box_y + box_height/2)
            
            c.setFillColor(colors.HexColor('#f59e0b'))
            c.setStrokeColor(colors.black)
            c.setLineWidth(1)
            c.rect(box_x, box_y, box_width, box_height, fill=1, stroke=1)
            
            c.setFillColor(colors.black)
            font_size = 8 * scale # Made smaller
            text_width = c.stringWidth(text, "SpaceMono", font_size)
            while text_width > box_width * 0.95 and font_size > 6:
                font_size -= 1
                text_width = c.stringWidth(text, "SpaceMono", font_size)
            
            c.setFont("SpaceMono", font_size)
            c.drawCentredString(box_x + box_width / 2, box_y + box_height / 2 - (font_size / 2.5), text)

        # Draw target-side text box if the target node is on the current page
        if edge.target in port_locations and target_handle in port_locations[edge.target]:
            text = f"{source_node_data.data.label}.{source_port.label}"
            is_off_page = edge.source not in current_page_node_ids
            if is_off_page:
                text += f" (P.{source_node_info['page']})"
            
            start_x, start_y = port_locations[edge.target][target_handle]
            
            box_width = 150 * scale 
            box_height = 15 * scale # Made smaller
            
            is_input_side = target_port.type == 'input' or (target_port.type == 'io' and edge.targetHandle.startswith('port-in'))
            box_x = start_x - box_width - (5 * scale) if is_input_side else start_x + (5 * scale)
            box_y = start_y - (box_height / 2)
            
            c.setStrokeColor(colors.gray)
            c.setLineWidth(0.5)
            line_end_x = box_x + box_width if is_input_side else box_x
            c.line(start_x, start_y, line_end_x, box_y + box_height / 2)

            c.setFillColor(colors.HexColor('#f59e0b'))
            c.setStrokeColor(colors.black)
            c.setLineWidth(1)
            c.rect(box_x, box_y, box_width, box_height, fill=1, stroke=1)
            
            c.setFillColor(colors.black)
            font_size = 8 * scale # Made smaller
            text_width = c.stringWidth(text, "SpaceMono", font_size)
            while text_width > box_width * 0.95 and font_size > 6:
                font_size -= 1
                text_width = c.stringWidth(text, "SpaceMono", font_size)
            
            c.setFont("SpaceMono", font_size)
            c.drawCentredString(box_x + box_width / 2, box_y + box_height / 2 - (font_size / 2.5), text)


def generate_wire_diagram_pdf(payload: WireDiagramPDFPayload, show_branding: bool = True) -> io.BytesIO:
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
    for page_data in payload.pages:
        for node in page_data.nodes:
            all_nodes_map[node.id] = {"node": node, "page": page_data.page_number}
    
    total_pages = len(payload.pages)
    for i, page_data in enumerate(payload.pages):
        draw_diagram_page(c, payload, page_data, all_nodes_map, payload.show_name, i + 1, total_pages, show_branding=show_branding)
        c.showPage()

    c.save()
    buffer.seek(0)
    return buffer

