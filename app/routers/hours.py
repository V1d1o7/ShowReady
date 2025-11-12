from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from supabase import Client
from app.api import get_user, get_branding_visibility, get_supabase_client
from app.models import (
    TimesheetEntryCreate, WeeklyTimesheet, 
    CrewMemberHours, TimesheetEmailPayload
)
from app.user_email import send_email_with_user_smtp, SMTPSettings, create_styled_email_template
from app.pdf_utils import generate_hours_pdf
from fastapi.responses import Response
import uuid
from typing import List
from datetime import date, timedelta

router = APIRouter(prefix="/shows/{show_id}", tags=["Timesheets"])

# This helper function is the core logic
async def get_timesheet_data(show_id: int, week_start_date: date, user_id: uuid.UUID, supabase: Client) -> WeeklyTimesheet:
    week_end_date = week_start_date + timedelta(days=6)

    # Get current user's roster_id from their roster entry
    roster_res = supabase.table('roster').select('id').eq('user_id', str(user_id)).execute()
    # Handle multiple roster entries for a user by taking the first one.
    user_roster_id = roster_res.data[0].get('id') if roster_res.data else None

    # 1. Get Show Info (for OT rules)
    show_res = supabase.table('shows').select('id, name, data').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found")
    
    show_info = show_res.data
    show_data = show_info.get('data', {}) or {}
    # Correctly access the nested info object for logo_path and other settings
    info_data = show_data.get('info', {}) or {}

    logo_path = info_data.get('logo_path')
    ot_daily_threshold = info_data.get('ot_daily_threshold', 10)
    ot_weekly_threshold = info_data.get('ot_weekly_threshold', 40)
    pay_period_start_day = info_data.get('pay_period_start_day', 0)

    # 2. Get Show Crew and their Roster info
    crew_res = supabase.table('show_crew').select('*, roster(*)').eq('show_id', show_id).execute()

    # Sort crew members: current user first, then alphabetically by first name
    sorted_crew_data = sorted(
        crew_res.data,
        key=lambda c: (
            c.get('roster_id') != user_roster_id, # False (0) for user, True (1) for others
            (c.get('roster') or {}).get('first_name', '').lower(),
            (c.get('roster') or {}).get('last_name', '').lower()
        )
    )
    
    show_crew_ids = [c['id'] for c in sorted_crew_data]
    
    # 3. Get all hours for this crew for this week
    hours_res = supabase.table('timesheet_entries').select('*') \
        .in_('show_crew_id', show_crew_ids) \
        .gte('date', str(week_start_date)) \
        .lte('date', str(week_end_date)) \
        .execute()

    # 4. Assemble the data
    hours_map = {} # {show_crew_id: {date: hours}}
    for h in hours_res.data:
        if h['show_crew_id'] not in hours_map:
            hours_map[h['show_crew_id']] = {}
        hours_map[h['show_crew_id']][h['date']] = h['hours']

    assembled_crew_hours = []
    for c in sorted_crew_data:
        assembled_crew_hours.append(
            CrewMemberHours(
                show_crew_id=c['id'],
                first_name=c['roster']['first_name'],
                last_name=c['roster']['last_name'],
                rate_type=c['rate_type'],
                hourly_rate=c['hourly_rate'],
                daily_rate=c['daily_rate'],
                hours_by_date=hours_map.get(c['id'], {})
            )
        )

    return WeeklyTimesheet(
        show_id=show_id,
        show_name=show_info['name'],
        logo_path=logo_path,
        week_start_date=week_start_date,
        week_end_date=week_end_date,
        ot_daily_threshold=ot_daily_threshold,
        ot_weekly_threshold=ot_weekly_threshold,
        pay_period_start_day=pay_period_start_day,
        crew_hours=assembled_crew_hours
    )


@router.get("/timesheet", response_model=WeeklyTimesheet)
async def get_weekly_timesheet(
    show_id: int, 
    week_start_date: date = Query(...), 
    user=Depends(get_user), 
    supabase: Client = Depends(get_supabase_client),
    show_branding: bool = Depends(get_branding_visibility)
):
    """Gets all data needed to display a weekly timesheet."""
    return await get_timesheet_data(show_id, week_start_date, user.id, supabase)

