import io
from typing import List, Dict, Optional, Union
from datetime import datetime

from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.pagesizes import letter, landscape, portrait
from reportlab.lib import colors
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.lib.enums import TA_CENTER

from .models import LoomLabel, CaseLabel, WireDiagramPDFPayload, Rack, RackPDFPayload, Loom, LoomBuilderPDFPayload, Cable, LoomWithCables

tabloid = (11 * inch, 17 * inch)
PAGE_SIZES = {
    "letter": portrait(letter),
    "tabloid": portrait(tabloid),
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
        'white': '#FFFFFF', 'gray': '#808080', 'silver': '#C0C0C0', 'maroon': '#800000',
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
        name='BodyText', fontName='Helvetica-Bold', fontSize=28, leading=34, alignment=TA_CENTER)
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

def draw_single_cable_pdf_page(c: canvas.Canvas, cable: "Cable", loom_name: str, show_name: str):
    width, height = letter
    MARGIN = 0.5 * inch
    
    # --- Header ---
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, height - MARGIN, "Loom Build Sheet")
    c.setFont("Helvetica", 12)
    c.drawString(MARGIN, height - MARGIN, show_name)
    c.drawRightString(width - MARGIN, height - MARGIN, f"Generated: {datetime.now().strftime('%Y-%m-%d')}")
    
    # --- Main Info ---
    y_pos = height - MARGIN - (0.75 * inch)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN, y_pos, "Loom:")
    c.setFont("Helvetica", 14)
    c.drawString(MARGIN + 1 * inch, y_pos, loom_name)

    y_pos -= 0.3 * inch
    c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN, y_pos, "Label:")
    c.setFont("Helvetica", 14)
    c.drawString(MARGIN + 1 * inch, y_pos, cable.label_content)

    y_pos -= 0.5 * inch
    c.setFont("Helvetica-Bold", 12)
    c.drawString(MARGIN, y_pos, "Cable Type:")
    c.setFont("Helvetica", 12)
    c.drawString(MARGIN + 1.5 * inch, y_pos, cable.cable_type)
    
    c.setFont("Helvetica-Bold", 12)
    c.drawString(MARGIN + 4 * inch, y_pos, "Length:")
    c.setFont("Helvetica", 12)
    c.drawString(MARGIN + 5 * inch, y_pos, f"{cable.length_ft} ft" if cable.length_ft else "N/A")
    
    # --- Origin / Destination ---
    y_pos -= 0.75 * inch
    c.setStrokeColor(colors.lightgrey)
    c.line(MARGIN, y_pos + 0.125 * inch, width - MARGIN, y_pos + 0.125 * inch)
    
    for i, loc_type in enumerate(['Origin', 'Destination']):
        x_start = MARGIN + (i * (width / 2 - MARGIN))
        
        location = cable.origin if loc_type == 'Origin' else cable.destination
        color = cable.origin_color if loc_type == 'Origin' else cable.destination_color
        
        c.setFont("Helvetica-Bold", 14)
        c.drawString(x_start, y_pos - 0.25 * inch, loc_type)
        
        loc_color = parse_color(color)
        if loc_color:
            c.setFillColor(loc_color)
            c.rect(x_start + 2.5 * inch, y_pos - 0.25 * inch - 2, 1 * inch, 0.25 * inch, fill=1, stroke=0)
        
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 12)
        c.drawString(x_start, y_pos - 0.6 * inch, f"Location: {location.value} ({location.type})")
        c.drawString(x_start, y_pos - 0.85 * inch, f"End: {location.end}")
        
    y_pos -= 1.25 * inch
    c.line(MARGIN, y_pos, width - MARGIN, y_pos)
    
    # --- Checkboxes ---
    y_pos -= 0.5 * inch
    c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN, y_pos, "RCVD:")
    c.rect(MARGIN + 1 * inch, y_pos - 2, 0.25 * inch, 0.25 * inch, fill=0, stroke=1)
    
    c.drawString(MARGIN + 3 * inch, y_pos, "COMPLETE:")
    c.rect(MARGIN + 4.5 * inch, y_pos - 2, 0.25 * inch, 0.25 * inch, fill=0, stroke=1)

