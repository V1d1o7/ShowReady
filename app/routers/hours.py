from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from app.api import get_supabase_client, get_user
from app.models import (
    TimesheetEntryCreate, WeeklyTimesheet, 
    CrewMemberHours, TimesheetEmailPayload
)
from app.user_email import send_email_with_user_smtp, SMTPSettings
from app.pdf_utils import generate_timesheet_pdf
from fastapi.responses import Response

import uuid
from typing import List
from datetime import date, timedelta

router = APIRouter(prefix="/shows/{show_id}", tags=["Timesheets"])

# This helper function is the core logic
async def get_timesheet_data(show_id: int, week_start_date: date, supabase: Client) -> WeeklyTimesheet:
    week_end_date = week_start_date + timedelta(days=6)

    # 1. Get Show Info (for OT rules and PM email)
    # The logo_path is stored in the `data` jsonb column, not as a top-level column.
    show_res = supabase.table('shows').select('id, name, ot_weekly_threshold, show_pm_email, data').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found")
    show_info = show_res.data
    show_data_json = show_info.get('data', {}) or {}
    logo_path = show_data_json.get('info', {}).get('logo_path')

    # 2. Get Show Crew and their Roster info
    crew_res = supabase.table('show_crew').select('*, roster(*)').eq('show_id', show_id).execute()
    
    show_crew_ids = [c['id'] for c in crew_res.data]
    
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
    for c in crew_res.data:
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
        ot_weekly_threshold=show_info['ot_weekly_threshold'],
        crew_hours=assembled_crew_hours
    )


@router.get("/timesheet", response_model=WeeklyTimesheet)
async def get_weekly_timesheet(
    show_id: int, 
    week_start_date: date = Query(...), 
    user=Depends(get_user), 
    supabase: Client = Depends(get_supabase_client)
):
    """Gets all data needed to display a weekly timesheet."""
    return await get_timesheet_data(show_id, week_start_date, supabase)

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
        # Perform a single, atomic bulk upsert
        supabase.table('timesheet_entries').upsert(entries_to_upsert).execute()
        return {"message": "Timesheet saved successfully."}
    except Exception as e:
        print(f"Error during bulk update: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

@router.get("/timesheet/pdf")
async def get_timesheet_pdf(
    show_id: int, 
    week_start_date: date = Query(...), 
    user=Depends(get_user), 
    supabase: Client = Depends(get_supabase_client)
):
    """Generates and returns a PDF of the weekly timesheet."""
    timesheet_data = await get_timesheet_data(show_id, week_start_date, supabase)
    
    logo_bytes = None
    if timesheet_data.logo_path:
        try:
            res = supabase.storage.from_('logos').download(timesheet_data.logo_path)
            logo_bytes = res
        except Exception as e:
            print(f"Could not download logo: {e}")

    pdf_bytes_io = generate_timesheet_pdf(timesheet_data, logo_bytes)
    
    return Response(content=pdf_bytes_io.getvalue(), media_type="application/pdf")


@router.post("/timesheet/email")
async def email_weekly_timesheet(
    show_id: int, 
    payload: TimesheetEmailPayload,
    week_start_date: date = Query(...), 
    user=Depends(get_user), 
    supabase: Client = Depends(get_supabase_client)
):
    """Generates a timesheet PDF and emails it using the user's SMTP settings."""
    user_id = user['id']

    # 1. Get User's SMTP settings
    res = supabase.table('user_smtp_settings').select('*').eq('user_id', user_id).maybe_single().execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="SMTP settings not configured. Please add them in your Account settings.")
    
    smtp_settings = SMTPSettings(**res.data)

    # 2. Get Timesheet Data
    timesheet_data = await get_timesheet_data(show_id, week_start_date, supabase)

    # 3. Generate PDF (in memory)
    logo_bytes = None
    if timesheet_data.logo_path:
        try:
            res = supabase.storage.from_('logos').download(timesheet_data.logo_path)
            logo_bytes = res
        except Exception as e:
            print(f"Could not download logo: {e}")

    pdf_bytes_io = generate_timesheet_pdf(timesheet_data, logo_bytes)
    pdf_bytes = pdf_bytes_io.getvalue()
    filename = f"{timesheet_data.show_name} Timesheet - {week_start_date}.pdf"

    # 4. Send Email
    try:
        send_email_with_user_smtp(
            smtp_settings=smtp_settings,
            recipient_email=payload.recipient_email,
            subject=payload.subject,
            html_body=payload.body.replace("\n", "<br>"),
            attachment_blob=pdf_bytes,
            attachment_filename=filename
        )
        return {"message": "Email sent successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {e}")
