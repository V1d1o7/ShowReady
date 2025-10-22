from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
import io

def generate_hours_pdf(payload):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()

    title = Paragraph(f"{payload['show_name']} - Weekly Timesheet", styles['h1'])
    elements.append(title)

    header = ['Crew Member'] + payload['dates'] + ['Regular', 'OT', 'Cost']
    data = [header]

    for c in payload['crew']:
        row = [f"{c['roster']['first_name']} {c['roster']['last_name']}"]
        crew_hours = payload['hoursByDate'].get(str(c['id']), {}).get('hours', {})
        
        for d in payload['dates']:
            row.append(crew_hours.get(d, 0))

        weekly_total = sum(crew_hours.values())
        ot_hours = max(0, weekly_total - 40) # Assuming a fixed 40-hour threshold for simplicity
        regular_hours = weekly_total - ot_hours
        
        if c['rate_type'] == 'daily':
            cost = c['daily_rate'] if weekly_total > 0 else 0
        else:
            cost = (regular_hours * c['hourly_rate']) + (ot_hours * c['hourly_rate'] * 1.5)

        row.append(regular_hours)
        row.append(ot_hours)
        row.append(f"${cost:.2f}")
        
        data.append(row)

    table = Table(data)
    style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ])
    table.setStyle(style)
    elements.append(table)

    doc.build(elements)
    buffer.seek(0)
    return buffer