def generate_loom_builder_pdf(payload: "LoomBuilderPDFPayload") -> io.BytesIO:
    """Generates a PDF document for a list of looms and their cables."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    
    if not payload.looms:
        # Draw a blank page if there are no looms
        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer

    for loom in payload.looms:
        if loom.cables:
            for cable in loom.cables:
                draw_single_cable_pdf_page(c, cable, loom.name, payload.show_name)
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
    
    # We draw two racks (front and rear) side-by-side
    for i, view in enumerate(['front', 'rear']):
        view_x_start = x_start + (i * (RACK_FRAME_WIDTH + SIDE_PADDING))
        
        y_bottom = y_top - rack_content_height

        # --- Draw Frame and Title ---
        c.setStrokeColor(colors.black)
        c.setLineWidth(1)
        c.rect(view_x_start, y_bottom, RACK_FRAME_WIDTH, rack_content_height)
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(view_x_start + RACK_FRAME_WIDTH / 2, y_top + 0.15 * inch, f"{rack_data.rack_name} - {view.upper()}")

        # --- Draw RU Labels and Rail lines ---
        c.setFont("Helvetica", 5)
        c.setStrokeColor(colors.lightgrey)
        for ru in range(1, rack_data.ru_height + 1):
            ru_y_top = y_bottom + ru * RU_HEIGHT
            c.line(view_x_start, ru_y_top, view_x_start + RACK_FRAME_WIDTH, ru_y_top)

            # Draw number labels on the left and right rails
            c.setFillColor(colors.black)
            text_y = ru_y_top - (RU_HEIGHT / 2) - 2 # Center text in the RU
            c.drawCentredString(view_x_start - (RACK_LABEL_WIDTH / 2), text_y, str(ru))
            c.drawCentredString(view_x_start + RACK_FRAME_WIDTH + (RACK_LABEL_WIDTH / 2), text_y, str(ru))
        
        # --- Draw Equipment ---
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
            if is_half_width:
                if equip.rack_side.endswith('-right'):
                    equip_x_start += RACK_FRAME_WIDTH / 2
            
            c.setFillColorRGB(0.88, 0.88, 0.88)
            c.setStrokeColor(colors.black)
            c.rect(equip_x_start, equip_bottom_y, equip_width, equip_height, fill=1, stroke=1)
            
            # --- Draw Equipment Labels ---
            # Center instance name
            c.setFillColor(colors.black)
            c.setFont("Helvetica-Bold", 8)
            text_x = equip_x_start + (equip_width / 2)
            text_y = equip_bottom_y + (equip_height / 2) - 4
            c.drawCentredString(text_x, text_y, equip.instance_name or equip_template.model_number)

            # Model number in upper right
            c.setFont("Helvetica", 6)
            c.drawRightString(equip_x_start + equip_width - 0.05 * inch, equip_bottom_y + equip_height - 0.1 * inch, equip_template.model_number)


def generate_racks_pdf(payload: RackPDFPayload) -> io.BytesIO:
    """Generates a PDF document from a list of racks."""
    buffer = io.BytesIO()
    page_size = PAGE_SIZES.get(payload.page_size.lower(), portrait(letter))
    c = canvas.Canvas(buffer, pagesize=page_size)
    width, height = page_size
    
    MARGIN = 0.5 * inch
    
    for rack in payload.racks:
        c.setFont("Helvetica-Bold", 16)
        c.drawString(MARGIN, height - MARGIN, payload.show_name)
        c.setFont("Helvetica", 10)
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
    if port_type == 'input':
        c.setFillColor(colors.green)
        p = c.beginPath()
        p.moveTo(x + size, y - size)
        p.lineTo(x, y)
        p.lineTo(x + size, y + size)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
    elif port_type == 'output':
        c.setFillColor(colors.red)
        p = c.beginPath()
        p.moveTo(x - size, y - size)
        p.lineTo(x, y)
        p.lineTo(x - size, y + size)
        p.close()
        c.drawPath(p, fill=1, stroke=0)

def draw_diagram_page(c: canvas.Canvas, page_data, all_nodes_map, show_name, current_page_num, total_pages):
    width, height = c._pagesize
    MARGIN = 0.5 * inch
    TITLE_BLOCK_HEIGHT = 0.75 * inch
    DRAW_AREA_WIDTH = width - (2 * MARGIN)
    DRAW_AREA_HEIGHT = height - (2 * MARGIN) - TITLE_BLOCK_HEIGHT
    
    # Simple scaling: fit the content to the draw area.
    # This assumes the user has laid out the tab content reasonably.
    min_x = min((n.position.x for n in page_data.nodes), default=0)
    max_x = max((n.position.x + n.width for n in page_data.nodes), default=DRAW_AREA_WIDTH)
    min_y = min((n.position.y for n in page_data.nodes), default=0)
    max_y = max((n.position.y + n.height for n in page_data.nodes), default=DRAW_AREA_HEIGHT)

    content_width = max_x - min_x
    content_height = max_y - min_y

    scale_x = DRAW_AREA_WIDTH / content_width if content_width > 0 else 1
    scale_y = DRAW_AREA_HEIGHT / content_height if content_height > 0 else 1
    scale = min(scale_x, scale_y, 1.0) # Don't scale up, only down

    # Calculate centering offsets
    scaled_content_width = content_width * scale
    scaled_content_height = content_height * scale
    offset_x = (DRAW_AREA_WIDTH - scaled_content_width) / 2
    offset_y = (DRAW_AREA_HEIGHT - scaled_content_height) / 2

    c.saveState()
    # Set origin to top-left of drawing area, including centering offsets
    c.translate(MARGIN + offset_x, height - MARGIN - TITLE_BLOCK_HEIGHT - offset_y)
    # Adjust for content origin
    c.translate(-min_x * scale, min_y * scale)

    # --- Draw Title Block ---
    c.restoreState() # Go back to default canvas coordinates
    c.saveState()
    c.setStrokeColor(colors.black)
    c.setLineWidth(1)
    c.rect(MARGIN, MARGIN, DRAW_AREA_WIDTH, DRAW_AREA_HEIGHT + TITLE_BLOCK_HEIGHT) # Full border
    c.line(MARGIN, MARGIN + DRAW_AREA_HEIGHT, width - MARGIN, MARGIN + DRAW_AREA_HEIGHT) # Title block separator
    
    c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN + 0.1 * inch, MARGIN + DRAW_AREA_HEIGHT + 0.25 * inch, f"{show_name} - Wire Diagram")
    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, MARGIN + DRAW_AREA_HEIGHT + 0.25 * inch, f"Page {current_page_num} of {total_pages}")
    c.setFont("Helvetica", 10)
    c.drawRightString(width - MARGIN - 0.1 * inch, MARGIN + DRAW_AREA_HEIGHT + 0.25 * inch, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    c.restoreState() # Back to default
    
    # --- Start drawing content ---
    c.translate(MARGIN + offset_x, height - MARGIN - TITLE_BLOCK_HEIGHT - offset_y)
    c.translate(-min_x * scale, min_y * scale)

    port_locations = {}
    current_page_node_ids = {node.id for node in page_data.nodes}

    # --- Draw Nodes ---
    for node in page_data.nodes:
        node_w = node.width * scale
        input_ports = [p for p in node.data.equipment_templates.ports if p.type == 'input']
        output_ports = [p for p in node.data.equipment_templates.ports if p.type == 'output']
        port_rows = max(len(input_ports), len(output_ports))
        node_h = (25 + (port_rows * 15) + 10) * scale # Base height + ports + padding
        
        node_x = node.position.x * scale
        node_y = -node.position.y * scale - node_h

        # Node box and header
        c.saveState()
        path = c.beginPath()
        path.roundRect(node_x, node_y, node_w, node_h, 4 * scale)
        c.clipPath(path, stroke=1, fill=0)
        c.setFillColor(colors.white)
        c.rect(node_x, node_y, node_w, node_h, fill=1, stroke=0)
        header_h = 25 * scale
        c.setFillColorRGB(0.2, 0.2, 0.2) # Dark gray header
        c.rect(node_x, node_y + node_h - header_h, node_w, header_h, fill=1, stroke=0)
        c.restoreState()
        
        # Header text
        c.setFont("Helvetica-Bold", 8 * scale)
        text_y = node_y + node_h - (15 * scale)
        header_padding = 5 * scale
        c.setFillColor(colors.white)
        c.drawString(node_x + header_padding, text_y, node.data.label) # Instance name
        c.setFont("Helvetica", 7 * scale)
        c.drawRightString(node_x + node_w - header_padding, text_y, f"{node.data.rack_name or ''} RU{node.data.ru_position or ''}")

        # Ports
        c.setFont("Helvetica", 8 * scale)
        port_start_y = node_y + node_h - header_h - (15 * scale)
        port_spacing = 15 * scale
        port_locations[node.id] = {}
        for i, port in enumerate(input_ports):
            y = port_start_y - (i * port_spacing)
            c.setFillColor(colors.black)
            c.drawString(node_x + (15 * scale), y - (3*scale), f"{port.label} ({port.connector_type})")
            draw_port_symbol(c, node_x + (8*scale), y, 'input', scale)
            port_locations[node.id][f"port-in-{port.id}"] = (node_x, y)
        for i, port in enumerate(output_ports):
            y = port_start_y - (i * port_spacing)
            c.setFillColor(colors.black)
            c.drawRightString(node_x + node_w - (15 * scale), y - (3*scale), f"({port.connector_type}) {port.label}")
            draw_port_symbol(c, node_x + node_w - (8*scale), y, 'output', scale)
            port_locations[node.id][f"port-out-{port.id}"] = (node_x + node_w, y)

    # --- Draw Edges and Cross-Page Connection Labels ---
    c.setStrokeColor(colors.black)
    c.setLineWidth(1 * scale)
    for edge in page_data.edges:
        is_source_on_page = edge.source in port_locations
        is_target_on_page = edge.target in current_page_node_ids

        if is_source_on_page and is_target_on_page: # Intra-page edge
            if edge.sourceHandle in port_locations[edge.source] and edge.targetHandle in port_locations[edge.target]:
                start_x, start_y = port_locations[edge.source][edge.sourceHandle]
                end_x, end_y = port_locations[edge.target][edge.targetHandle]
                path = c.beginPath()
                path.moveTo(start_x, start_y)
                mid_x = start_x + (end_x - start_x) / 2
                path.lineTo(mid_x, start_y)
                path.lineTo(mid_x, end_y)
                path.lineTo(end_x, end_y)
                c.drawPath(path)
        
        elif is_source_on_page and not is_target_on_page: # Cross-page edge (outgoing)
            target_node_info = all_nodes_map.get(edge.target)
            if target_node_info and edge.sourceHandle in port_locations[edge.source]:
                start_x, start_y = port_locations[edge.source][edge.sourceHandle]
                c.setFont("Helvetica-Oblique", 7 * scale)
                c.setFillColor(colors.blue)
                label_text = f"-> To: {target_node_info['label']} on Page {target_node_info['page']}"
                c.drawString(start_x + (5 * scale), start_y - (3 * scale), label_text)

def generate_wire_diagram_pdf(payload: WireDiagramPDFPayload) -> io.BytesIO:
    buffer = io.BytesIO()
    page_size = PAGE_SIZES.get(payload.page_size.lower(), landscape(letter))
    c = canvas.Canvas(buffer, pagesize=page_size)

    if not payload.pages:
        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer

    # Create a lookup map for all nodes across all pages for cross-reference
    all_nodes_map = {}
    for page_data in payload.pages:
        for node in page_data.nodes:
            all_nodes_map[node.id] = {"label": node.data.label, "page": page_data.page_number}
    
    total_pages = len(payload.pages)
    for i, page_data in enumerate(payload.pages):
        draw_diagram_page(c, page_data, all_nodes_map, payload.show_name, i + 1, total_pages)
        c.showPage()

    c.save()
    buffer.seek(0)
    return buffer
