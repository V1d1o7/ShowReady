from typing import Optional
from reportlab.lib.units import inch
from reportlab.lib import colors


def checkIsDHole(accepted_type: Optional[str], slot_name: Optional[str]) -> bool:
    a = (accepted_type or "").strip().lower()
    n = (slot_name or "").strip().lower()

    return (
        "d-hole" in a
        or "d_hole" in a
        or "dhole" in a
        or "d-series" in a
        or a == "d"
        or "d-hole" in n
        or "d_hole" in n
        or "d hole" in n
        or "dhole" in n
        or "d-series" in n
    )


def _slot_id_matches(instance_slot_id, slot, index) -> bool:
    if not instance_slot_id:
        return False

    instance_slot_id = str(instance_slot_id)

    return (
        instance_slot_id == str(slot.get("id"))
        or instance_slot_id == str(slot.get("name"))
        or instance_slot_id == f"slot-{index + 1}"
        or instance_slot_id.endswith(f"-slot-{index}")
        or instance_slot_id.endswith(f"-sub-{index}")
    )


def _get_module_slot_grid(template, sub_slots):
    slot_count = len(sub_slots)

    is_dhole_steck_plate = slot_count > 0 and all(
        checkIsDHole(slot.get("accepted_module_type"), slot.get("name"))
        for slot in sub_slots
    )

    if is_dhole_steck_plate:
        if slot_count == 1:
            return 1, 1
        if slot_count == 2:
            return 2, 1
        if slot_count == 3:
            return 3, 1
        if slot_count == 4:
            return 2, 2
        if slot_count == 6:
            return 3, 2

        return 3, (slot_count + 2) // 3

    if slot_count <= 2:
        return 1, slot_count

    return 2, (slot_count + 1) // 2


def _get_connector_print_label(template, compact: bool = False):
    visual_style = (template.get("visual_style") or "").strip()
    model_number = (template.get("model_number") or "").strip()
    name = (template.get("name") or "").strip()

    normal_label_map = {
        "ethercon": "etherCON",
        "xlr_f": "XLR-F",
        "xlr_m": "XLR-M",
        "bnc": "BNC",
        "opticalcon_duo": "opticalCON DUO",
        "opticalcon_quad": "opticalCON QUAD",
        "mtp12": "MTP12",
        "mtp24": "MTP24",
        "mtp48": "MTP48",
        "true1": "TRUE1 IN",
        "true1_in": "TRUE1 IN",
        "true1_out": "TRUE1 OUT",
        "powercon_blue": "powerCON BLUE",
        "powercon_white": "powerCON WHITE",
        "speakon": "speakON",
        "hdmi": "HDMI",
        "usb": "USB",
        "blank": "BLANK",
    }

    compact_label_map = {
        "ethercon": "ETH",
        "xlr_f": "XLR-F",
        "xlr_m": "XLR-M",
        "bnc": "BNC",
        "opticalcon_duo": "OP-D",
        "opticalcon_quad": "OP-Q",
        "mtp12": "MTP12",
        "mtp24": "MTP24",
        "mtp48": "MTP48",
        "true1": "T1-IN",
        "true1_in": "T1-IN",
        "true1_out": "T1-OUT",
        "powercon_blue": "PWR-B",
        "powercon_white": "PWR-W",
        "speakon": "SPK",
        "hdmi": "HDMI",
        "usb": "USB",
        "blank": "BLK",
    }

    if visual_style.startswith("gblock"):
        if visual_style == "gblock_6pr":
            return "6PR" if compact else "6PR GBLOCK"
        if visual_style == "gblock_12pr":
            return "12PR" if compact else "12PR GBLOCK"
        return "GBLK" if compact else "GBLOCK"

    label_map = compact_label_map if compact else normal_label_map

    if visual_style in label_map:
        return label_map[visual_style]

    return model_number or name or visual_style or ""


def _draw_user_label(c, label_text, cx, y, max_width, font_size=6):
    if not label_text:
        return

    font_name = "SpaceMono-Bold"
    c.setFont(font_name, font_size)

    printable_label = str(label_text)

    while c.stringWidth(printable_label, font_name, font_size) > max_width and len(printable_label) > 0:
        printable_label = printable_label[:-1]

    if not printable_label:
        return

    text_width = c.stringWidth(printable_label, font_name, font_size)

    label_height = 8
    horizontal_pad = 2

    # Treat y as the visual center of the label pill.
    # This makes it much easier to place the user label between the bottom
    # of one connector face and the top of the next connector face.
    rect_x = cx - (text_width / 2) - horizontal_pad
    rect_y = y - (label_height / 2)
    text_y = y - (font_size / 2) + 1.8

    c.setFillColor(colors.white)
    c.setStrokeColor(colors.black)
    c.setLineWidth(0.5)
    c.roundRect(
        rect_x,
        rect_y,
        text_width + (horizontal_pad * 2),
        label_height,
        1,
        fill=1,
        stroke=1,
    )

    c.setFillColor(colors.black)
    c.drawCentredString(cx, text_y, printable_label)


