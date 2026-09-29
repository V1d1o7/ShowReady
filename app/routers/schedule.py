import os
import secrets
from datetime import date, datetime, timezone
from typing import List, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from supabase import Client

from app.api import get_supabase_client, get_user, feature_check
from app.routers.hours import DEFAULT_BREAK_RULES, compute_shift_paid_hours
from app.schemas.schedule import (
    AvailabilityCallCreate, AssignFromPoolRequest, AvailabilityResponseOut, ShiftUpdate,
    AvailabilityStatusUpdate, AvailabilityDismissRequest, ManualAvailabilityCreate,
    ScheduleDateCreate, ScheduleDateOut, ShiftStatusUpdate,
)

STATUS_TO_DATE_STATUS = {'available': 'available', 'declined': 'unavailable', 'pending': 'pending'}
from app.user_email import SMTPSettings, send_email_with_user_smtp
from app.email_utils import format_shift_schedule_html

router = APIRouter(dependencies=[Depends(feature_check("schedule"))])

FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://showready.k-p.video")


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


def _get_smtp_settings(supabase: Client, user_id: str) -> SMTPSettings:
    smtp_res = supabase.table('user_smtp_settings').select('*').eq('user_id', user_id).single().execute()
    if not smtp_res.data:
        raise HTTPException(status_code=400, detail="SMTP settings not configured. Please go to User Settings to configure them.")
    return SMTPSettings(**smtp_res.data)


def _get_default_template(supabase: Client, user_id: str, category: str) -> dict:
    res = supabase.table('email_templates').select('*').eq('user_id', user_id).eq('category', category).execute()
    templates = res.data or []
    default = next((t for t in templates if t.get('is_default')), None) or (templates[0] if templates else None)
    if not default:
        raise HTTPException(status_code=400, detail=f"No '{category}' email template found. Set one up under Communications.")
    return default


def _get_template(supabase: Client, user_id: str, category: str, template_id) -> dict:
    """Uses the caller's chosen template for this one send when given; otherwise falls back
    to the account's default for the category, same as before templates were selectable."""
    if template_id:
        res = supabase.table('email_templates').select('*').eq('id', str(template_id)).eq('user_id', user_id).eq('category', category).maybe_single().execute()
        if res.data:
            return res.data
    return _get_default_template(supabase, user_id, category)


def _substitute(subject: str, body: str, data_source: dict) -> Tuple[str, str]:
    for key, value in data_source.items():
        if not isinstance(value, str):
            continue
        if key == 'first_name':
            body = body.replace("{{firstName}}", value)
            subject = subject.replace("{{firstName}}", value)
        elif key == 'last_name':
            body = body.replace("{{lastName}}", value)
            subject = subject.replace("{{lastName}}", value)
        else:
            placeholder = "{{" + key + "}}"
            body = body.replace(placeholder, value)
            subject = subject.replace(placeholder, value)
    return subject, body


def _format_time_range(call_time, end_time) -> str:
    if not call_time:
        return ""
    start = call_time.strftime('%-I:%M %p')
    if end_time:
        return f"{start} – {end_time.strftime('%-I:%M %p')}"
    return start


