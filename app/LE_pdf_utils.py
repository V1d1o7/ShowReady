import io
import os
import base64
import re
from typing import List, Dict, Any
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.graphics.barcode import qr, code128
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from app.models import LabelTemplate, LabelStock, LabelElement

# Register Fonts
def register_fonts():
    try:
        base_dir = os.path.dirname(os.path.dirname(__file__))
        fonts_dir = os.path.join(base_dir, "fonts")
        if os.path.exists(os.path.join(fonts_dir, 'SpaceMono-Regular.ttf')):
            pdfmetrics.registerFont(TTFont('SpaceMono', os.path.join(fonts_dir, 'SpaceMono-Regular.ttf')))
            pdfmetrics.registerFont(TTFont('SpaceMono-Bold', os.path.join(fonts_dir, 'SpaceMono-Bold.ttf')))
            pdfmetrics.registerFont(TTFont('SpaceMono-Italic', os.path.join(fonts_dir, 'SpaceMono-Italic.ttf')))
    except Exception as e:
        print(f"Warning: Could not register custom fonts: {e}")

register_fonts()

def get_reportlab_font_name(font_family: str, font_weight: str, font_style: str) -> str:
    family_map = {
        'Arial': 'Helvetica',
        'Times New Roman': 'Times-Roman',
        'Courier New': 'Courier',
        'SpaceMono': 'SpaceMono'
    }
    base_font = family_map.get(font_family, 'Helvetica')
    is_bold = (font_weight == 'bold')
    is_italic = (font_style == 'italic')

    if base_font in ['Helvetica', 'Courier']:
        suffix = []
        if is_bold: suffix.append('Bold')
        if is_italic: suffix.append('Oblique')
        if suffix: return f"{base_font}-{'-'.join(suffix)}"
        return base_font

    if base_font == 'Times-Roman':
        if is_bold and is_italic: return 'Times-BoldItalic'
        if is_bold: return 'Times-Bold'
        if is_italic: return 'Times-Italic'
        return 'Times-Roman'

    if base_font == 'SpaceMono':
        if is_bold: return 'SpaceMono-Bold'
        if is_italic: return 'SpaceMono-Italic'
        return 'SpaceMono'

    return 'Helvetica'

def resolve_color(static_color: str, variable_field: str, row_data: Dict[str, Any]):
    """
    Helper to resolve a color from row_data if a variable is set.
    Fallback to static_color. Handles Hex and standard Color names.
    """
    color_val = None
    
    # 1. Try to get value from Variable
    if variable_field and row_data:
        # Check specific key
        val = row_data.get(variable_field)
        if not val:
            # Case-insensitive check
            for k, v in row_data.items():
                if k.lower() == variable_field.lower():
                    val = v
                    break
        if val:
            color_val = val

    # 2. Fallback to Static
    if not color_val:
        color_val = static_color or '#000000'

    # 3. Convert to ReportLab Color
    try:
        # Try Hex
        return colors.HexColor(color_val)
    except:
        try:
            # Try Named Color (e.g., 'Red', 'blue')
            if isinstance(color_val, str):
                # ReportLab colors are usually uppercase in the module (e.g. colors.RED) 
                # but allow some flexibility or use GetAllNamedColors() logic if needed.
                # Simplest fallback is to verify if it exists in colors module
                c = getattr(colors, color_val.upper(), None)
                if c: return c
                
                # If it's a CSS name not in RL (like 'amber'), fallback to black to prevent crash
                return colors.black 
        except:
            return colors.black
            
    return colors.black