def _draw_connector_type_tag(c, tag_text, cx, y, max_width, compact: bool = False):
    if not tag_text:
        return

    # Move the connector type tag slightly upward so it sits just inside
    # the connector face area instead of hanging below and crashing into
    # the next row's user label.
    y += 4

    font_name = "SpaceMono-Bold"
    font_size = 4.0 if compact else 4.5
    tag_height = 6 if compact else 7
    horizontal_pad = 1.6 if compact else 2

    c.setFont(font_name, font_size)

    printable_tag = str(tag_text)

    while c.stringWidth(printable_tag, font_name, font_size) > max_width and len(printable_tag) > 0:
        printable_tag = printable_tag[:-1]

    if not printable_tag:
        return

    tag_width = c.stringWidth(printable_tag, font_name, font_size)

    # Treat y as the visual center of the tag pill.
    rect_x = cx - (tag_width / 2) - horizontal_pad
    rect_y = y - (tag_height / 2)
    text_y = y - (font_size / 2) + 1.4

    c.setFillColor(colors.black)
    c.setStrokeColor(colors.black)
    c.setLineWidth(0.4)
    c.roundRect(
        rect_x,
        rect_y,
        tag_width + (horizontal_pad * 2),
        tag_height,
        1,
        fill=1,
        stroke=1,
    )

    c.setFillColor(colors.white)
    c.drawCentredString(cx, text_y, printable_tag)


