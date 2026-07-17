from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from supabase import Client
from app.api import get_user, get_branding_visibility, get_supabase_client
from app.models import ( 
    TimesheetEntryCreate, WeeklyTimesheet,  
    CrewMemberHours, TimesheetEmailPayload, BudgetUpdate
) 
from app.user_email import send_email_with_user_smtp, SMTPSettings
# NOTE: Make sure to import generate_crew_audit_pdf once it's created in pdf_utils.py!
from app.pdf_utils import generate_hours_pdf 
from fastapi.responses import Response 
import uuid 
from typing import List, Optional 
from datetime import date, timedelta 

router = APIRouter(prefix="/shows/{show_id}", tags=["Timesheets"]) 

def calculate_week_cost(crew_hours: list, dates: list, ot_daily_threshold: float, ot_weekly_threshold: float) -> float:
    # crew_hours is a list of dicts, each with:
    # 'show_crew_id', 'roster_id', 'rate_type', 'hourly_rate', 'daily_rate', 'hours_by_date'
    grouped_crew = {}
    for c in crew_hours:
        roster_id = c.get('roster_id') or str(uuid.uuid4())
        if roster_id not in grouped_crew:
            grouped_crew[roster_id] = []
        grouped_crew[roster_id].append(c)

    total_cost_grand = 0.0

    for roster_id, members in grouped_crew.items():
        # Sort members: daily rate first, then by hourly rate descending
        members.sort(key=lambda x: (x.get('rate_type') != 'daily', -1 * (float(x.get('hourly_rate') or 0))))
        
        weekly_regular_hours_tracker = 0.0

        for m in members:
            m['calc_stats'] = {'regular': 0.0, 'ot': 0.0, 'cost': 0.0}

        for day in dates:
            day_entries = []
            for m in members:
                raw_hours = m.get('hours_by_date', {}).get(str(day), 0) or m.get('hours_by_date', {}).get(day, 0)
                h_val = float(raw_hours) if raw_hours else 0.0
                if h_val > 0:
                    day_entries.append({'member': m, 'hours': h_val})
            
            if not day_entries:
                continue

            hours_consumed_in_daily_bucket = 0.0
            has_day_rate_on_day = any(e['member'].get('rate_type') == 'daily' for e in day_entries)

            for entry in day_entries:
                m = entry['member']
                worked = entry['hours']
                entry_cost = 0.0
                regular_h = 0.0
                ot_h = 0.0

                if m.get('rate_type') == 'daily':
                    entry_cost += float(m.get('daily_rate') or 0.0)
                    if worked <= ot_daily_threshold:
                        regular_h = worked
                    else:
                        regular_h = ot_daily_threshold
                        ot_h = worked - ot_daily_threshold
                        implied_rate = float(m.get('daily_rate') or 0.0) / (ot_daily_threshold if ot_daily_threshold > 0 else 10)
                        entry_cost += ot_h * (implied_rate * 1.5)
                    hours_consumed_in_daily_bucket += ot_daily_threshold
                else:
                    current_rate = float(m.get('hourly_rate') or 0.0)
                    remaining_bucket = max(0.0, ot_daily_threshold - hours_consumed_in_daily_bucket)
                    
                    if has_day_rate_on_day:
                        absorbed_hours = min(worked, remaining_bucket)
                        overflow_hours = worked - absorbed_hours
                        regular_h = absorbed_hours
                        ot_h = overflow_hours
                        entry_cost += overflow_hours * (current_rate * 1.5)
                        hours_consumed_in_daily_bucket += absorbed_hours
                    else:
                        straight_portion = min(worked, remaining_bucket)
                        ot_portion = worked - straight_portion
                        entry_cost += straight_portion * current_rate
                        entry_cost += ot_portion * (current_rate * 1.5)
                        regular_h = straight_portion
                        ot_h = ot_portion
                        hours_consumed_in_daily_bucket += straight_portion
                
                m['calc_stats']['regular'] += regular_h
                m['calc_stats']['ot'] += ot_h
                m['calc_stats']['cost'] += entry_cost
                if m.get('rate_type') == 'hourly':
                    weekly_regular_hours_tracker += regular_h

        if weekly_regular_hours_tracker > ot_weekly_threshold:
            weekly_ot_hours = weekly_regular_hours_tracker - ot_weekly_threshold
            
            for m in reversed(members):
                if m.get('rate_type') == 'hourly' and weekly_ot_hours > 0:
                    current_rate = float(m.get('hourly_rate') or 0.0)
                    regular_hours_in_member = m['calc_stats']['regular']

                    ot_to_apply = min(weekly_ot_hours, regular_hours_in_member)
                    
                    m['calc_stats']['regular'] -= ot_to_apply
                    m['calc_stats']['ot'] += ot_to_apply
                    
                    m['calc_stats']['cost'] -= ot_to_apply * current_rate
                    m['calc_stats']['cost'] += ot_to_apply * (current_rate * 1.5)
                    
                    weekly_ot_hours -= ot_to_apply

        for m in members:
            total_cost_grand += m['calc_stats']['cost']

    return total_cost_grand

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
     
    # 3. Get all hours for this crew
    all_hours_res = supabase.table('timesheet_entries').select('*') \
        .in_('show_crew_id', show_crew_ids) \
        .execute() 

    # 4. Assemble current week and other weeks
    hours_map = {} # {show_crew_id: {date: hours}} 
    other_hours_by_date = []
    for h in all_hours_res.data: 
        h_date = date.fromisoformat(h['date'])
        if week_start_date <= h_date <= week_end_date:
            if h['show_crew_id'] not in hours_map: 
                hours_map[h['show_crew_id']] = {} 
            hours_map[h['show_crew_id']][h['date']] = h['hours'] 
        else:
            other_hours_by_date.append(h)

    assembled_crew_hours = [] 
    for c in sorted_crew_data: 
        roster_info = c.get('roster') or {}
        assembled_crew_hours.append( 
            CrewMemberHours( 
                show_crew_id=c['id'], 
                roster_id=c.get('roster_id'), # Pass the roster_id for grouping logic 
                first_name=roster_info.get('first_name'), 
                last_name=roster_info.get('last_name'), 
                position=c.get('position'), # Pass the position for the line item
                rate_type=c['rate_type'], 
                hourly_rate=c['hourly_rate'], 
                daily_rate=c['daily_rate'], 
                hours_by_date=hours_map.get(c['id'], {}) 
            ) 
        ) 

    # 5. Group other entries by their week start date
    def get_week_start(d: date, start_day: int) -> date:
        val = (d.weekday() + 1) % 7 # Sunday=0, Monday=1, ... Saturday=6
        diff = (val - start_day + 7) % 7
        return d - timedelta(days=diff)

    entries_by_week = {} # {week_start_date: [entries]}
    for h in other_hours_by_date:
        h_date = date.fromisoformat(h['date'])
        w_start = get_week_start(h_date, pay_period_start_day)
        if w_start not in entries_by_week:
            entries_by_week[w_start] = []
        entries_by_week[w_start].append(h)

    # 6. Calculate cumulative other-weeks cost
    historical_cost = 0.0
    for w_start, entries in entries_by_week.items():
        week_dates = [w_start + timedelta(days=i) for i in range(7)]
        week_crew_hours = []
        for c in sorted_crew_data:
            member_hours_map = {}
            for h in entries:
                if h['show_crew_id'] == c['id']:
                    member_hours_map[h['date']] = h['hours']
            week_crew_hours.append({
                'show_crew_id': c['id'],
                'roster_id': c.get('roster_id'),
                'rate_type': c['rate_type'],
                'hourly_rate': c['hourly_rate'],
                'daily_rate': c['daily_rate'],
                'hours_by_date': member_hours_map
            })
        
        week_cost = calculate_week_cost(
            week_crew_hours, 
            week_dates, 
            ot_daily_threshold, 
            ot_weekly_threshold
        )
        historical_cost += week_cost

    # 7. Fetch/Initialize budget for Labor
    labor_budget_amount = None
    try:
        budget_res = supabase.table('budgets').select('*').eq('show_id', show_id).eq('name', 'Labor').execute()
        if budget_res.data:
            labor_budget_amount = budget_res.data[0].get('allocated_amount')
        else:
            # Auto-initialize budget entry
            # To avoid active/collaboration owner write issues, we can try to insert
            insert_res = supabase.table('budgets').insert({
                'show_id': show_id, 
                'name': 'Labor', 
                'allocated_amount': None
            }).execute()
            if insert_res.data:
                labor_budget_amount = insert_res.data[0].get('allocated_amount')
    except Exception as e:
        print(f"Error fetching/initializing Labor budget: {e}")

    return WeeklyTimesheet( 
        show_id=show_id, 
        show_name=show_info['name'], 
        logo_path=logo_path, 
        week_start_date=week_start_date, 
        week_end_date=week_end_date, 
        ot_daily_threshold=ot_daily_threshold, 
        ot_weekly_threshold=ot_weekly_threshold, 
        pay_period_start_day=pay_period_start_day, 
        crew_hours=assembled_crew_hours,
        labor_budget=labor_budget_amount,
        historical_labor_cost_excluding_current_week=historical_cost
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
    show_info_dict = { "name": timesheet_data.show_name } 
    
    # 4. Generate PDF 
    pdf_bytes_io = await run_in_threadpool( 
        generate_hours_pdf, 
        user=user_info, 
        show=show_info_dict, 
        timesheet_data=timesheet_data.model_dump(mode='json'), 
        show_logo_bytes=show_logo_bytes, 
        company_logo_bytes=company_logo_bytes, 
        show_branding=show_branding 
    ) 
     
    # Filename: {ShowName} Hours {WeekStart}.pdf
    filename = f"{timesheet_data.show_name.strip()} Hours {week_start_date}.pdf" 

    return Response( 
        content=pdf_bytes_io.getvalue(),  
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename={filename}"} 
    ) 

# --- NEW ENDPOINT FOR CREW AUDIT ---
@router.get("/timesheet/audit/pdf")
async def get_crew_audit_pdf(
    show_id: int,
    show_crew_ids: List[str] = Query(..., description="List of show_crew_ids to audit"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user=Depends(get_user),
    supabase: Client = Depends(get_supabase_client),
    show_branding: bool = Depends(get_branding_visibility)
):
    """Generates a comprehensive historical audit PDF for specific crew members."""
    
    # 1. Fetch Show and OT Rules Info
    show_res = supabase.table('shows').select('name, data').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found")
        
    show_info = show_res.data
    ot_rules = show_info.get('data', {}).get('info', {})
    
    # Extract Branding Assets if needed
    logo_path = ot_rules.get('logo_path')
    show_logo_bytes = None 
    if logo_path: 
        try: show_logo_bytes = supabase.storage.from_('logos').download(logo_path) 
        except Exception: pass 
    
    # Fetch User Info for Header/Footer
    profile_res = supabase.table('profiles').select('*').eq('id', user.id).single().execute() 
    user_profile = profile_res.data 
    user_info = { 
        "full_name": f"{user_profile.get('first_name', '')} {user_profile.get('last_name', '')}".strip(), 
        "company": user_profile.get('company_name')
    } 
    
    # 2. Fetch Crew Info
    crew_res = supabase.table('show_crew').select('*, roster(*)').in_('id', show_crew_ids).execute()
    crew_data = crew_res.data

    if not crew_data:
        raise HTTPException(status_code=404, detail="Selected crew members not found")

    # 3. Fetch Timesheet Entries
    query = supabase.table('timesheet_entries').select('*').in_('show_crew_id', show_crew_ids)
    if start_date:
        query = query.gte('date', str(start_date))
    if end_date:
        query = query.lte('date', str(end_date))
        
    entries_res = query.order('date').execute()
    
    # Prepare data payload for PDF utility
    audit_data = {
        "crew": crew_data,
        "entries": entries_res.data,
        "ot_rules": {
            "daily_threshold": ot_rules.get('ot_daily_threshold', 10),
            "weekly_threshold": ot_rules.get('ot_weekly_threshold', 40),
            "start_day": ot_rules.get('pay_period_start_day', 0)
        }
    }

    # 4. Generate PDF (Requires `generate_crew_audit_pdf` in pdf_utils.py)
    # Using generate_hours_pdf as fallback if new func isn't created yet in your utils
    from app.pdf_utils import generate_crew_audit_pdf 
    
    pdf_bytes_io = await run_in_threadpool(
        generate_crew_audit_pdf, 
        user=user_info,
        show={"name": show_info['name']},
        audit_data=audit_data,
        show_logo_bytes=show_logo_bytes,
        show_branding=show_branding
    )
    
    # Dynamic Filename
    if len(show_crew_ids) > 1:
        filename_prefix = "Multi_Crew_Audit"
    else:
        last_name = (crew_data[0].get('roster') or {}).get('last_name', 'Crew')
        filename_prefix = f"{last_name}_Audit"
        
    safe_show_name = show_info['name'].replace(' ', '_')
    filename = f"{filename_prefix}_{safe_show_name}.pdf"

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
    """Emails the weekly timesheet with PDF attachment."""
    user_id = user.id 
    
    # 1. Fetch SMTP Settings
    smtp_res = supabase.table('user_smtp_settings').select('*').eq('user_id', user_id).maybe_single().execute() 
    if not smtp_res.data: 
        raise HTTPException(status_code=400, detail="SMTP settings not configured.") 
    smtp_settings = SMTPSettings(**smtp_res.data) 

    # 2. Fetch Profile Info (for PDF footer and template vars)
    profile_res = supabase.table('profiles').select('*').eq('id', user.id).single().execute() 
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
        except Exception: pass 

    # 3. Fetch Timesheet Data
    timesheet_data = await get_timesheet_data(show_id, week_start_date, user.id, supabase) 
    
    # 3b. Fetch Show Info (PM Details)
    show_res = supabase.table('shows').select('data').eq('id', show_id).single().execute()
    show_info_data = show_res.data.get('data', {}).get('info', {}) if show_res.data else {}
    
    pm_first_name = show_info_data.get('show_pm_first_name', '')
    pm_last_name = show_info_data.get('show_pm_last_name', '')
    
    user_first_name = user_profile.get('first_name', '')
    user_last_name = user_profile.get('last_name', '')
    
    show_logo_bytes = None 
    if timesheet_data.logo_path: 
        try: 
            show_logo_bytes = supabase.storage.from_('logos').download(timesheet_data.logo_path) 
        except Exception: pass 

    show_info_dict = { "name": timesheet_data.show_name } 
    
    # 4. Generate PDF
    pdf_bytes_io = await run_in_threadpool( 
        generate_hours_pdf, 
        user=user_info, 
        show=show_info_dict, 
        timesheet_data=timesheet_data.model_dump(mode='json'),
        show_logo_bytes=show_logo_bytes, 
        company_logo_bytes=company_logo_bytes, 
        show_branding=payload.show_branding 
    ) 
    
    pdf_bytes = pdf_bytes_io.getvalue() 
    
    # 5. Dynamic Filename: {ShowName} Hours {WeekStart}.pdf
    filename = f"{timesheet_data.show_name.strip()} Hours {week_start_date}.pdf" 

    # 6. Prepare Email Content (Templating Engine)
    subject = payload.subject
    body = payload.body

    # Define variable replacements consistent with Communications Suite
    replacements = {
        "showName": timesheet_data.show_name,
        "weekStart": str(week_start_date),
        "companyName": user_info.get("company") or "",
        "replyToEmail": smtp_settings.from_email,
        "pmFirstName": pm_first_name,
        "pmLastName": pm_last_name,
        "userFirstName": user_first_name,
        "userLastName": user_last_name
    }

    # Perform substitutions
    for key, value in replacements.items():
        if value is not None:
            placeholder = "{{" + key + "}}"
            subject = subject.replace(placeholder, str(value))
            body = body.replace(placeholder, str(value))

    # Apply Standard Communications Wrapper if raw text or incomplete HTML
    final_html_body = body
    if "<html" not in final_html_body.lower():
        final_html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ margin: 0; padding: 0; width: 100% !important; background-color: #111827; }}
    table {{ border-collapse: collapse; }}
  </style>
</head>
<body style="margin: 0; padding: 0; width: 100% !important; background-color: #111827;">
  {body}
</body>
</html>"""

    # 7. Send Email
    try: 
        await run_in_threadpool( 
            send_email_with_user_smtp, 
            smtp_settings=smtp_settings, 
            recipient_emails=payload.recipient_emails, 
            subject=subject, 
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


@router.get("/budget")
async def get_show_budget(
    show_id: int,
    user=Depends(get_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Retrieves the Labor budget for a specific show."""
    try:
        res = supabase.table('budgets').select('*').eq('show_id', show_id).eq('name', 'Labor').execute()
        if res.data:
            return res.data[0]
        return {"allocated_amount": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/budget")
async def update_show_budget(
    show_id: int,
    budget_data: BudgetUpdate,
    user=Depends(get_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Updates or creates the Labor budget for a specific show."""
    try:
        upsert_payload = {
            "show_id": show_id,
            "name": "Labor",
            "allocated_amount": budget_data.allocated_amount
        }
        res = supabase.table('budgets').upsert(upsert_payload, on_conflict='show_id,name').execute()
        if res.data:
            return res.data[0]
        raise HTTPException(status_code=500, detail="Failed to save budget.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
