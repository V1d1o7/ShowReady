import io
import base64
from typing import List, Dict, Any

from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from reportlab.pdfbase.pdfmetrics import stringWidth
from PIL import Image

from app.models import LabelTemplate, LabelStock, LabelElement

def draw_element(c: canvas.Canvas, element: LabelElement, row_data: Dict[str, Any], stock: LabelStock):
    """Draws a single element onto the canvas based on its type and properties."""
    # Convert element properties from inches to points
    x = element.x * inch
    y = (stock.page_height - element.y - element.height) * inch # Y is from top in our model
    width = element.width * inch
    height = element.height * inch

    if element.type == 'text':
        content = element.text_content or ""
        if element.variable_field and element.variable_field in row_data:
            content = str(row_data.get(element.variable_field, ""))

        c.saveState()
        font_name = element.font_family or 'Helvetica'
        font_size = element.font_size or 10
        
        c.setFont(font_name, font_size)
        c.setFillColor(colors.HexColor(element.text_color or '#000000'))
        
        # Handle text alignment
        text_x = x
        align = element.text_align or 'left'
        if align == 'center':
            text_width = stringWidth(content, font_name, font_size)
            text_x = x + (width - text_width) / 2
        elif align == 'right':
            text_width = stringWidth(content, font_name, font_size)
            text_x = x + width - text_width

        # Adjust y for baseline - positions text near the top of the element's bounding box
        text_y = y + height - font_size * 0.9 

        text = c.beginText(text_x, text_y)
        text.textLine(content)
        c.drawText(text)
        c.restoreState()

    elif element.type == 'shape':
        c.saveState()
        fill = element.fill_color and element.fill_color != 'transparent'
        if fill:
            c.setFillColor(colors.HexColor(element.fill_color))
        else:
            c.nofill()
        
        c.setStrokeColor(colors.HexColor(element.stroke_color or '#000000'))
        c.setLineWidth(element.stroke_width or 1.0)
        
        # For now, we assume all shapes are rectangles
        c.rect(x, y, width, height, fill=1 if fill else 0, stroke=1)
        c.restoreState()

    elif element.type == 'qrcode':
        content_to_encode = ""
        if element.qr_content and element.qr_content in row_data:
            content_to_encode = str(row_data.get(element.qr_content, ""))

        if content_to_encode:
            qr_code = qr.QrCodeWidget(content_to_encode)
            bounds = qr_code.getBounds()
            qr_width = bounds[2] - bounds[0]
            qr_height = bounds[3] - bounds[1]
            
            transform = [width / qr_width, 0, 0, height / qr_height, x, y]
            d = Drawing(width, height, transform=transform)
            d.add(qr_code)
            renderPDF.draw(d, c, 0, 0)
            
    elif element.type == 'image':
        image_bytes = None
        # The router is responsible for adding __SHOW_LOGO__ to each data_row
        if element.variable_field == '__SHOW_LOGO__' and row_data.get('__SHOW_LOGO__'):
            try:
                base64_string = row_data['__SHOW_LOGO__']
                if "," in base64_string:
                    base64_string = base64_string.split(",")[1]
                image_bytes = base64.b64decode(base64_string)
            except Exception as e:
                print(f"Error decoding base64 image data for element {element.id}: {repr(e)}")
        
        if image_bytes:
            try:
                img_reader = Image.open(io.BytesIO(image_bytes))
                c.drawImage(img_reader, x, y, width, height, preserveAspectRatio=True, anchor='c')
            except Exception as e:
                print(f"Error drawing image for element {element.id}: {repr(e)}")

def render_template_to_buffer(template: LabelTemplate, stock: LabelStock, data_rows: List[Dict]) -> io.BytesIO:
    """Renders a full set of labels to a PDF in memory."""
    buffer = io.BytesIO()
    
    label_width = (stock.page_width - stock.left_margin * 2 - stock.col_spacing * (stock.cols_per_page - 1)) / stock.cols_per_page
    label_height = (stock.page_height - stock.top_margin * 2 - stock.row_spacing * (stock.rows_per_page - 1)) / stock.rows_per_page

    p = canvas.Canvas(buffer, pagesize=(stock.page_width * inch, stock.page_height * inch))
    
    row_idx, col_idx = 0, 0

    for data_row in data_rows:
        label_x_offset = stock.left_margin + col_idx * (label_width + stock.col_spacing)
        label_y_offset = stock.top_margin + row_idx * (label_height + stock.row_spacing)
        
        sorted_elements = sorted(template.elements, key=lambda e: e.z_index)

        for element in sorted_elements:
            relative_element_data = element.model_dump()
            relative_element_data['x'] += label_x_offset
            relative_element_data['y'] += label_y_offset
            relative_element = LabelElement(**relative_element_data)
            
            draw_element(p, relative_element, data_row, stock)

        col_idx += 1
        if col_idx >= stock.cols_per_page:
            col_idx = 0
            row_idx += 1
        
        if row_idx >= stock.rows_per_page:
            row_idx = 0
            p.showPage()

    p.save()
    buffer.seek(0)
    return buffer