def draw_svg_face(c, cx, cy, visual_style):
    """
    Draws a connector face at physical scale coordinates in a line-art/wireframe style.
    """
    c.saveState()

    target_w = 260.0
    target_h = 310.0

    scale = (0.51 * inch) / target_w
    drawn_w = target_w * scale
    drawn_h = target_h * scale

    c.translate(cx - (drawn_w / 2), cy - (drawn_h / 2) + drawn_h)
    c.scale(scale, -scale)

    def draw_flange():
        c.setLineWidth(2)
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.roundRect(0, 0, 260, 310, 20, fill=1, stroke=1)

        c.setLineWidth(1.5)
        c.circle(35, 35, 16, fill=1, stroke=1)
        c.circle(35, 35, 6, fill=1, stroke=1)
        c.circle(225, 275, 16, fill=1, stroke=1)
        c.circle(225, 275, 6, fill=1, stroke=1)

    if visual_style == "empty":
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)

        c.setStrokeColor(colors.white)
        c.rect(15, 40, 230, 25, fill=1, stroke=1)

        c.setStrokeColor(colors.black)
        c.line(67, 65, 193, 65)

        c.setLineWidth(1.5)
        c.circle(35, 35, 16, fill=1, stroke=1)
        c.circle(225, 275, 16, fill=1, stroke=1)
        c.circle(35, 35, 6, fill=1, stroke=1)
        c.circle(225, 275, 6, fill=1, stroke=1)

    elif visual_style == "ethercon":
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)

        p = c.beginPath()
        p.moveTo(100, 50)
        p.lineTo(160, 50)
        p.lineTo(150, 90)
        p.lineTo(110, 90)
        p.close()
        c.drawPath(p, fill=1, stroke=1)

        c.roundRect(110, 60, 40, 6, 2, fill=1, stroke=1)
        c.roundRect(85, 120, 90, 75, 5, fill=1, stroke=1)

        p2 = c.beginPath()
        p2.moveTo(115, 195)
        p2.lineTo(145, 195)
        p2.lineTo(145, 215)
        p2.lineTo(115, 215)
        p2.close()
        c.drawPath(p2, fill=1, stroke=1)

        for i in range(8):
            c.rect(96 + (i * 9), 125, 4, 20, fill=1, stroke=1)

    elif visual_style == "xlr_f":
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)

        p = c.beginPath()
        p.moveTo(100, 50)
        p.lineTo(160, 50)
        p.lineTo(150, 90)
        p.lineTo(110, 90)
        p.close()
        c.drawPath(p, fill=1, stroke=1)

        c.circle(130, 70, 10, fill=1, stroke=1)

        c.setFillColor(colors.black)
        c.setFont("SpaceMono-Bold", 20)
        c.drawCentredString(130, 40, "PUSH")

        c.setFillColor(colors.white)
        c.circle(95, 130, 16, fill=1, stroke=1)
        c.circle(165, 130, 16, fill=1, stroke=1)
        c.circle(130, 200, 16, fill=1, stroke=1)

    elif visual_style == "xlr_m":
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

    elif visual_style == "bnc":
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        c.circle(130, 155, 65, fill=1, stroke=1)
        c.roundRect(45, 145, 170, 20, 5, fill=1, stroke=1)
        c.circle(130, 155, 45, fill=1, stroke=1)
        c.circle(130, 155, 10, fill=1, stroke=1)

    elif visual_style in ["opticalcon_duo", "opticalcon_quad"]:
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        c.roundRect(55, 125, 150, 60, 10, fill=1, stroke=1)

        if visual_style == "opticalcon_quad":
            c.roundRect(100, 80, 60, 150, 10, fill=1, stroke=1)

        if visual_style == "opticalcon_duo":
            c.circle(100, 155, 12, fill=1, stroke=1)
            c.circle(160, 155, 12, fill=1, stroke=1)
        else:
            c.circle(100, 125, 12, fill=1, stroke=1)
            c.circle(160, 125, 12, fill=1, stroke=1)
            c.circle(100, 185, 12, fill=1, stroke=1)
            c.circle(160, 185, 12, fill=1, stroke=1)

    elif visual_style in ["mtp12", "mtp24", "mtp48"]:
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        c.roundRect(65, 135, 130, 40, 8, fill=1, stroke=1)
        c.roundRect(85, 150, 90, 10, 2, fill=1, stroke=1)

        num = visual_style.replace("mtp", "")
        c.setFillColor(colors.black)
        c.setFont("SpaceMono-Bold", 36)
        c.drawCentredString(130, 120, num)

    elif visual_style in ["true1", "true1_in"]:
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        c.circle(130, 155, 75, fill=1, stroke=1)
        c.rect(115, 70, 30, 20, fill=1, stroke=1)

        c.rect(110, 135, 8, 35, fill=1, stroke=1)
        c.rect(140, 135, 8, 35, fill=1, stroke=1)
        c.rect(120, 175, 20, 8, fill=1, stroke=1)

    elif visual_style == "true1_out":
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)

        p = c.beginPath()
        p.moveTo(115, 55)
        p.lineTo(145, 55)
        p.lineTo(150, 95)
        p.lineTo(110, 95)
        p.close()
        c.drawPath(p, fill=1, stroke=1)

        c.circle(130, 155, 75, fill=1, stroke=1)
        c.circle(130, 155, 50, fill=1, stroke=1)
        c.rect(110, 145, 10, 25, fill=1, stroke=1)
        c.rect(140, 145, 10, 25, fill=1, stroke=1)

    elif visual_style in ["powercon_blue", "powercon_white"]:
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        c.circle(130, 155, 60, fill=1, stroke=1)
        c.rect(120, 45, 20, 20, fill=1, stroke=1)

    elif visual_style == "speakon":
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

    elif visual_style == "hdmi":
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

    elif visual_style == "usb":
        draw_flange()
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(2)
        c.circle(130, 155, 110, fill=1, stroke=1)
        c.circle(130, 155, 70, fill=1, stroke=1)
        c.roundRect(75, 130, 110, 50, 3, fill=1, stroke=1)

        c.setFillColor(colors.black)
        c.rect(100, 130, 15, 8, fill=1, stroke=0)
        c.rect(145, 130, 15, 8, fill=1, stroke=0)
        c.rect(79, 150, 102, 26, fill=1, stroke=0)

        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(1)
        c.rect(95, 152, 10, 20, fill=1, stroke=1)
        c.rect(120, 152, 10, 20, fill=1, stroke=1)
        c.rect(145, 152, 10, 20, fill=1, stroke=1)
        c.rect(170, 152, 10, 20, fill=1, stroke=1)

    else:
        draw_flange()

    c.restoreState()


