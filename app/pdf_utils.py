import io
from typing import List, Dict, Optional, Union
from datetime import datetime

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
from reportlab.lib.pagesizes import letter, legal, A4, elevenSeventeen, landscape

PAGE_SIZES = {
    "letter": letter,
    "legal": legal,
    "tabloid": elevenSeventeen,
    "a4": A4,
}

def draw_port_symbol(c, x, y, port_type, scale):
    """Draws a port symbol (triangle) on the canvas."""
    # TODO: Add 'bidirectional' type to data model and draw diamond shape
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

def generate_wire_diagram_pdf(payload: WireDiagramPDFPayload) -> io.BytesIO:
    buffer = io.BytesIO()
    page_size = landscape(PAGE_SIZES.get(payload.page_size.lower(), letter))
    c = canvas.Canvas(buffer, pagesize=page_size)
    width, height = page_size

    # --- Margins and Constants ---
    MARGIN = 0.5 * inch
    TITLE_BLOCK_HEIGHT = 0.75 * inch
    COLUMN_SPACING = 0.5 * inch
    DRAW_AREA_WIDTH = width - (2 * MARGIN)
    DRAW_AREA_HEIGHT = height - (2 * MARGIN) - TITLE_BLOCK_HEIGHT

    # --- Group nodes by rack ---
    racks = {}
    for node in payload.nodes:
        rack_name = node.data.rack_name or "Unracked"
        if rack_name not in racks:
            racks[rack_name] = []
        racks[rack_name].append(node)
    
    sorted_rack_names = sorted(racks.keys(), key=lambda x: (x == "Unracked", x))

    # --- Calculate Column Widths and Total Width ---
    column_widths = {}
    for rack_name, nodes in racks.items():
        max_w = 0
        for node in nodes:
            c.setFont("Helvetica-Bold", 8) # Use a standard size for calculation
            model_name_w = c.stringWidth(node.data.equipment_templates.model_number)
            ip_addr_w = c.stringWidth(node.data.ip_address or "")
            loc_w = c.stringWidth(f"{node.data.rack_name or ''} RU{node.data.ru_position or ''}")
            
            c.setFont("Helvetica", 8)
            input_ports = [p for p in node.data.equipment_templates.ports if p.type == 'input']
            output_ports = [p for p in node.data.equipment_templates.ports if p.type == 'output']
            max_input_w = max([c.stringWidth(f"{p.label} ({p.connector_type})") for p in input_ports] or [0])
            max_output_w = max([c.stringWidth(f"({p.connector_type}) {p.label}") for p in output_ports] or [0])
            
            padding = 40
            node_w = max_input_w + max_output_w + padding
            header_content_w = model_name_w + ip_addr_w + loc_w + (padding * 2)
            max_w = max(max_w, node_w, header_content_w, 150)
        column_widths[rack_name] = max_w

    total_content_width = sum(column_widths.values()) + (COLUMN_SPACING * (len(racks) - 1))
    
    # --- Calculate Scale Factor ---
    scale = DRAW_AREA_WIDTH / total_content_width if total_content_width > 0 else 1
    scale = min(scale, 1.0) # Don't scale up

    # --- Draw Title Block ---
    c.saveState()
    c.setStrokeColor(colors.black)
    c.setLineWidth(1)
    c.rect(MARGIN, height - MARGIN - TITLE_BLOCK_HEIGHT, DRAW_AREA_WIDTH, TITLE_BLOCK_HEIGHT)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN + 0.1 * inch, height - MARGIN - 0.3 * inch, payload.show_name)
    c.setFont("Helvetica", 10)
    c.drawRightString(width - MARGIN - 0.1 * inch, height - MARGIN - 0.3 * inch, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    c.restoreState()

    # --- Draw Racks and Nodes ---
    port_locations = {}
    current_x = MARGIN
    
    for rack_name in sorted_rack_names:
        nodes_in_rack = racks[rack_name]
        rack_width = column_widths[rack_name] * scale
        
        # --- Find vertical bounds and scale for this column ---
        min_y_rack = min(n.position.y for n in nodes_in_rack)
        max_y_rack = max(n.position.y + n.height for n in nodes_in_rack)
        rack_content_height = max_y_rack - min_y_rack
        
        scale_y_rack = DRAW_AREA_HEIGHT / rack_content_height if rack_content_height > 0 else 1
        scale_y_rack = min(scale_y_rack, 1.0)

        def ty_rack(y): return height - MARGIN - TITLE_BLOCK_HEIGHT - ((y - min_y_rack) * scale_y_rack)

        for node in nodes_in_rack:
            node_w = rack_width
            
            input_ports = [p for p in node.data.equipment_templates.ports if p.type == 'input']
            output_ports = [p for p in node.data.equipment_templates.ports if p.type == 'output']
            port_rows = max(len(input_ports), len(output_ports))
            node_h = (25 + (port_rows * 15) + 5) * scale # Use the global scale for font consistency
            
            node_x = current_x
            node_y = ty_rack(node.position.y) - node_h

            # --- Draw Outer Title ---
            c.setFont("Helvetica-Bold", 12 * scale)
            c.setFillColor(colors.blue)
            c.drawCentredString(node_x + node_w / 2, node_y + node_h + (10 * scale), node.data.label)

            # --- Draw Main Node Block ---
            c.saveState()
            path = c.beginPath()
            path.roundRect(node_x, node_y, node_w, node_h, 4 * scale)
            c.clipPath(path, stroke=1, fill=0)
            c.setFillColor(colors.white)
            c.rect(node_x, node_y, node_w, node_h, fill=1, stroke=0)

            # --- Draw Header Row ---
            header_h = 25 * scale
            c.setFillColorRGB(80/255, 95/255, 122/255)
            c.rect(node_x, node_y + node_h - header_h, node_w, header_h, fill=1, stroke=0)
            
            # --- Draw Aligned Header Text ---
            c.setFont("Helvetica-Bold", 8 * scale)
            text_y = node_y + node_h - (15 * scale)
            header_padding = 5 * scale
            c.setFillColorRGB(24/255, 28/255, 37/255)
            c.drawString(node_x + header_padding, text_y, node.data.equipment_templates.model_number)
            if node.data.ip_address:
                c.setFillColorRGB(64/255, 0/255, 128/255)
                c.drawCentredString(node_x + node_w / 2, text_y, node.data.ip_address)
            c.setFillColorRGB(192/255, 192/255, 192/255)
            c.drawRightString(node_x + node_w - header_padding, text_y, f"{node.data.rack_name or ''} RU{node.data.ru_position or ''}")

            # --- Draw Port Columns ---
            c.setFont("Helvetica", 8 * scale)
            port_start_y = node_y + node_h - header_h - (15 * scale)
            port_spacing = 15 * scale
            port_locations[node.id] = {}

            for i, port in enumerate(input_ports):
                y = port_start_y - (i * port_spacing)
                c.setFillColor(colors.black)
                c.drawString(node_x + (10 * scale), y - (3*scale), f"{port.label} ({port.connector_type})")
                draw_port_symbol(c, node_x, y, 'input', scale)
                port_locations[node.id][f"port-in-{port.id}"] = (node_x, y)

            for i, port in enumerate(output_ports):
                y = port_start_y - (i * port_spacing)
                c.setFillColor(colors.black)
                c.drawRightString(node_x + node_w - (10 * scale), y - (3*scale), f"({port.connector_type}) {port.label}")
                draw_port_symbol(c, node_x + node_w, y, 'output', scale)
                port_locations[node.id][f"port-out-{port.id}"] = (node_x + node_w, y)

            c.restoreState()
        
        current_x += rack_width + COLUMN_SPACING

    # --- Draw Edges ---
    c.setStrokeColor(colors.black)
    c.setLineWidth(0.8 * scale)
    for edge in payload.edges:
        if edge.source in port_locations and edge.target in port_locations:
            if edge.sourceHandle in port_locations[edge.source] and edge.targetHandle in port_locations[edge.target]:
                start_x, start_y = port_locations[edge.source][edge.sourceHandle]
                end_x, end_y = port_locations[edge.target][edge.targetHandle]
                path = c.beginPath()
                path.moveTo(start_x, start_y)
                control_offset = max(30 * scale, abs(start_x - end_x) * 0.3)
                path.curveTo(start_x + control_offset, start_y, end_x - control_offset, end_y, end_x, end_y)
                c.drawPath(path)

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer
