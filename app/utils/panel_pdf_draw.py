from typing import Optional
from reportlab.lib.units import inch
from reportlab.lib import colors

def checkIsDHole(accepted_type: Optional[str], slot_name: Optional[str]) -> bool:
    a = (accepted_type or "").strip().lower()
    n = (slot_name or "").strip().lower()
    return ('d-hole' in a or 'd_hole' in a or 'dhole' in a or 'd-series' in a or a == 'd' or
            'd-hole' in n or 'd_hole' in n or 'd hole' in n)

def draw_svg_face(c, cx, cy, visual_style):
    """
    Draws a connector face *exactly* at physical scale coordinates in a Line-Art/Wireframe style.
    """
    c.saveState()
    
    target_w = 260.0
    target_h = 310.0
    
    # EXACT physical math. 26mm = ~1.02 inches physical.
    # At half-scale (19" -> 9.5"), a D-Hole flange is 0.51 inches wide.
    scale = (0.51 * inch) / target_w
    drawn_w = target_w * scale
    drawn_h = target_h * scale
    
    c.translate(cx - (drawn_w / 2), cy - (drawn_h / 2) + drawn_h)
    c.scale(scale, -scale)

    def draw_flange():
        # Line art base flange
        c.setLineWidth(2)
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.roundRect(0, 0, 260, 310, 20, fill=1, stroke=1)
        
        # M3 Screws
        c.setLineWidth(1.5)
        c.circle(35, 35, 16, fill=1, stroke=1)
        c.circle(35, 35, 6, fill=1, stroke=1)
        
        c.circle(225, 275, 16, fill=1, stroke=1)
        c.circle(225, 275, 6, fill=1, stroke=1)

    if visual_style == 'empty':
        # Main hole void
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        
        # Cover the top to create the flat "D" edge
        c.setStrokeColor(colors.white)
        c.rect(15, 40, 230, 25, fill=1, stroke=1)
        
        # Redraw the stroke along the flat top
        c.setStrokeColor(colors.black)
        c.line(67, 65, 193, 65)

        # M3 Screw Voids
        c.setLineWidth(1.5)
        c.circle(35, 35, 16, fill=1, stroke=1)
        c.circle(225, 275, 16, fill=1, stroke=1)
        c.circle(35, 35, 6, fill=1, stroke=1)
        c.circle(225, 275, 6, fill=1, stroke=1)

    elif visual_style == 'ethercon':
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        
        # Push Latch
        p = c.beginPath()
        p.moveTo(100, 50); p.lineTo(160, 50); p.lineTo(150, 90); p.lineTo(110, 90); p.close()
        c.drawPath(p, fill=1, stroke=1)
        c.roundRect(110, 60, 40, 6, 2, fill=1, stroke=1)
        
        # RJ45 Body
        c.roundRect(85, 120, 90, 75, 5, fill=1, stroke=1)
        p2 = c.beginPath()
        p2.moveTo(115, 195); p2.lineTo(145, 195); p2.lineTo(145, 215); p2.lineTo(115, 215); p2.close()
        c.drawPath(p2, fill=1, stroke=1)
        
        # Pins
        for i in range(8):
            c.rect(96 + (i * 9), 125, 4, 20, fill=1, stroke=1)

    elif visual_style == 'xlr_f':
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        
        p = c.beginPath()
        p.moveTo(100, 50); p.lineTo(160, 50); p.lineTo(150, 90); p.lineTo(110, 90); p.close()
        c.drawPath(p, fill=1, stroke=1)
        
        c.circle(130, 70, 10, fill=1, stroke=1)
        c.setFillColor(colors.black)
        c.setFont("SpaceMono-Bold", 20)
        c.drawCentredString(130, 40, "PUSH")
        
        c.setFillColor(colors.white)
        c.circle(95, 130, 16, fill=1, stroke=1)
        c.circle(165, 130, 16, fill=1, stroke=1)
        c.circle(130, 200, 16, fill=1, stroke=1)

    elif visual_style == 'xlr_m':
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        c.circle(130, 155, 70, fill=1, stroke=1)
        c.rect(115, 60, 30, 30, fill=1, stroke=1)
        
        c.circle(95, 130, 12, fill=1, stroke=1)
        c.circle(165, 130, 12, fill=1, stroke=1)
        c.circle(130, 200, 12, fill=1, stroke=1)
        
    elif visual_style == 'bnc':
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        
        c.circle(130, 155, 65, fill=1, stroke=1)
        c.roundRect(45, 145, 170, 20, 5, fill=1, stroke=1)
        
        c.circle(130, 155, 45, fill=1, stroke=1)
        c.circle(130, 155, 10, fill=1, stroke=1)

    elif visual_style in ['opticalcon_duo', 'opticalcon_quad']:
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        
        c.roundRect(55, 125, 150, 60, 10, fill=1, stroke=1)
        
        if visual_style == 'opticalcon_quad':
            c.roundRect(100, 80, 60, 150, 10, fill=1, stroke=1)
            
        if visual_style == 'opticalcon_duo':
            c.circle(100, 155, 12, fill=1, stroke=1)
            c.circle(160, 155, 12, fill=1, stroke=1)
        else:
            c.circle(100, 125, 12, fill=1, stroke=1)
            c.circle(160, 125, 12, fill=1, stroke=1)
            c.circle(100, 185, 12, fill=1, stroke=1)
            c.circle(160, 185, 12, fill=1, stroke=1)

    elif visual_style in ['mtp12', 'mtp24', 'mtp48']:
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        
        c.roundRect(65, 135, 130, 40, 8, fill=1, stroke=1)
        c.roundRect(85, 150, 90, 10, 2, fill=1, stroke=1)
        
        num = visual_style.replace('mtp', '')
        c.setFillColor(colors.black)
        c.setFont("SpaceMono-Bold", 36) 
        c.drawCentredString(130, 120, num)

    elif visual_style == 'true1':
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        c.circle(130, 155, 85, fill=1, stroke=1)
        c.circle(130, 155, 60, fill=1, stroke=1)
        c.rect(115, 70, 30, 20, fill=1, stroke=1)

    elif visual_style in ['powercon_blue', 'powercon_white']:
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        c.circle(130, 155, 60, fill=1, stroke=1)
        c.rect(120, 45, 20, 20, fill=1, stroke=1)

    elif visual_style == 'speakon':
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        c.circle(130, 155, 65, fill=1, stroke=1)
        
        c.rect(120, 80, 20, 20, fill=1, stroke=1)
        c.rect(60, 145, 20, 20, fill=1, stroke=1)
        c.rect(180, 145, 20, 20, fill=1, stroke=1)
        
        c.circle(130, 155, 30, fill=1, stroke=1)
        c.circle(130, 155, 15, fill=1, stroke=1)

    elif visual_style == 'hdmi':
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        
        p = c.beginPath()
        p.moveTo(60, 135)
        p.lineTo(200, 135)
        p.lineTo(200, 155)
        p.lineTo(180, 185)
        p.lineTo(80, 185)
        p.lineTo(60, 155)
        p.close()
        c.drawPath(p, fill=1, stroke=1)
        
        c.rect(75, 145, 110, 6, fill=1, stroke=1)
        c.rect(85, 165, 90, 4, fill=1, stroke=1)

    else:
        draw_flange()

    c.restoreState()