def _draw_pe_recursive(c, x, y, w, h, instance, connector_label_mode: str = "normal"):
    template = instance.get("template")
    if not template:
        return

    sub_slots = template.get("panel_slots") or []
    children = instance.get("children") or []

    is_connector = len(sub_slots) == 0
    visual_style = template.get("visual_style", "standard")

    cx = x + w / 2
    cy = y + h / 2

    user_label_offset_y = 0.38 * inch
    connector_tag_offset_y = 0.30 * inch
    compact_connector_tag = connector_label_mode == "compact"

    if is_connector:
        if visual_style.startswith("gblock"):
            gb_size = 0.5 * inch
            fx = cx - gb_size / 2
            fy = cy - gb_size / 2

            c.setFillColor(colors.white)
            c.setStrokeColor(colors.black)
            c.setLineWidth(1)
            c.roundRect(fx, fy, gb_size, gb_size, 2, fill=1, stroke=1)

            c.circle(fx + 4, fy + 4, 1.5, fill=1, stroke=1)
            c.circle(fx + gb_size - 4, fy + gb_size - 4, 1.5, fill=1, stroke=1)
            c.circle(fx + 4, fy + gb_size - 4, 1.5, fill=1, stroke=1)
            c.circle(fx + gb_size - 4, fy + 4, 1.5, fill=1, stroke=1)

            if visual_style == "gblock_6pr":
                for pr_x in [0.3, 0.5, 0.7]:
                    for pr_y in [0.35, 0.65]:
                        c.circle(fx + gb_size * pr_x, fy + gb_size * pr_y, 2, fill=1, stroke=1)
            else:
                for pr_x in [0.25, 0.42, 0.58, 0.75]:
                    for pr_y in [0.25, 0.5, 0.75]:
                        c.circle(fx + gb_size * pr_x, fy + gb_size * pr_y, 1.5, fill=1, stroke=1)
        else:
            draw_svg_face(c, cx, cy, visual_style)

        if instance.get("label"):
            _draw_user_label(
                c,
                instance.get("label"),
                cx,
                cy + user_label_offset_y,
                max_width=w - 2,
                font_size=6,
            )

        connector_tag = _get_connector_print_label(template, compact=compact_connector_tag)

        if connector_tag:
            _draw_connector_type_tag(
                c,
                connector_tag,
                cx,
                cy - connector_tag_offset_y,
                max_width=w - 2,
                compact=compact_connector_tag,
            )

        return

    c.setFillColor(colors.white)
    c.setStrokeColor(colors.black)
    c.setLineWidth(1)
    c.rect(x + 0.5, y, w - 1, h, fill=1, stroke=1)

    slot_count = len(sub_slots)
    template_model = (template.get("model_number") or template.get("name") or "")[:12]
    is_module = bool(template.get("slot_type")) or "ucp" in template_model.lower()
    ru_height = max(1, round(float(template.get("width_units") or 1.0)))

    if not is_module:
        grid_rows = ru_height
        grid_cols = (slot_count + grid_rows - 1) // grid_rows
    else:
        grid_cols, grid_rows = _get_module_slot_grid(template, sub_slots)

    c.setFillColor(colors.white)
    c.setStrokeColor(colors.black)
    c.setLineWidth(0.5)

    if grid_cols == 1:
        c.circle(x + w / 2, y + 5, 2, fill=1, stroke=1)
        c.circle(x + w / 2, y + h - 5, 2, fill=1, stroke=1)
    else:
        c.circle(x + 5, y + 5, 2, fill=1, stroke=1)
        c.circle(x + w - 5, y + 5, 2, fill=1, stroke=1)
        c.circle(x + 5, y + h - 5, 2, fill=1, stroke=1)
        c.circle(x + w - 5, y + h - 5, 2, fill=1, stroke=1)

    c.setFillColor(colors.black)
    c.setFont("SpaceMono-Bold", 5)

    if is_module:
        if instance.get("label"):
            c.drawCentredString(cx, y + h - 8, instance["label"])
    else:
        if instance.get("label"):
            c.drawCentredString(cx, y + h - 8, instance["label"])
        c.drawCentredString(cx, y + 4, template_model)

    if not sub_slots:
        return

    if is_module:
        margin_y_top = 20 if instance.get("label") else 6
        margin_y_bottom = 6
    else:
        margin_y_top = 6
        margin_y_bottom = 16

    avail_h = h - margin_y_top - margin_y_bottom
    avail_y = y + margin_y_bottom

    cell_w = w / grid_cols
    cell_h = avail_h / grid_rows

    is_dense_steck_plate = is_module and slot_count in [4, 6]

    for i, ss in enumerate(sub_slots):
        col = i % grid_cols
        row = i // grid_cols

        pdf_row = grid_rows - 1 - row

        cell_x = x + (col * cell_w)
        cell_y = avail_y + (pdf_row * cell_h)
        cell_cx = cell_x + cell_w / 2
        cell_cy = cell_y + cell_h / 2

        child = next(
            (c_inst for c_inst in children if _slot_id_matches(c_inst.get("slot_id"), ss, i)),
            None,
        )

        if child:
            child_label = child.get("label")

            if child_label:
                _draw_user_label(
                    c,
                    child_label,
                    cell_cx,
                    cell_cy + user_label_offset_y,
                    max_width=cell_w - 2,
                    font_size=6,
                )

                child = {k: v for k, v in child.items()}
                child["label"] = ""

            _draw_pe_recursive(
                c,
                cell_x,
                cell_y,
                cell_w,
                cell_h,
                child,
                connector_label_mode="compact" if is_dense_steck_plate else "normal",
            )
            continue

        is_dhole = checkIsDHole(ss.get("accepted_module_type"), ss.get("name"))

        if is_dhole:
            draw_svg_face(c, cell_cx, cell_cy, "empty")

            c.setFillColor(colors.black)
            c.setFont("SpaceMono-Bold", 5)
            c.drawCentredString(
                cell_cx,
                cell_cy + user_label_offset_y,
                (ss.get("name") or "Empty")[:10],
            )
        else:
            c.setFillColor(colors.white)
            c.setStrokeColor(colors.black)
            c.rect(cell_x + 2, cell_y + 2, cell_w - 4, cell_h - 4, fill=1, stroke=1)


