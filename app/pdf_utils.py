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
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import base64
from svglib.svglib import svg2rlg
import xml.etree.ElementTree as ET

from .models import WireDiagramPDFPayload, Rack, RackPDFPayload

# --- Font and Image Registration ---
try:
    pdfmetrics.registerFont(TTFont('SpaceMono', 'fonts/SpaceMono-Regular.ttf'))
    pdfmetrics.registerFont(TTFont('SpaceMono-Bold', 'fonts/SpaceMono-Bold.ttf'))
except Exception as e:
    print(f"Could not register Space Mono font: {e}")

# --- Page Size Definitions ---
PAGE_SIZES = {
    "letter": letter,
    "tabloid": (17 * inch, 11 * inch),
    "a4": (297 / 25.4 * inch, 210 / 25.4 * inch),
    "legal": (14 * inch, 8.5 * inch),
}

# --- Layout Constants for Simplified Export ---
SIMPLIFIED_NODE_WIDTH = 150
SIMPLIFIED_HEADER_HEIGHT = 60
SIMPLIFIED_PORT_ROW_HEIGHT = 15
SIMPLIFIED_FOOTER_HEIGHT = 10
SIMPLIFIED_TITLE_HEIGHT = 20
SIMPLIFIED_V_GAP = 20
SIMPLIFIED_H_GAP = 120
SIMPLIFIED_COL_THRESHOLD = SIMPLIFIED_NODE_WIDTH * 0.75
SIMPLIFIED_LINE_LEN = 0.2 * inch
SIMPLIFIED_LABEL_H = 10
SIMPLIFIED_LABEL_PADDING = 5

# --- Helper Functions ---
def _estimate_text_width(c: canvas.Canvas, text: str, font_name: str, font_size: int):
    return c.stringWidth(text, font_name, font_size)

def draw_title_block(c: canvas.Canvas, title_block_info: dict, x: float, y: float, width: float, height: float, current_page_num: int, total_pages: int):
    # This is a placeholder for the existing complex title block logic
    c.saveState()
    c.setStrokeColor(colors.lightgrey)
    c.rect(x, y, width, height)
    c.setFont("SpaceMono", 8)
    c.drawString(x + 5, y + height - 15, f"Show: {title_block_info.get('show_name', '')}")
    c.drawRightString(x + width - 5, y + 5, f"Page {current_page_num} of {total_pages}")
    c.restoreState()

def _get_connection_label_text(edge, is_source, all_nodes_map):
    remote_node_id = edge.target if is_source else edge.source
    remote_handle = edge.targetHandle if is_source else edge.sourceHandle
    remote_node_info = all_nodes_map.get(remote_node_id)
    if not remote_node_info: return "Unknown"
    
    remote_node = remote_node_info['node']
    port_name = remote_handle
    try:
        port_id = remote_handle.split('-')[-1]
        port = next(p for p in remote_node.data.equipment_templates.ports if str(p.id) == port_id)
        port_name = port.label
    except (AttributeError, StopIteration, IndexError):
        pass
        
    return f"{remote_node.data.label}.{port_name}"