def draw_element(c: canvas.Canvas, element: LabelElement, row_data: Dict[str, Any], stock: LabelStock):
    x = element.x * inch
    y = (stock.page_height - element.y - element.height) * inch 
    width = element.width * inch
    height = element.height * inch

    if element.type == 'text':
        content = element.text_content or ""
        
        # Inline Substitution
        if row_data:
            placeholders = re.findall(r'\{([^}]+)\}', content)
            for placeholder in placeholders:
                val = str(row_data.get(placeholder, ""))
                content = content.replace(f"{{{placeholder}}}", val)

        # Handle Newlines for Paragraph
        content = content.replace('\n', '<br/>')

        font_name = get_reportlab_font_name(
            element.font_family, 
            element.font_weight, 
            "italic" if element.font_style == 'italic' else "normal"
        )
        font_size = element.font_size or 10
        
        # Map Alignment
        align_map = {'left': TA_LEFT, 'center': TA_CENTER, 'right': TA_RIGHT}
        alignment = align_map.get(element.text_align, TA_LEFT)

        # Resolve Text Color
        text_color = resolve_color(element.text_color, element.text_color_variable, row_data)

        # Define Style
        style = ParagraphStyle(
            name='LabelTextStyle',
            fontName=font_name,
            fontSize=font_size,
            leading=font_size * 1.2, # Line spacing
            textColor=text_color,
            alignment=alignment,
            wordWrap='CJK' # Allow splitting long words if necessary
        )

        # Create Paragraph
        p = Paragraph(content, style)
        
        # Wrap to calculate actual dimensions
        # We pass 'width' as the constraint. 'height' argument is soft constraint.
        actual_w, actual_h = p.wrap(width, height)  

        # Vertical Alignment Calculation
        if element.vertical_align == 'middle':
            text_y = y + (height - actual_h) / 2
        elif element.vertical_align == 'bottom':
            text_y = y # Draw at bottom of box
        else:
            # Top (Default)
            text_y = y + height - actual_h

        # Draw
        p.drawOn(c, x, text_y)

    elif element.type == 'line':
        c.saveState()
        stroke_c = resolve_color(element.stroke_color, element.stroke_color_variable, row_data)
        c.setStrokeColor(stroke_c)
        c.setLineWidth(element.stroke_width or 2.0)
        
        # Snap to center if dimension is small
        is_horizontal = element.height < 0.1
        is_vertical = element.width < 0.1

        if is_horizontal:
             mid_y = y + height / 2
             c.line(x, mid_y, x + width, mid_y)
        elif is_vertical:
             mid_x = x + width / 2
             c.line(mid_x, y, mid_x, y + height)
        elif element.lineDirection == 'up':
            c.line(x, y, x + width, y + height)
        else: 
            c.line(x, y + height, x + width, y)
        c.restoreState()

    elif element.type == 'shape':
        c.saveState()
        
        fill_c = None
        if element.fill_color and element.fill_color.lower() != 'transparent':
             fill_c = resolve_color(element.fill_color, element.fill_color_variable, row_data)
        
        if fill_c: c.setFillColor(fill_c)
        
        stroke_c = resolve_color(element.stroke_color, element.stroke_color_variable, row_data)
        c.setStrokeColor(stroke_c)
        c.setLineWidth(element.stroke_width or 1.0)
        
        if element.shape == 'circle':
            c.ellipse(x, y, x + width, y + height, fill=1 if fill_c else 0, stroke=1)
        else:
            c.rect(x, y, width, height, fill=1 if fill_c else 0, stroke=1)
        c.restoreState()

    elif element.type == 'barcode':
        content = element.text_content or "123456"
        if row_data:
             placeholders = re.findall(r'\{([^}]+)\}', content)
             for placeholder in placeholders:
                val = str(row_data.get(placeholder, ""))
                content = content.replace(f"{{{placeholder}}}", val)
        if not content.strip(): content = "123456"

        try:
            barcode = code128.Code128(content, barHeight=height, barWidth=1.5)
            b_bounds = barcode.getBounds()
            bc_w = b_bounds[2] - b_bounds[0]
            scale_x = width / bc_w if bc_w > 0 else 1
            d = Drawing(width, height, transform=[scale_x, 0, 0, 1, x, y])
            d.add(barcode)
            renderPDF.draw(d, c, 0, 0)
        except Exception as e:
            print(f"Barcode Error: {e}")

    elif element.type == 'qrcode':
        content_template = element.qr_content or ""
        content_to_encode = content_template
        if content_to_encode and row_data:
             placeholders = re.findall(r'\{([^}]+)\}', content_to_encode)
             for placeholder in placeholders:
                val = str(row_data.get(placeholder, ""))
                content_to_encode = content_to_encode.replace(f"{{{placeholder}}}", val)

        if content_to_encode:
            qr_code = qr.QrCodeWidget(content_to_encode)
            b = qr_code.getBounds()
            qr_w, qr_h = b[2]-b[0], b[3]-b[1]
            d = Drawing(width, height, transform=[width/qr_w, 0, 0, height/qr_h, x, y])
            d.add(qr_code)
            renderPDF.draw(d, c, 0, 0)
            
    elif element.type == 'image':
        img_key = element.variable_field
        if not img_key:
            if element.text_content == 'Show Logo': img_key = '__SHOW_LOGO__'
            elif element.text_content == 'Company Logo': img_key = '__COMPANY_LOGO__'

        if img_key in ['__SHOW_LOGO__', '__COMPANY_LOGO__'] and row_data.get(img_key):
            try:
                b64 = row_data[img_key]
                if "," in b64: b64 = b64.split(",")[1]
                
                img_bytes = base64.b64decode(b64)
                img = ImageReader(io.BytesIO(img_bytes))
                
                c.drawImage(img, x, y, width, height, mask='auto', preserveAspectRatio=True, anchor='c')
            except Exception as e:
                print(f"Image Error ({img_key}): {e}")

def render_template_to_buffer(template: LabelTemplate, stock: LabelStock, data_rows: List[Dict]) -> io.BytesIO:
    buf = io.BytesIO()
    p = canvas.Canvas(buf, pagesize=(stock.page_width * inch, stock.page_height * inch))
    
    l_w = (stock.page_width - stock.left_margin * 2 - stock.col_spacing * (stock.cols_per_page - 1)) / stock.cols_per_page
    l_h = (stock.page_height - stock.top_margin * 2 - stock.row_spacing * (stock.rows_per_page - 1)) / stock.rows_per_page

    row_idx, col_idx = 0, 0
    for data_row in data_rows:
        x_off = stock.left_margin + col_idx * (l_w + stock.col_spacing)
        y_off = stock.top_margin + row_idx * (l_h + stock.row_spacing)
        
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