def _draw_pe_recursive(c, x, y, w, h, instance):
    template = instance.get('template')
    if not template: return

    sub_slots = template.get('panel_slots') or []
    children = instance.get('children') or []

    is_connector = len(sub_slots) == 0
    visual_style = template.get('visual_style', 'standard')

    cx = x + w / 2
    cy = y + h / 2

    # Fixed Vertical Displacement for Labels so they never overlap the connector SVG bounds
    label_offset_y = 0.38 * inch

    if is_connector:
        if visual_style.startswith('gblock'):
            gb_size = 0.5 * inch
            fx = cx - gb_size/2
            fy = cy - gb_size/2
            
            c.setFillColor(colors.white)
            c.setStrokeColor(colors.black)
            c.setLineWidth(1)
            c.roundRect(fx, fy, gb_size, gb_size, 2, fill=1, stroke=1)
            
            c.circle(fx + 4, fy + 4, 1.5, fill=1, stroke=1)
            c.circle(fx + gb_size - 4, fy + gb_size - 4, 1.5, fill=1, stroke=1)
            c.circle(fx + 4, fy + gb_size - 4, 1.5, fill=1, stroke=1)
            c.circle(fx + gb_size - 4, fy + 4, 1.5, fill=1, stroke=1)
            
            if visual_style == 'gblock_6pr':
                for pr_x in [0.3, 0.5, 0.7]:
                    for pr_y in [0.35, 0.65]:
                        c.circle(fx + gb_size * pr_x, fy + gb_size * pr_y, 2, fill=1, stroke=1)
            else:
                for pr_x in [0.25, 0.42, 0.58, 0.75]:
                    for pr_y in [0.25, 0.5, 0.75]:
                        c.circle(fx + gb_size * pr_x, fy + gb_size * pr_y, 1.5, fill=1, stroke=1)
        else:
            draw_svg_face(c, cx, cy, visual_style)

        if instance.get('label'):
            label_text = instance['label']
            c.setFont("SpaceMono-Bold", 6)
            
            text_y = cy + label_offset_y
            
            max_w = w - 2
            while c.stringWidth(label_text, "SpaceMono-Bold", 6) > max_w and len(label_text) > 0:
                label_text = label_text[:-1]
            
            text_width = c.stringWidth(label_text, "SpaceMono-Bold", 6)
            
            c.setFillColor(colors.white)
            c.setStrokeColor(colors.black)
            c.setLineWidth(0.5)
            c.roundRect(cx - (text_width/2) - 2, text_y - 2, text_width + 4, 8, 1, fill=1, stroke=1)
            
            c.setFillColor(colors.black)
            c.drawCentredString(cx, text_y, label_text)

    else:
        # DRAW PLATE Outline
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(1)
        c.rect(x+0.5, y, w-1, h, fill=1, stroke=1)

        slotCount = len(sub_slots)
        template_model = (template.get('model_number') or template.get('name') or '')[:12]
        is_module = bool(template.get('slot_type')) or 'ucp' in template_model.lower()
        ru_height = max(1, round(float(template.get('width_units') or 1.0)))
        
        gridCols = 1
        gridRows = slotCount
        if not is_module:
            gridRows = ru_height
            gridCols = (slotCount + gridRows - 1) // gridRows
        else:
            if slotCount <= 2:
                gridCols = 1
                gridRows = slotCount
            else:
                gridCols = 2
                gridRows = (slotCount + 1) // 2

        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.5)
        
        if gridCols == 1:
            c.circle(x + w/2, y + 5, 2, fill=1, stroke=1)
            c.circle(x + w/2, y + h - 5, 2, fill=1, stroke=1)
        else:
            c.circle(x + 5, y + 5, 2, fill=1, stroke=1)
            c.circle(x + w - 5, y + 5, 2, fill=1, stroke=1)
            c.circle(x + 5, y + h - 5, 2, fill=1, stroke=1)
            c.circle(x + w - 5, y + h - 5, 2, fill=1, stroke=1)

        c.setFillColor(colors.black)
        c.setFont("SpaceMono-Bold", 5)

        if is_module:
            if instance.get('label'):
                c.drawCentredString(cx, y + h - 8, instance['label']) # Plate label at top edge
        else:
            if instance.get('label'):
                c.drawCentredString(cx, y + h - 8, instance['label'])
            c.drawCentredString(cx, y + 4, template_model) # Standard panels retain model number at bottom

        if sub_slots:
            # Explicitly shrink the grid canvas bounds to make room for Plate Labels to guarantee no collisions
            if is_module:
                margin_y_top = 20 if instance.get('label') else 6
                margin_y_bottom = 6
            else:
                margin_y_top = 6
                margin_y_bottom = 16
                
            avail_h = h - margin_y_top - margin_y_bottom
            avail_y = y + margin_y_bottom
            
            cell_w = w / gridCols
            cell_h = avail_h / gridRows
            
            for i, ss in enumerate(sub_slots):
                col = i % gridCols
                row = i // gridCols
                
                pdf_row = gridRows - 1 - row
                
                cell_x = x + (col * cell_w)
                cell_y = avail_y + (pdf_row * cell_h)
                cell_cx = cell_x + cell_w / 2
                cell_cy = cell_y + cell_h / 2
                
                sub_label_placement = 'top'
                if is_module:
                    if slotCount == 1:
                        sub_label_placement = 'bottom'
                    elif slotCount == 2:
                        sub_label_placement = 'top' if row == 0 else 'bottom'
                    elif slotCount == 3:
                        sub_label_placement = 'bottom'
                    elif slotCount >= 4:
                        sub_label_placement = 'top' if row == 0 else 'bottom'
                
                is_top_sub = sub_label_placement == 'top'
                
                child = next((c_inst for c_inst in children if c_inst.get('slot_id') == ss.get('id')), None)
                
                if child:
                    child_label = child.get('label')
                    if child_label:
                        c.setFont("SpaceMono-Bold", 6)
                        text_y = cell_cy + label_offset_y if is_top_sub else cell_cy - label_offset_y
                        
                        max_w = cell_w - 2
                        while c.stringWidth(child_label, "SpaceMono-Bold", 6) > max_w and len(child_label) > 0:
                            child_label = child_label[:-1]
                        
                        text_width = c.stringWidth(child_label, "SpaceMono-Bold", 6)
                        c.setFillColor(colors.white)
                        c.setStrokeColor(colors.black)
                        c.setLineWidth(0.5)
                        c.roundRect(cell_cx - (text_width/2) - 2, text_y - 2, text_width + 4, 8, 1, fill=1, stroke=1)
                        c.setFillColor(colors.black)
                        c.drawCentredString(cell_cx, text_y, child_label)
                        
                        child = {k:v for k,v in child.items()}
                        child['label'] = ''
                        
                    _draw_pe_recursive(c, cell_x, cell_y, cell_w, cell_h, child)
                else:
                    is_dhole = checkIsDHole(ss.get('accepted_module_type'), ss.get('name'))
                    if is_dhole:
                        draw_svg_face(c, cell_cx, cell_cy, 'empty')
                        
                        empty_text_y = cell_cy - label_offset_y if is_top_sub else cell_cy + label_offset_y
                        
                        c.setFillColor(colors.black)
                        c.setFont("SpaceMono-Bold", 5)
                        c.drawCentredString(cell_cx, empty_text_y, (ss.get('name') or 'Empty')[:10])
                    else:
                        c.setFillColor(colors.white)
                        c.setStrokeColor(colors.black)
                        c.rect(cell_x + 2, cell_y + 2, cell_w - 4, cell_h - 4, fill=1, stroke=1)