def draw_panel_visual(c, x, y, width, height, panel_data):
    """
    Renders a visual representation of a patch panel chassis using physical coordinate ratios.
    """
    c.setStrokeColor(colors.black)
    c.setFillColor(colors.white)
    c.setLineWidth(1)
    c.rect(x, y, width, height, fill=1, stroke=1)

    ear_w = 0.3 * inch

    c.rect(x, y, ear_w, height, fill=1, stroke=1)
    c.circle(x + (ear_w / 2), y + 10, 4, fill=1, stroke=1)
    c.circle(x + (ear_w / 2), y + height - 10, 4, fill=1, stroke=1)

    c.rect(x + width - ear_w, y, ear_w, height, fill=1, stroke=1)
    c.circle(x + width - (ear_w / 2), y + 10, 4, fill=1, stroke=1)
    c.circle(x + width - (ear_w / 2), y + height - 10, 4, fill=1, stroke=1)

    lip_h = 0.05 * inch
    c.rect(x + ear_w, y + height - lip_h, width - (ear_w * 2), lip_h, fill=1, stroke=1)
    c.rect(x + ear_w, y, width - (ear_w * 2), lip_h, fill=1, stroke=1)

    draw_width = width - (ear_w * 2)
    slots_area_x = x + ear_w

    eq_templates = panel_data.get("panel", {}).get("equipment_templates") or {}
    infra_slots = eq_templates.get("slots") or []
    mounted_instances = panel_data.get("mounted_instances") or []

    if not infra_slots:
        return

    slot_width = draw_width / len(infra_slots)

    for i, slot in enumerate(infra_slots):
        slot_x = slots_area_x + (i * slot_width)
        slot_y = y + lip_h
        slot_h = height - (lip_h * 2)

        is_dhole = checkIsDHole(slot.get("accepted_module_type"), slot.get("name"))
        instance = next(
            (m for m in mounted_instances if _slot_id_matches(m.get("slot_id"), slot, i)),
            None,
        )

        if not is_dhole:
            c.setStrokeColor(colors.black)
            c.setLineWidth(1)
            c.rect(slot_x, slot_y, slot_width, slot_h, fill=0, stroke=1)
            c.circle(slot_x + slot_width / 2, slot_y + 5, 2, fill=1, stroke=1)
            c.circle(slot_x + slot_width / 2, slot_y + slot_h - 5, 2, fill=1, stroke=1)
        elif not instance:
            draw_svg_face(c, slot_x + slot_width / 2, slot_y + slot_h / 2, "empty")

            c.setFillColor(colors.black)
            c.setFont("SpaceMono-Bold", 5)
            c.drawCentredString(
                slot_x + slot_width / 2,
                slot_y + slot_h / 2 + 0.38 * inch,
                (slot.get("name") or "Empty")[:10],
            )

        if instance:
            _draw_pe_recursive(c, slot_x, slot_y, slot_width, slot_h, instance)
