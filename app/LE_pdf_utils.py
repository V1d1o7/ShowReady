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
    """Draws a single element based on type and content mode."""
    # Scale units to points
    x = element.x * inch
    # Transform Y: Designer (top-down) to ReportLab (bottom-up)
    y = (stock.page_height - element.y - element.height) * inch 
    width = element.width * inch
    height = element.height * inch

    if element.type == 'text':
        # Resolve content
        if element.content_mode == 'variable' and element.variable_field:
            content = str(row_data.get(element.variable_field, ""))
        else:
            content = element.text_content or ""

        c.saveState()
        font_name = element.font_family or 'Helvetica'
        font_size = element.font_size or 10
        c.setFont(font_name, font_size)
        c.setFillColor(colors.HexColor(element.text_color or '#000000'))
        
        # Horizontal Alignment
        text_x = x
        if element.text_align == 'center':
            text_x = x + (width - stringWidth(content, font_name, font_size)) / 2
        elif element.text_align == 'right':
            text_x = x + width - stringWidth(content, font_name, font_size)

        # Baseline adjustment for top-aligned bounding boxes
        text_y = y + height - font_size * 0.9 
        c.drawString(text_x, text_y, content)
        c.restoreState()

    elif element.type == 'shape':
        c.saveState()
        fill = element.fill_color and element.fill_color.lower() != 'transparent'
        if fill: c.setFillColor(colors.HexColor(element.fill_color))
        c.setStrokeColor(colors.HexColor(element.stroke_color or '#000000'))
        c.setLineWidth(element.stroke_width or 1.0)
        
        # Dispatch shape type
        if element.shape == 'circle':
            c.ellipse(x, y, x + width, y + height, fill=1 if fill else 0, stroke=1)
        elif element.shape == 'line':
            c.line(x, y + height/2, x + width, y + height/2)
        else: # rectangle
            c.rect(x, y, width, height, fill=1 if fill else 0, stroke=1)
        c.restoreState()

    elif element.type == 'qrcode':
        content_to_encode = str(row_data.get(element.qr_content, "")) if element.qr_content else ""
        if content_to_encode:
            qr_code = qr.QrCodeWidget(content_to_encode)
            b = qr_code.getBounds()
            qr_w, qr_h = b[2]-b[0], b[3]-b[1]
            d = Drawing(width, height, transform=[width/qr_w, 0, 0, height/qr_h, x, y])
            d.add(qr_code)
            renderPDF.draw(d, c, 0, 0)
            
    elif element.type == 'image':
        # Handle Reserved Logo Keys
        img_key = element.variable_field
        if img_key in ['__SHOW_LOGO__', '__COMPANY_LOGO__'] and row_data.get(img_key):
            try:
                b64 = row_data[img_key].split(",")[1] if "," in row_data[img_key] else row_data[img_key]
                img = Image.open(io.BytesIO(base64.b64decode(b64)))
                c.drawImage(img, x, y, width, height, preserveAspectRatio=True, anchor='c')
            except Exception as e:
                print(f"Image Error: {e}")

def render_template_to_buffer(template: LabelTemplate, stock: LabelStock, data_rows: List[Dict]) -> io.BytesIO:
    """Entry point for PDF generation."""
    buf = io.BytesIO()
    p = canvas.Canvas(buf, pagesize=(stock.page_width * inch, stock.page_height * inch))
    
    # Label cell dimensions
    l_w = (stock.page_width - stock.left_margin * 2 - stock.col_spacing * (stock.cols_per_page - 1)) / stock.cols_per_page
    l_h = (stock.page_height - stock.top_margin * 2 - stock.row_spacing * (stock.rows_per_page - 1)) / stock.rows_per_page

    row_idx, col_idx = 0, 0
    for data_row in data_rows:
        x_off = stock.left_margin + col_idx * (l_w + stock.col_spacing)
        y_off = stock.top_margin + row_idx * (l_h + stock.row_spacing)
        
        # Enforce layer ordering
        for element in sorted(template.elements, key=lambda e: e.z_index):
            el_copy = element.model_copy(update={'x': element.x + x_off, 'y': element.y + y_off})
            draw_element(p, el_copy, data_row, stock)

        col_idx += 1
        if col_idx >= stock.cols_per_page:
            col_idx, row_idx = 0, row_idx + 1
        if row_idx >= stock.rows_per_page:
            row_idx = 0
            p.showPage()

    p.save()
    buf.seek(0)
    return buf