def draw_panel_visual(c, x, y, width, height, panel_data):
    """
    Renders a visual representation of a patch panel chassis exactly matching physical coordinate ratios.
    """
    c.setStrokeColor(colors.black)
    c.setFillColor(colors.white)
    c.setLineWidth(1)
    c.rect(x, y, width, height, fill=1, stroke=1)
    
    # Left Ear 
    ear_w = 0.3 * inch
    c.rect(x, y, ear_w, height, fill=1, stroke=1)
    c.circle(x + (ear_w/2), y + 10, 4, fill=1, stroke=1)
    c.circle(x + (ear_w/2), y + height - 10, 4, fill=1, stroke=1)

    # Right Ear
    c.rect(x + width - ear_w, y, ear_w, height, fill=1, stroke=1)
    c.circle(x + width - (ear_w/2), y + 10, 4, fill=1, stroke=1)
    c.circle(x + width - (ear_w/2), y + height - 10, 4, fill=1, stroke=1)

    # Top/Bottom Lips
    lip_h = 0.05 * inch
    c.rect(x + ear_w, y + height - lip_h, width - (ear_w * 2), lip_h, fill=1, stroke=1) 
    c.rect(x + ear_w, y, width - (ear_w * 2), lip_h, fill=1, stroke=1) 

    draw_width = width - (ear_w * 2)
    slots_area_x = x + ear_w
    
    eq_templates = panel_data.get('panel', {}).get('equipment_templates') or {}
    infra_slots = eq_templates.get('slots') or []
    mounted_instances = panel_data.get('mounted_instances') or []
    
    if infra_slots:
        slot_width = draw_width / len(infra_slots)
        for i, slot in enumerate(infra_slots):
            slot_x = slots_area_x + (i * slot_width)
            slot_y = y + lip_h
            slot_h = height - (lip_h * 2)
            
            is_dhole = checkIsDHole(slot.get('accepted_module_type'), slot.get('name'))
            instance = next((m for m in mounted_instances if m.get('slot_id') == slot.get('id')), None)

            if not is_dhole:
                # Standard Steck Bay Divider
                c.setStrokeColor(colors.black)
                c.setLineWidth(1)
                c.rect(slot_x, slot_y, slot_width, slot_h, fill=0, stroke=1)
                c.circle(slot_x + slot_width/2, slot_y + 5, 2, fill=1, stroke=1)
                c.circle(slot_x + slot_width/2, slot_y + slot_h - 5, 2, fill=1, stroke=1)
            else:
                if not instance:
                    draw_svg_face(c, slot_x + slot_width/2, slot_y + slot_h/2, 'empty')
                    
                    # ---> ADDED: Root panel empty punch out labels <---
                    c.setFillColor(colors.black)
                    c.setFont("SpaceMono-Bold", 5)
                    label_offset_y = 0.38 * inch 
                    empty_text_y = (slot_y + slot_h/2) - label_offset_y
                    c.drawCentredString(slot_x + slot_width/2, empty_text_y, (slot.get('name') or 'Empty')[:10])

            if instance:
                _draw_pe_recursive(c, slot_x, slot_y, slot_width, slot_h, instance)