def draw_simplified_layout(c: canvas.Canvas, page_nodes: List, all_nodes_map: Dict, all_edges: List, draw_area_x: float, draw_area_y: float, draw_area_width: float, draw_area_height: float):
    # Simplified layout logic using ReportLab
    num_cols = 3
    col_width = draw_area_width / num_cols
    col_y_cursors = [draw_area_y + draw_area_height] * num_cols

    for node in page_nodes:
        target_col = min(range(num_cols), key=lambda i: col_y_cursors[i])
        
        ports = node.data.equipment_templates.ports or []
        node_height = SIMPLIFIED_HEADER_HEIGHT + (len(ports) * SIMPLIFIED_PORT_ROW_HEIGHT) + SIMPLIFIED_FOOTER_HEIGHT + SIMPLIFIED_TITLE_HEIGHT
        
        if col_y_cursors[target_col] < (draw_area_y + node_height):
             # This simple logic doesn't handle page breaks, just prevents drawing off bottom
            continue

        x_start = draw_area_x + (target_col * col_width) + (col_width - SIMPLIFIED_NODE_WIDTH) / 2
        y_start = col_y_cursors[target_col] - node_height
        col_y_cursors[target_col] = y_start - SIMPLIFIED_V_GAP

        # Draw Device
        c.saveState()
        c.setFont("SpaceMono-Bold", 10)
        c.setFillColor(colors.orange)
        c.drawCentredString(x_start + SIMPLIFIED_NODE_WIDTH / 2, y_start + node_height - 12, node.data.label)
        c.rect(x_start, y_start, SIMPLIFIED_NODE_WIDTH, node_height - SIMPLIFIED_TITLE_HEIGHT, stroke=1, fill=0)

        c.setFont("SpaceMono", 8)
        c.setFillColor(colors.black)
        c.drawCentredString(x_start + SIMPLIFIED_NODE_WIDTH/2, y_start + node_height - 35, f"({node.data.equipment_templates.model_number})")
        c.setFillColor(colors.darkblue)
        c.drawCentredString(x_start + SIMPLIFIED_NODE_WIDTH/2, y_start + node_height - 50, node.data.ip_address or "")

        port_y_positions = {}
        port_y = y_start + node_height - 70
        for port in ports:
            port_handle_id = f"port-{port.type}-{port.id}"
            port_y_positions[port_handle_id] = (port_y)
            c.setFont("SpaceMono", 7)
            c.drawString(x_start + 10, port_y, port.label)
            port_y -= SIMPLIFIED_PORT_ROW_HEIGHT
        c.restoreState()

        # Draw Connection Labels
        for edge in all_edges:
            if edge.source == node.id:
                start_y = port_y_positions.get(edge.sourceHandle)
                if start_y:
                    label_text = _get_connection_label_text(edge, True, all_nodes_map)
                    text_w = _estimate_text_width(c, label_text, "SpaceMono", 7)
                    line_x_start = x_start + SIMPLIFIED_NODE_WIDTH
                    line_x_end = line_x_start + CONNECTOR_LINE_LEN
                    c.line(line_x_start, start_y, line_x_end, start_y)
                    c.setFillColor(colors.orange)
                    c.rect(line_x_end, start_y - 5, text_w, 10, fill=1, stroke=0)
                    c.setFillColor(colors.black)
                    c.drawString(line_x_end + 2, start_y - 2, label_text)

# This is a placeholder for the existing complex full diagram logic
def draw_full_diagram_layout(c, page_data, all_nodes_map, all_edges):
    c.setFont("SpaceMono-Bold", 24)
    c.drawCentredString(c._pagesize[0]/2, c._pagesize[1]/2, "Full Diagram Layout (Not Implemented)")

def draw_diagram_page(c: canvas.Canvas, page_data, all_nodes_map, all_edges, show_name, current_page_num, total_pages, title_block_info: dict, layout_type: str):
    width, height = c._pagesize
    MARGIN = 0.25 * inch
    
    title_block_height = height / 8.0
    draw_area_width = width - (2 * MARGIN)
    draw_area_height = height - (2 * MARGIN) - title_block_height
    draw_area_x = MARGIN
    draw_area_y = MARGIN + title_block_height

    if layout_type == 'simplified':
        draw_simplified_layout(c, page_data.nodes, all_nodes_map, all_edges, draw_area_x, draw_area_y, draw_area_width, draw_area_height)
    else: # 'full'
        draw_full_diagram_layout(c, page_data, all_nodes_map, all_edges)

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
    # For simplified view, we treat all nodes as one page and let the layout handle it
    if payload.layout_type == 'simplified':
        class SinglePage:
            nodes = [v['node'] for v in all_nodes_map.values()]

        draw_diagram_page(c, SinglePage(), all_nodes_map, all_edges, payload.show_name, 1, 1, title_block_info, 'simplified')
        c.showPage()
    else:
        for i, page_data in enumerate(payload.pages):
            draw_diagram_page(c, page_data, all_nodes_map, all_edges, payload.show_name, i + 1, total_pages, title_block_info, 'full')
            c.showPage()

    c.save()
    buffer.seek(0)
    return buffer