@router.put("/timesheet")
async def update_weekly_timesheet(
    show_id: int, 
    timesheet: WeeklyTimesheet, 
    user=Depends(get_user), 
    supabase: Client = Depends(get_supabase_client)
):
    """Saves all hours for a weekly timesheet. This is an atomic bulk upsert."""
    entries_to_upsert = []
    for crew_member in timesheet.crew_hours:
        for day, hours in crew_member.hours_by_date.items():
            entry = TimesheetEntryCreate(
                show_crew_id=crew_member.show_crew_id,
                date=day.isoformat(),
                hours=hours
            ).model_dump()
            entry['show_crew_id'] = str(entry['show_crew_id'])
            entries_to_upsert.append(entry)

    if not entries_to_upsert:
        return {"message": "No hours to save."}
        
    try:
        # Perform a single, atomic bulk upsert, telling Supabase to update on conflict
        # with the composite key.
        supabase.table('timesheet_entries').upsert(
            entries_to_upsert,
            on_conflict='show_crew_id,date'
        ).execute()
        return {"message": "Timesheet saved successfully."}
    except Exception as e:
        print(f"Error during bulk update: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

@router.get("/timesheet/pdf")
async def get_timesheet_pdf(
    show_id: int, 
    week_start_date: date = Query(...), 
    user=Depends(get_user), 
    supabase: Client = Depends(get_supabase_client),
    show_branding: bool = Depends(get_branding_visibility)
):
    """Generates and returns a PDF of the weekly timesheet."""
    # 1. Fetch User Profile
    profile_res = supabase.table('profiles').select('*').eq('id', user.id).single().execute()
    if not profile_res.data:
        raise HTTPException(status_code=404, detail="User profile not found.")
    
    user_profile = profile_res.data
    user_info = {
        "full_name": f"{user_profile.get('first_name', '')} {user_profile.get('last_name', '')}".strip(),
        "company": user_profile.get('company_name'),
        "position": user_profile.get('production_role')
    }
    
    company_logo_path = user_profile.get('company_logo_path')
    company_logo_bytes = None
    if company_logo_path:
        try:
            company_logo_bytes = supabase.storage.from_('logos').download(company_logo_path)
        except Exception:
            pass

    # 2. Fetch Timesheet Data
    timesheet_data = await get_timesheet_data(show_id, week_start_date, user.id, supabase)

    show_logo_bytes = None
    if timesheet_data.logo_path:
        try:
            show_logo_bytes = supabase.storage.from_('logos').download(timesheet_data.logo_path)
        except Exception:
            pass

    # 3. Structure data for the new PDF generator
    show_info = { "name": timesheet_data.show_name }
    
    # Create the 'dates' list with MM/DD/YY format
    dates = [(timesheet_data.week_start_date + timedelta(days=i)).strftime('%m/%d/%y') for i in range(7)]

    # Create the 'crew' and 'hoursByDate' dictionaries
    crew_list = []
    hours_by_date_payload = {}
    for member in timesheet_data.crew_hours:
        crew_list.append({
            "id": str(member.show_crew_id),
            "roster": { "first_name": member.first_name, "last_name": member.last_name },
            "rate_type": member.rate_type, "daily_rate": member.daily_rate, "hourly_rate": member.hourly_rate
        })
        # Use the formatted date string as the key
        hours_by_date_payload[str(member.show_crew_id)] = {
            "hours": {day.strftime('%m/%d/%y'): hours for day, hours in member.hours_by_date.items()}
        }

    payload = { "dates": dates, "crew": crew_list, "hoursByDate": hours_by_date_payload }

    # 4. Generate PDF
    pdf_bytes_io = await run_in_threadpool(
        generate_hours_pdf,
        user=user_info,
        show=show_info,
        payload=payload,
        ot_weekly_threshold=timesheet_data.ot_weekly_threshold,
        ot_daily_threshold=timesheet_data.ot_daily_threshold,
        show_logo_bytes=show_logo_bytes,
        company_logo_bytes=company_logo_bytes,
        show_branding=show_branding
    )
    
    filename = f"{timesheet_data.show_name.strip()} Hours | {week_start_date}.pdf"

    return Response(
        content=pdf_bytes_io.getvalue(), 
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/timesheet/email")
async def email_weekly_timesheet(
    show_id: int, 
    payload: TimesheetEmailPayload,
    week_start_date: date = Query(...), 
    user=Depends(get_user), 
    supabase: Client = Depends(get_supabase_client)
):
    """Generates a timesheet PDF and emails it using the user's SMTP settings."""
    user_id = user.id

    # 1. Get User's SMTP settings
    smtp_res = supabase.table('user_smtp_settings').select('*').eq('user_id', user_id).maybe_single().execute()
    if not smtp_res.data:
        raise HTTPException(status_code=400, detail="SMTP settings not configured. Please add them in your Account settings.")
    smtp_settings = SMTPSettings(**smtp_res.data)

    # 2. Fetch User Profile for PDF header
    profile_res = supabase.table('profiles').select('*').eq('id', user.id).single().execute()
    if not profile_res.data:
        raise HTTPException(status_code=404, detail="User profile not found.")
    
    user_profile = profile_res.data
    user_info = {
        "full_name": f"{user_profile.get('first_name', '')} {user_profile.get('last_name', '')}".strip(),
        "company": user_profile.get('company_name')
    }
    company_logo_path = user_profile.get('company_logo_path')
    company_logo_bytes = None
    if company_logo_path:
        try:
            company_logo_bytes = supabase.storage.from_('logos').download(company_logo_path)
        except Exception:
            pass

    # 3. Get Timesheet Data
    timesheet_data = await get_timesheet_data(show_id, week_start_date, user.id, supabase)

    show_logo_bytes = None
    if timesheet_data.logo_path:
        try:
            show_logo_bytes = supabase.storage.from_('logos').download(timesheet_data.logo_path)
        except Exception:
            pass

    # 4. Structure data for PDF generator
    show_info = { "name": timesheet_data.show_name }
    dates = [(timesheet_data.week_start_date + timedelta(days=i)).strftime('%m/%d/%y') for i in range(7)]
    crew_list = []
    hours_by_date_payload = {}
    for member in timesheet_data.crew_hours:
        crew_list.append({
            "id": str(member.show_crew_id),
            "roster": { "first_name": member.first_name, "last_name": member.last_name },
            "rate_type": member.rate_type, "daily_rate": member.daily_rate, "hourly_rate": member.hourly_rate
        })
        hours_by_date_payload[str(member.show_crew_id)] = {
            "hours": {day.strftime('%m/%d/%y'): hours for day, hours in member.hours_by_date.items()}
        }
    pdf_payload = { "dates": dates, "crew": crew_list, "hoursByDate": hours_by_date_payload }

    # 5. Generate PDF
    pdf_bytes_io = await run_in_threadpool(
        generate_hours_pdf,
        user=user_info, show=show_info, payload=pdf_payload,
        ot_weekly_threshold=timesheet_data.ot_weekly_threshold,
        ot_daily_threshold=timesheet_data.ot_daily_threshold,
        show_logo_bytes=show_logo_bytes, company_logo_bytes=company_logo_bytes,
        show_branding=payload.show_branding
    )
    pdf_bytes = pdf_bytes_io.getvalue()
    filename = f"{timesheet_data.show_name.strip()} Hours | {week_start_date}.pdf"

    # 4. Send Email in a separate thread to avoid blocking
    try:
        # Format the user's custom message to match the email style
        # Use a standard string and .format() to avoid f-string limitations with backslashes
        user_message_html_template = """
        <div style="margin-top: 20px; text-align: left; background-color: #1F2937; padding: 20px; border-radius: 10px;">
            <p style="font-size: 16px; line-height: 1.8; color: #d4d4d8; text-align: left; margin: 0;">
                {}
            </p>
        </div>
        """
        content_html = user_message_html_template.format(payload.body.replace("\n", "<br>"))
        
        # Construct the full public URL for the show logo
        logo_url = None
        if timesheet_data.logo_path:
            logo_url = supabase.storage.from_('logos').get_public_url(timesheet_data.logo_path)

        # Wrap everything in the main styled template, passing logo and branding info
        final_html_body = create_styled_email_template(
            title="Timesheet Submission",
            content_html=content_html,
            logo_url=logo_url,
            show_branding=payload.show_branding
        )

        await run_in_threadpool(
            send_email_with_user_smtp,
            smtp_settings=smtp_settings,
            recipient_emails=payload.recipient_emails,
            subject=payload.subject,
            html_body=final_html_body,
            attachment_blob=pdf_bytes,
            attachment_filename=filename
        )
        return {"message": "Email sent successfully."}
    except Exception as e:
        import traceback
        print(f"Error sending email: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to send email: {repr(e)}")