def _wrap_html(body: str) -> str:
    if "<html" in body.lower():
        return body
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>body {{ margin:0; padding:0; width:100% !important; background-color:#111827; color:#F9FAFB; }} table {{ border-collapse: collapse; }}</style></head>
<body style="margin:0; padding:0; width:100% !important; background-color:#111827; color:#F9FAFB;">{body}</body></html>"""


def _send_queued_emails(smtp_settings: SMTPSettings, messages: List[dict]) -> None:
    """Runs after the response is already back with the caller — each message is its own
    SMTP connection/send, so one bad address or a slow server can't hold up the request,
    and one failure doesn't stop the rest of the batch from going out."""
    for message in messages:
        try:
            send_email_with_user_smtp(
                smtp_settings=smtp_settings,
                recipient_emails=[message['target_email']],
                subject=message['subject'],
                html_body=message['html_body'],
            )
        except Exception as e:
            print(f"Failed to send availability-call email to {message['target_email']}: {e}")


@router.post("/shows/{show_id}/availability-calls", tags=["Schedule"])
async def create_availability_call(show_id: int, data: AvailabilityCallCreate, background_tasks: BackgroundTasks, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Emails a set of roster members asking about availability for a show, tracking each response individually.
    The actual SMTP sends happen after the response goes out, so the request returns as soon as
    the responses/tokens are recorded rather than waiting on one email-per-recipient loop."""
    show_res = supabase.table('shows').select('id, name').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found.")

    if not data.roster_ids:
        raise HTTPException(status_code=400, detail="Select at least one recipient.")

    roster_res = supabase.table('roster').select('*').in_('id', [str(rid) for rid in data.roster_ids]).execute()
    recipients = roster_res.data or []
    if not recipients:
        raise HTTPException(status_code=404, detail="No valid roster members found.")

    smtp_settings = _get_smtp_settings(supabase, str(user.id))

    call_name = data.name or f"Availability Check — {show_res.data['name']}"
    call_res = supabase.table('availability_calls').insert({
        'show_id': show_id,
        'user_id': str(user.id),
        'name': call_name,
    }).execute()
    if not call_res.data:
        raise HTTPException(status_code=500, detail="Failed to create availability call.")
    call = call_res.data[0]

    call_shift_ids = []
    if data.shifts:
        shifts_res = supabase.table('availability_call_shifts').insert([
            {
                'call_id': call['id'],
                'shift_date': shift.shift_date.isoformat(),
                'call_time': shift.call_time.isoformat() if shift.call_time else None,
                'end_time': shift.end_time.isoformat() if shift.end_time else None,
                'notes': shift.notes,
            } for shift in data.shifts
        ]).execute()
        call_shift_ids = [row['id'] for row in (shifts_res.data or [])]

    queued_messages = []
    for recipient in recipients:
        target_email = recipient.get('email')
        if not target_email:
            continue

        token = _generate_token()
        response_res = supabase.table('availability_responses').insert({
            'show_id': show_id,
            'call_id': call['id'],
            'roster_id': recipient['id'],
            'invite_token': token,
        }).execute()
        if response_res.data and call_shift_ids:
            response_id = response_res.data[0]['id']
            supabase.table('availability_response_dates').insert([
                {'response_id': response_id, 'call_shift_id': shift_id} for shift_id in call_shift_ids
            ]).execute()

        data_source = dict(recipient)
        data_source['rosteredEmail'] = target_email
        data_source['acceptLink'] = f"{FRONTEND_URL}/api/public/availability/{token}/accept"
        data_source['declineLink'] = f"{FRONTEND_URL}/api/public/availability/{token}/decline"

        raw_tags = data_source.get('tags', [])
        if isinstance(raw_tags, list):
            public_tags = [
                t for t in raw_tags
                if isinstance(t, str) and not (t.lower().startswith("internal:") or t.lower().startswith("private:") or t.startswith("_"))
            ]
            data_source['tags'] = ", ".join(public_tags)

        subject, body = _substitute(data.subject, data.body, data_source)
        if smtp_settings.from_email:
            body = body.replace("{{replyToEmail}}", smtp_settings.from_email)

        queued_messages.append({
            'target_email': target_email,
            'subject': subject,
            'html_body': _wrap_html(body),
        })

    supabase.table('availability_calls').update({'sent_at': datetime.now(timezone.utc).isoformat()}).eq('id', call['id']).execute()

    background_tasks.add_task(_send_queued_emails, smtp_settings, queued_messages)

    return {"call_id": call['id'], "sent_count": len(queued_messages)}


@router.get("/shows/{show_id}/availability", response_model=List[AvailabilityResponseOut], tags=["Schedule"])
async def get_availability_pool(show_id: int, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """The accumulating, per-show pool of availability responses (pending/available/declined), across every call sent for this show."""
    responses_res = supabase.table('availability_responses').select(
        '*, roster(first_name, last_name, email, position), availability_calls(name)'
    ).eq('show_id', show_id).is_('dismissed_at', 'null').order('created_at', desc=True).execute()
    rows = responses_res.data or []

    call_ids = list({r['call_id'] for r in rows})
    shifts_by_call = {}
    shift_dates_by_id = {}
    if call_ids:
        shifts_res = supabase.table('availability_call_shifts').select('*').in_('call_id', call_ids).order('shift_date').execute()
        for shift in (shifts_res.data or []):
            shifts_by_call.setdefault(shift['call_id'], []).append(shift)
            shift_dates_by_id[shift['id']] = shift['shift_date']

    response_ids = [r['id'] for r in rows]
    date_statuses_by_response = {}
    if response_ids:
        dates_res = supabase.table('availability_response_dates').select('*').in_('response_id', response_ids).execute()
        for row in (dates_res.data or []):
            shift_date = shift_dates_by_id.get(row['call_shift_id'])
            if not shift_date:
                continue
            date_statuses_by_response.setdefault(row['response_id'], []).append({
                'shift_date': shift_date,
                'status': row['status'],
            })

    result = []
    for r in rows:
        roster = r.get('roster') or {}
        call = r.get('availability_calls') or {}
        result.append({
            'id': r['id'],
            'show_id': r['show_id'],
            'call_id': r['call_id'],
            'call_name': call.get('name'),
            'roster_id': r['roster_id'],
            'first_name': roster.get('first_name'),
            'last_name': roster.get('last_name'),
            'email': roster.get('email'),
            'position': roster.get('position'),
            'status': r['status'],
            'responded_at': r.get('responded_at'),
            'show_crew_id': r.get('show_crew_id'),
            'shifts': shifts_by_call.get(r['call_id'], []),
            'date_statuses': sorted(date_statuses_by_response.get(r['id'], []), key=lambda d: d['shift_date']),
        })
    return result


@router.post("/availability/{response_id}/assign", tags=["Schedule"])
async def assign_from_pool(response_id: str, data: AssignFromPoolRequest, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Promotes someone out of the availability pool into a real, confirmed show_crew assignment for the chosen dates."""
    response_res = supabase.table('availability_responses').select('*, roster(*), shows(id, name, data)').eq('id', response_id).single().execute()
    if not response_res.data:
        raise HTTPException(status_code=404, detail="Availability response not found.")
    response_row = response_res.data
    roster = response_row.get('roster') or {}
    show = response_row.get('shows') or {}
    show_id = response_row['show_id']
    roster_id = response_row['roster_id']

    if not data.shifts:
        raise HTTPException(status_code=400, detail="Select at least one date to assign.")

    now_iso = datetime.now(timezone.utc).isoformat()
    existing_res = supabase.table('show_crew').select('id, status').eq('show_id', show_id).eq('roster_id', roster_id).order('created_at').execute()

    rate_fields = {
        'position': data.position,
        'rate_type': data.rate_type,
        'hourly_rate': data.hourly_rate,
        'daily_rate': data.daily_rate,
    }

    if existing_res.data:
        # Already on this show's crew: add the dates to their existing assignment
        # instead of creating a second row. Only re-confirm if they weren't active.
        existing = existing_res.data[0]
        update_data = dict(rate_fields)
        if existing.get('status') in ('pending', 'declined', 'cancelled'):
            update_data.update({'status': 'confirmed', 'responded_at': now_iso})
        crew_res = supabase.table('show_crew').update(update_data).eq('id', existing['id']).execute()
    else:
        crew_res = supabase.table('show_crew').insert({
            'show_id': show_id,
            'roster_id': roster_id,
            **rate_fields,
            'status': 'confirmed',
            'requested_at': now_iso,
            'responded_at': now_iso,
        }).execute()
    if not crew_res.data:
        raise HTTPException(status_code=500, detail="Failed to assign crew member.")
    show_crew = crew_res.data[0]

    shift_rows = [
        {
            'show_crew_id': show_crew['id'],
            'shift_date': shift.shift_date.isoformat(),
            'call_time': shift.call_time.isoformat() if shift.call_time else None,
            'end_time': shift.end_time.isoformat() if shift.end_time else None,
            'notes': shift.notes,
        } for shift in data.shifts
    ]
    supabase.table('show_crew_shifts').upsert(shift_rows, on_conflict='show_crew_id,shift_date').execute()

    supabase.table('availability_responses').update({'show_crew_id': show_crew['id']}).eq('id', response_id).execute()

    # Notify with the caller's chosen "Crew Assignment" template (or the account default when
    # none was picked) — best-effort; a missing SMTP/template setup shouldn't undo an
    # assignment that already succeeded.
    if roster.get('email'):
        try:
            smtp_settings = _get_smtp_settings(supabase, str(user.id))
            template = _get_template(supabase, str(user.id), 'CREW', data.template_id)
            show_info = (show.get('data') or {}).get('info', {})

            data_source = dict(roster)
            data_source['showName'] = show.get('name', '')
            data_source['venue'] = show_info.get('venue_details', '')
            # {{schedule}} keeps each date's notes right under that date; {{callTime}}/{{notes}}
            # stay populated too (flattened, dates-only / notes-only) for older templates
            # written before {{schedule}} existed.
            data_source['schedule'] = format_shift_schedule_html(shift_rows)
            data_source['callTime'] = "; ".join(
                shift.shift_date.strftime('%a, %b %-d') + (
                    f" — {_format_time_range(shift.call_time, shift.end_time)}" if shift.call_time else ""
                )
                for shift in data.shifts
            )
            data_source['notes'] = "; ".join(shift.notes for shift in data.shifts if shift.notes)
            data_source['rosteredEmail'] = roster['email']

            subject, body = _substitute(template['subject'], template['body'], data_source)
            if smtp_settings.from_email:
                body = body.replace("{{replyToEmail}}", smtp_settings.from_email)

            send_email_with_user_smtp(
                smtp_settings=smtp_settings,
                recipient_emails=[roster['email']],
                subject=subject,
                html_body=_wrap_html(body),
            )
        except Exception as e:
            print(f"Assignment succeeded but notification email failed: {e}")

    member_res = supabase.table('show_crew').select('*, roster(*), shifts:show_crew_shifts(*)').eq('id', show_crew['id']).single().execute()
    return member_res.data


def _sync_timesheet_entry_to_shift(supabase: Client, show_id: int, show_crew_id: str, shift_date: date, call_time, end_time) -> None:
    """Keeps an already-saved hours-tracker entry for this (crew, date) in sync
    with a shift's call/end time. A date with no saved entry is left alone —
    it's still live-autofilled from shift data whenever the timesheet is read
    (see get_timesheet_data), so there's nothing to write until a value is
    actually persisted. Respects schedule_autofill_enabled: when a show has
    turned shift-based autofill off, shift edits shouldn't silently overwrite
    hand-entered timesheet values either.
    """
    show_res = supabase.table('shows').select('data').eq('id', show_id).single().execute()
    info_data = ((show_res.data or {}).get('data') or {}).get('info', {}) or {}
    if not info_data.get('schedule_autofill_enabled', True):
        return

    break_rules = info_data.get('break_rules')
    if break_rules is None:
        break_rules = DEFAULT_BREAK_RULES

    paid_hours = compute_shift_paid_hours(call_time, end_time, break_rules)
    supabase.table('timesheet_entries') \
        .update({'hours': paid_hours}) \
        .eq('show_crew_id', show_crew_id) \
        .eq('date', shift_date.isoformat()) \
        .execute()


@router.put("/schedule/{show_crew_id}/shifts/{shift_date}", tags=["Schedule"])
async def upsert_crew_shift(show_crew_id: str, shift_date: date, data: ShiftUpdate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Adds or edits one dated shift on an existing crew assignment. Sends no email."""
    crew_res = supabase.table('show_crew').select('id, show_id').eq('id', show_crew_id).execute()
    if not crew_res.data:
        raise HTTPException(status_code=404, detail="Crew assignment not found.")

    shift_res = supabase.table('show_crew_shifts').upsert({
        'show_crew_id': show_crew_id,
        'shift_date': shift_date.isoformat(),
        'call_time': data.call_time.isoformat() if data.call_time else None,
        'end_time': data.end_time.isoformat() if data.end_time else None,
        'notes': data.notes,
    }, on_conflict='show_crew_id,shift_date').execute()
    if not shift_res.data:
        raise HTTPException(status_code=500, detail="Failed to save shift.")

    _sync_timesheet_entry_to_shift(supabase, crew_res.data[0]['show_id'], show_crew_id, shift_date, data.call_time, data.end_time)

    return shift_res.data[0]


@router.delete("/schedule/{show_crew_id}/shifts/{shift_date}", status_code=204, tags=["Schedule"])
async def delete_crew_shift(show_crew_id: str, shift_date: date, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Removes one dated shift from a crew assignment, and clears any hours-tracker entry for that date."""
    supabase.table('show_crew_shifts').delete().eq('show_crew_id', show_crew_id).eq('shift_date', shift_date.isoformat()).execute()
    supabase.table('timesheet_entries').delete().eq('show_crew_id', show_crew_id).eq('date', shift_date.isoformat()).execute()
    return


@router.put("/schedule/{show_crew_id}/shifts/{shift_date}/status", tags=["Schedule"])
async def update_crew_shift_status(show_crew_id: str, shift_date: date, data: ShiftStatusUpdate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Marks attendance (scheduled/completed/no_show/cancelled) for one specific dated shift —
    deliberately separate from upsert_crew_shift above: attendance is a per-date outcome, not a
    property of the call-time/notes edit, and a plain UPDATE here (vs. an upsert) means marking
    attendance on a shift that doesn't exist yet is a no-op 404 rather than silently creating one."""
    shift_res = supabase.table('show_crew_shifts') \
        .update({'status': data.status}) \
        .eq('show_crew_id', show_crew_id) \
        .eq('shift_date', shift_date.isoformat()) \
        .execute()
    if not shift_res.data:
        raise HTTPException(status_code=404, detail="Shift not found.")
    return shift_res.data[0]


@router.get("/shows/{show_id}/schedule-dates", response_model=List[ScheduleDateOut], tags=["Schedule"])
async def list_schedule_dates(show_id: int, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """The show's persisted 'blank' planning days — dates on the calendar with nobody assigned yet."""
    res = supabase.table('show_schedule_dates').select('shift_date, notes').eq('show_id', show_id).order('shift_date').execute()
    return res.data or []


@router.post("/shows/{show_id}/schedule-dates", response_model=ScheduleDateOut, tags=["Schedule"])
async def add_schedule_date(show_id: int, data: ScheduleDateCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Pins a day onto the schedule for planning, even with nobody assigned to it yet."""
    res = supabase.table('show_schedule_dates').upsert({
        'show_id': show_id,
        'shift_date': data.shift_date.isoformat(),
        'notes': data.notes,
    }, on_conflict='show_id,shift_date').execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to add date.")
    return res.data[0]


@router.delete("/shows/{show_id}/schedule-dates/{shift_date}", status_code=204, tags=["Schedule"])
async def delete_schedule_date(show_id: int, shift_date: date, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Unpins a planning day. Doesn't touch any crew shifts — if people are still
    assigned that day, it stays on the calendar because of their shifts."""
    supabase.table('show_schedule_dates').delete().eq('show_id', show_id).eq('shift_date', shift_date.isoformat()).execute()
    return


@router.patch("/availability/{response_id}", tags=["Schedule"])
async def update_availability_status(response_id: str, data: AvailabilityStatusUpdate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Manually sets a response's status, e.g. someone replied by text instead of using the email buttons."""
    res = supabase.table('availability_responses').update({
        'status': data.status,
        'responded_at': None if data.status == 'pending' else datetime.now(timezone.utc).isoformat(),
    }).eq('id', response_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Availability response not found.")

    # A manual override (e.g. "they said yes by text") applies to every date in
    # the call, same as the one-click Decline link does — there's no per-date
    # info to preserve when staff are the ones setting it.
    supabase.table('availability_response_dates').update({
        'status': STATUS_TO_DATE_STATUS[data.status],
        'responded_at': None if data.status == 'pending' else datetime.now(timezone.utc).isoformat(),
    }).eq('response_id', response_id).execute()

    return {"id": res.data[0]['id'], "status": res.data[0]['status']}


@router.post("/shows/{show_id}/availability/dismiss", tags=["Schedule"])
async def dismiss_availability(show_id: int, data: AvailabilityDismissRequest, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Hides (or restores, with dismissed=false) responses from the show's list. Nothing is deleted."""
    if not data.ids:
        return {"updated": 0}
    res = supabase.table('availability_responses').update({
        'dismissed_at': datetime.now(timezone.utc).isoformat() if data.dismissed else None,
    }).eq('show_id', show_id).in_('id', [str(i) for i in data.ids]).execute()
    return {"updated": len(res.data or [])}


@router.post("/shows/{show_id}/availability/manual", response_model=AvailabilityResponseOut, tags=["Schedule"])
async def add_to_availability_pool(show_id: int, data: ManualAvailabilityCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Adds someone to the list as already available, without sending an email."""
    roster_res = supabase.table('roster').select('id, first_name, last_name, email, position, erased_at').eq('id', str(data.roster_id)).execute()
    if not roster_res.data:
        raise HTTPException(status_code=404, detail="Roster member not found.")
    roster = roster_res.data[0]
    if roster.get('erased_at'):
        raise HTTPException(status_code=400, detail="This roster member's personal data has been erased.")

    already = supabase.table('availability_responses').select('id').eq('show_id', show_id).eq('roster_id', str(data.roster_id))         .eq('status', 'available').is_('show_crew_id', 'null').is_('dismissed_at', 'null').execute()
    if already.data:
        raise HTTPException(status_code=409, detail="They're already in the available list for this show.")

    now_iso = datetime.now(timezone.utc).isoformat()
    name = f"Added manually — {roster.get('first_name') or ''} {roster.get('last_name') or ''}".strip()
    call_res = supabase.table('availability_calls').insert({
        'show_id': show_id,
        'user_id': str(user.id),
        'name': name,
        'sent_at': now_iso,
    }).execute()
    if not call_res.data:
        raise HTTPException(status_code=500, detail="Failed to add to the list.")
    call = call_res.data[0]

    shifts_by_date = {shift.shift_date.isoformat(): shift for shift in data.shifts}
    call_shift_ids = []
    if shifts_by_date:
        shifts_res = supabase.table('availability_call_shifts').insert([
            {
                'call_id': call['id'],
                'shift_date': shift_date,
                'call_time': shift.call_time.isoformat() if shift.call_time else None,
                'end_time': shift.end_time.isoformat() if shift.end_time else None,
                'notes': shift.notes,
            } for shift_date, shift in shifts_by_date.items()
        ]).execute()
        call_shift_ids = [row['id'] for row in (shifts_res.data or [])]

    response_res = supabase.table('availability_responses').insert({
        'show_id': show_id,
        'call_id': call['id'],
        'roster_id': str(data.roster_id),
        'invite_token': _generate_token(),
        'status': 'available',
        'responded_at': now_iso,
    }).execute()
    if not response_res.data:
        raise HTTPException(status_code=500, detail="Failed to add to the list.")
    row = response_res.data[0]

    if call_shift_ids:
        supabase.table('availability_response_dates').insert([
            {'response_id': row['id'], 'call_shift_id': shift_id, 'status': 'available', 'responded_at': now_iso}
            for shift_id in call_shift_ids
        ]).execute()

    return {
        'id': row['id'],
        'show_id': row['show_id'],
        'call_id': row['call_id'],
        'call_name': name,
        'roster_id': row['roster_id'],
        'first_name': roster.get('first_name'),
        'last_name': roster.get('last_name'),
        'email': roster.get('email'),
        'position': roster.get('position'),
        'status': row['status'],
        'responded_at': row.get('responded_at'),
        'show_crew_id': None,
        'shifts': [
            {'shift_date': d, 'call_time': s.call_time, 'end_time': s.end_time, 'notes': s.notes}
            for d, s in shifts_by_date.items()
        ],
        'date_statuses': [{'shift_date': d, 'status': 'available'} for d in shifts_by_date.keys()],
    }
