import io
import os
from typing import List, Dict, Optional

from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.utils import ImageReader

from .models import LoomLabel, CaseLabel

def generate_loom_label_pdf(labels: List[LoomLabel], placement: Optional[Dict[int, int]] = None) -> io.BytesIO:
    """
    Generates a PDF for loom labels using ReportLab.
    
    Args:
        labels: A list of LoomLabel data models.
        placement: An optional dictionary for custom label placement on a grid.
                   If None, labels are placed sequentially.

    Returns:
        An in-memory buffer containing the generated PDF data.
    """
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    # --- Grid and Layout Settings ---
    rows, cols = 8, 3
    margin = 0.5 * inch
    label_width = (width - 2 * margin) / cols
    label_height = (height - 2 * margin) / rows
    
    styles = getSampleStyleSheet()
    style_normal = styles['Normal']
    style_normal.fontSize = 8
    style_normal.leading = 10

    # --- Drawing Logic ---
    labels_to_draw = []
    if placement:
        # Use custom placement if provided
        for slot, label_index in sorted(placement.items()):
            if 0 <= label_index < len(labels):
                labels_to_draw.append((slot, labels[label_index]))
    else:
        # Otherwise, place sequentially
        for i, label in enumerate(labels):
            labels_to_draw.append((i, label))

    for slot, label in labels_to_draw:
        if slot >= rows * cols: continue # Skip if out of bounds

        row = slot % rows
        col = slot // rows
        
        x = margin + col * label_width
        y = height - margin - (row + 1) * label_height
        
        # Draw label border
        c.rect(x, y, label_width, label_height)
        
        # Draw label content
        text_x = x + 5
        text_y = y + label_height - 15
        
        c.setFont("Helvetica-Bold", 9)
        c.drawString(text_x, text_y, f"Loom: {label.loom_name or 'N/A'}")
        
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor(label.color) if label.color else colors.black)
        c.drawString(text_x, text_y - 15, f"Color: {label.color or 'N/A'}")
        c.setFillColor(colors.black) # Reset color
        
        c.drawString(text_x, text_y - 30, f"Source: {label.source or 'N/A'}")
        c.drawString(text_x, text_y - 45, f"Destination: {label.destination or 'N/A'}")

    c.showPage()
    c.save()
    
    buffer.seek(0)
    return buffer


def generate_case_label_pdf(labels: List[CaseLabel], logo_path: Optional[str] = None, placement: Optional[Dict[int, int]] = None) -> io.BytesIO:
    """
    Generates a PDF for case labels using ReportLab.
    """
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    # --- Grid and Layout Settings ---
    rows, cols = 2, 1
    margin = 0.5 * inch
    label_width = (width - 2 * margin) / cols
    label_height = (height - 2 * margin) / rows

    styles = getSampleStyleSheet()
    style_body = styles['BodyText']
    style_body.fontSize = 12
    style_body.leading = 14

    # --- Drawing Logic ---
    labels_to_draw = []
    if placement:
        for slot, label_index in sorted(placement.items()):
            if 0 <= label_index < len(labels):
                labels_to_draw.append((slot, labels[label_index]))
    else:
        for i, label in enumerate(labels):
            labels_to_draw.append((i, label))

    for slot, label in labels_to_draw:
        if slot >= rows * cols: continue

        row = slot % rows
        col = slot // rows
        
        x = margin + col * label_width
        y = height - margin - (row + 1) * label_height
        
        c.rect(x, y, label_width, label_height)
        
        # --- Draw Logo ---
        if logo_path and os.path.exists(logo_path):
            try:
                logo = ImageReader(logo_path)
                # Draw logo at top-right, 1.5x1.5 inch size
                c.drawImage(logo, x + label_width - (1.5 * inch) - 10, y + label_height - (1.5 * inch) - 10, 
                            width=1.5*inch, height=1.5*inch, preserveAspectRatio=True, mask='auto')
            except Exception as e:
                print(f"Could not load logo image: {e}")

        # --- Draw Text Content ---
        text_x = x + 20
        text_y_start = y + label_height - (0.5 * inch)
        
        c.setFont("Helvetica-Bold", 24)
        c.drawString(text_x, text_y_start, "SEND TO:")
        
        c.setFont("Helvetica-Bold", 36)
        c.drawString(text_x + 20, text_y_start - (0.6 * inch), label.send_to)
        
        c.setFont("Helvetica-Bold", 24)
        c.drawString(text_x, text_y_start - (1.5 * inch), "CONTENTS:")
        
        # Use a Paragraph for multi-line content
        p = Paragraph(label.contents.replace('\n', '<br/>'), style=style_body)
        p.wrapOn(c, label_width - 1.2 * inch, 2 * inch)
        p.drawOn(c, text_x + 20, y + 0.5 * inch)

    c.showPage()
    c.save()
    
    buffer.seek(0)
    return buffer
