import os
import secrets
import uuid
from datetime import date, datetime, timezone
from typing import List, Optional, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from supabase import Client

from app.api import get_supabase_client, get_user, feature_check
from app.routers.hours import DEFAULT_BREAK_RULES, compute_shift_paid_hours
from app.schemas.schedule import (
    AvailabilityCallCreate, AvailabilityResponseOut,
    AvailabilityStatusUpdate, AvailabilityDismissRequest, ManualAvailabilityCreate,
    ScheduleDateCreate, ScheduleDateOut, ShiftStatusUpdate,
    ShiftCreate, ShiftEditInput, ShiftPositionInput, ShiftPositionEdit,
    AssignmentOverrideUpdate, ShiftPositionsAssignRequest, BoardAssignRequest,
)
from app.services.schedule_shared import flatten_nested_assignment
from app.services.roster_shared import get_display_first_last

STATUS_TO_DATE_STATUS = {'available': 'available', 'declined': 'unavailable', 'pending': 'pending'}
from app.user_email import SMTPSettings, send_email_with_user_smtp
from app.email_utils import format_shift_schedule_html, _format_shift_date_label, _format_shift_time_label

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

        disp_first, disp_last = get_display_first_last(recipient)
        data_source = {**dict(recipient), 'first_name': disp_first, 'last_name': disp_last}
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
        '*, roster(first_name, last_name, preferred_first_name, preferred_last_name, email, position), availability_calls(name)'
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
            'preferred_first_name': roster.get('preferred_first_name'),
            'preferred_last_name': roster.get('preferred_last_name'),
            'email': roster.get('email'),
            'position': roster.get('position'),
            'status': r['status'],
            'responded_at': r.get('responded_at'),
            'show_crew_id': r.get('show_crew_id'),
            'shifts': shifts_by_call.get(r['call_id'], []),
            'date_statuses': sorted(date_statuses_by_response.get(r['id'], []), key=lambda d: d['shift_date']),
        })
    return result


def _build_shifts_response(supabase: Client, shifts: List[dict]) -> List[dict]:
    """Assembles the shift-board shape for a list of show_shifts rows: each shift's position
    lines, and each position's fill count + who's filling it. A show_crew row that's declined
    or been cancelled off the whole show doesn't still read as occupying a slot, even if its
    per-shift assignment row was never cleaned up."""
    if not shifts:
        return []
    shift_ids = [s['id'] for s in shifts]
    positions = supabase.table('show_shift_positions').select('*').in_('shift_id', shift_ids).order('position').execute().data or []
    position_ids = [p['id'] for p in positions]

    assignments_by_position = {}
    if position_ids:
        assignments = supabase.table('show_crew_shifts').select(
            '*, show_crew:show_crew(id, position, status, roster(id, first_name, last_name, preferred_first_name, preferred_last_name, email))'
        ).in_('shift_position_id', position_ids).execute().data or []
        for a in assignments:
            crew = a.get('show_crew') or {}
            if crew.get('status') in ('declined', 'cancelled'):
                continue
            assignments_by_position.setdefault(a['shift_position_id'], []).append({
                'id': a['id'],
                'show_crew_id': a['show_crew_id'],
                'status': a['status'],
                'call_time': a.get('call_time'),
                'end_time': a.get('end_time'),
                'notes': a.get('notes'),
                'roster': crew.get('roster'),
                'position_label': crew.get('position'),
            })

    positions_by_shift = {}
    for p in positions:
        rows = assignments_by_position.get(p['id'], [])
        filled = [r for r in rows if r['status'] != 'cancelled']
        positions_by_shift.setdefault(p['shift_id'], []).append({
            'id': p['id'],
            'position': p['position'],
            'required_count': p['required_count'],
            'filled_count': len(filled),
            'assignments': rows,
        })

    return [
        {
            'id': s['id'],
            'show_id': s['show_id'],
            'shift_date': s['shift_date'],
            'call_time': s.get('call_time'),
            'end_time': s.get('end_time'),
            'label': s.get('label'),
            'notes': s.get('notes'),
            'positions': positions_by_shift.get(s['id'], []),
        }
        for s in shifts
    ]


def _get_show_crew_member(supabase: Client, show_crew_id: str) -> dict:
    """Fetches one show_crew row with its shifts flattened the same way
    roster.py's get_show_crew does — see app/services/schedule_shared.py."""
    res = supabase.table('show_crew').select(
        '*, roster(*), shifts:show_crew_shifts(*, shift:show_shifts(shift_date, call_time, end_time, label, notes))'
    ).eq('id', show_crew_id).single().execute()
    row = res.data
    row['shifts'] = [flatten_nested_assignment(s) for s in (row.get('shifts') or [])]
    return row


def _assign_crew_and_notify(
    supabase: Client, user, show_id: int, roster: dict, show: dict,
    shift_position_ids: List[uuid.UUID], position: Optional[str],
    rate_type: Optional[str], hourly_rate: Optional[float], daily_rate: Optional[float],
    template_id, notify: bool = True,
) -> dict:
    """Shared tail of assign_from_pool, assign_roster_member, and assign_to_position below:
    create or update the show_crew row for (show_id, roster_id), fill the given shift
    positions (refusing any that are already at capacity), best-effort email the CREW
    confirmation (skipped entirely when notify=False — e.g. building out a whole schedule
    silently, then sending everyone's confirmation in one batch later from the Crew tab),
    and return the full member record."""
    if not shift_position_ids:
        raise HTTPException(status_code=400, detail="Select at least one shift position to assign.")

    position_ids = [str(pid) for pid in shift_position_ids]
    positions_res = supabase.table('show_shift_positions').select(
        'id, position, required_count, shift:show_shifts(id, show_id, shift_date, call_time, end_time, label, notes)'
    ).in_('id', position_ids).execute()
    positions = positions_res.data or []
    if len(positions) != len(position_ids):
        raise HTTPException(status_code=404, detail="One or more shift positions were not found.")
    for p in positions:
        if not p.get('shift') or p['shift']['show_id'] != show_id:
            raise HTTPException(status_code=400, detail="That shift position doesn't belong to this show.")

    roster_id = roster['id']
    now_iso = datetime.now(timezone.utc).isoformat()
    existing_res = supabase.table('show_crew').select('id, status').eq('show_id', show_id).eq('roster_id', roster_id).order('created_at').execute()

    rate_fields = {
        'position': position,
        'rate_type': rate_type,
        'hourly_rate': hourly_rate,
        'daily_rate': daily_rate,
    }

    if existing_res.data:
        # Already on this show's crew: fill the new positions on their existing assignment
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
    show_crew_id = show_crew['id']

    # Capacity check, excluding this person's own existing assignment (so re-assigning them
    # to a position they already fill is a no-op, not a false "full" error).
    fill_res = supabase.table('show_crew_shifts').select('shift_position_id, show_crew_id, status') \
        .in_('shift_position_id', position_ids).neq('status', 'cancelled').execute()
    filled_by_position = {}
    for row in (fill_res.data or []):
        if row['show_crew_id'] == show_crew_id:
            continue
        filled_by_position[row['shift_position_id']] = filled_by_position.get(row['shift_position_id'], 0) + 1

    for p in positions:
        filled = filled_by_position.get(p['id'], 0)
        if filled >= p['required_count']:
            raise HTTPException(status_code=409, detail=f"\"{p['position']}\" is already fully staffed ({filled}/{p['required_count']}).")

    shift_rows = [
        {
            'show_crew_id': show_crew_id,
            'shift_id': p['shift']['id'],
            'shift_position_id': p['id'],
        } for p in positions
    ]
    supabase.table('show_crew_shifts').upsert(shift_rows, on_conflict='show_crew_id,shift_id').execute()

    # Notify with the caller's chosen "Crew Assignment" template (or the account default when
    # none was picked) — best-effort; a missing SMTP/template setup shouldn't undo an
    # assignment that already succeeded.
    if notify and roster.get('email'):
        try:
            smtp_settings = _get_smtp_settings(supabase, str(user.id))
            template = _get_template(supabase, str(user.id), 'CREW', template_id)
            show_info = (show.get('data') or {}).get('info', {})

            disp_first, disp_last = get_display_first_last(roster)
            data_source = {**dict(roster), 'first_name': disp_first, 'last_name': disp_last}
            data_source['showName'] = show.get('name', '')
            data_source['venue'] = show_info.get('venue_details', '')
            email_shift_rows = [
                {
                    'shift_date': p['shift']['shift_date'],
                    'call_time': p['shift']['call_time'],
                    'end_time': p['shift']['end_time'],
                    'notes': p['shift']['notes'],
                } for p in positions
            ]
            # {{schedule}} keeps each date's notes right under that date; {{callTime}}/{{notes}}
            # stay populated too (flattened, dates-only / notes-only) for older templates
            # written before {{schedule}} existed.
            data_source['schedule'] = format_shift_schedule_html(email_shift_rows)
            data_source['callTime'] = "; ".join(
                _format_shift_date_label(row['shift_date']) + (
                    f" — {_format_shift_time_label(row['call_time'])}"
                    + (f" – {_format_shift_time_label(row['end_time'])}" if row['end_time'] else "")
                    if row['call_time'] else ""
                )
                for row in email_shift_rows
            )
            data_source['notes'] = "; ".join(row['notes'] for row in email_shift_rows if row.get('notes'))
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

    return _get_show_crew_member(supabase, show_crew_id)


@router.post("/availability/{response_id}/assign", tags=["Schedule"])
async def assign_from_pool(response_id: str, data: ShiftPositionsAssignRequest, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Promotes someone out of the availability pool into a real, confirmed show_crew
    assignment, filling the chosen (already-existing) shift positions."""
    response_res = supabase.table('availability_responses').select('*, roster(*), shows(id, name, data)').eq('id', response_id).single().execute()
    if not response_res.data:
        raise HTTPException(status_code=404, detail="Availability response not found.")
    response_row = response_res.data
    roster = response_row.get('roster') or {}
    show = response_row.get('shows') or {}
    show_id = response_row['show_id']

    member = _assign_crew_and_notify(
        supabase, user, show_id, roster, show, data.shift_position_ids,
        data.position, data.rate_type, data.hourly_rate, data.daily_rate, data.template_id,
        notify=data.notify,
    )
    supabase.table('availability_responses').update({'show_crew_id': member['id']}).eq('id', response_id).execute()
    return member


@router.post("/shows/{show_id}/crew/{roster_id}/assign", tags=["Schedule"])
async def assign_roster_member(show_id: int, roster_id: uuid.UUID, data: ShiftPositionsAssignRequest, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Directly assigns a roster member into one or more of a show's (already-existing) open
    shift positions and emails them the confirmation — e.g. dragging a name straight from the
    account-wide Roster onto an open slot in the global Scheduling grid, with no
    availability-call response involved (that's assign_from_pool, above). Shares its
    crew-assignment/notify logic."""
    show_res = supabase.table('shows').select('id, name, data').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found.")
    show = show_res.data

    roster_res = supabase.table('roster').select('*').eq('id', str(roster_id)).execute()
    if not roster_res.data:
        raise HTTPException(status_code=404, detail="Roster member not found.")
    roster = roster_res.data[0]
    if roster.get('erased_at'):
        raise HTTPException(status_code=400, detail="This roster member's personal data has been erased.")

    return _assign_crew_and_notify(
        supabase, user, show_id, roster, show, data.shift_position_ids,
        data.position, data.rate_type, data.hourly_rate, data.daily_rate, data.template_id,
        notify=data.notify,
    )


@router.post("/shifts/{shift_id}/positions/{position_id}/assign", tags=["Schedule"])
async def assign_to_position(shift_id: uuid.UUID, position_id: uuid.UUID, data: BoardAssignRequest, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """The shift board's per-position 'assign' action: picks one roster member straight into
    this one open slot. Shares its crew-assignment/notify logic with assign_from_pool and
    assign_roster_member above."""
    shift_res = supabase.table('show_shifts').select('show_id').eq('id', str(shift_id)).single().execute()
    if not shift_res.data:
        raise HTTPException(status_code=404, detail="Shift not found.")
    show_id = shift_res.data['show_id']

    show_res = supabase.table('shows').select('id, name, data').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found.")
    show = show_res.data

    roster_res = supabase.table('roster').select('*').eq('id', str(data.roster_id)).execute()
    if not roster_res.data:
        raise HTTPException(status_code=404, detail="Roster member not found.")
    roster = roster_res.data[0]
    if roster.get('erased_at'):
        raise HTTPException(status_code=400, detail="This roster member's personal data has been erased.")

    return _assign_crew_and_notify(
        supabase, user, show_id, roster, show, [position_id],
        data.position, data.rate_type, data.hourly_rate, data.daily_rate, data.template_id,
        notify=data.notify,
    )


def _sync_timesheet_entry_to_shift(supabase: Client, show_id: int, show_crew_id: str, shift_date: date, call_time, end_time) -> None:
    """Keeps an already-saved hours-tracker entry for this (crew, date) in sync
    with a shift's effective (override-or-default) call/end time. A date with no saved entry
    is left alone — it's still live-autofilled from shift data whenever the timesheet is read
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
        .eq('date', shift_date.isoformat() if isinstance(shift_date, date) else shift_date) \
        .execute()


@router.get("/shows/{show_id}/shifts", tags=["Schedule"])
def list_shifts(show_id: int, start: Optional[date] = None, end: Optional[date] = None, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """The show's shift board: every shift in [start, end] (or all, if omitted) with its
    position lines and who's filling each one. Sync def — same "hot read" reasoning as the
    other fan-out endpoints in api.py/schedule.py: this reads across shifts/positions/
    assignments in one request rather than blocking the event loop per table."""
    query = supabase.table('show_shifts').select('*').eq('show_id', show_id).order('shift_date')
    if start:
        query = query.gte('shift_date', start.isoformat())
    if end:
        query = query.lte('shift_date', end.isoformat())
    shifts = query.execute().data or []
    return _build_shifts_response(supabase, shifts)


@router.post("/shows/{show_id}/shifts", tags=["Schedule"])
async def create_shift(show_id: int, data: ShiftCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a shift (a date + optional call/end time and label) and its position
    headcounts in one call — the starting point for staffing, instead of the old
    assign-a-person-straight-to-a-date flow."""
    shift_res = supabase.table('show_shifts').insert({
        'show_id': show_id,
        'shift_date': data.shift_date.isoformat(),
        'call_time': data.call_time.isoformat() if data.call_time else None,
        'end_time': data.end_time.isoformat() if data.end_time else None,
        'label': data.label,
        'notes': data.notes,
    }).execute()
    if not shift_res.data:
        raise HTTPException(status_code=500, detail="Failed to create shift.")
    shift = shift_res.data[0]

    if data.positions:
        supabase.table('show_shift_positions').insert([
            {'shift_id': shift['id'], 'position': p.position, 'required_count': p.required_count}
            for p in data.positions
        ]).execute()

    return _build_shifts_response(supabase, [shift])[0]


@router.put("/shifts/{shift_id}", tags=["Schedule"])
async def update_shift(shift_id: uuid.UUID, data: ShiftEditInput, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Edits a shift's own date/call/end time/label/notes. Doesn't touch its positions or
    who's assigned — see the /positions endpoints below for that."""
    update_data = data.model_dump(exclude_unset=True)
    for field in ('shift_date', 'call_time', 'end_time'):
        if update_data.get(field) is not None:
            update_data[field] = update_data[field].isoformat()
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update.")
    res = supabase.table('show_shifts').update(update_data).eq('id', str(shift_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Shift not found.")
    return _build_shifts_response(supabase, [res.data[0]])[0]


@router.delete("/shifts/{shift_id}", status_code=204, tags=["Schedule"])
async def delete_shift(shift_id: uuid.UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Deletes a shift and, via cascade, its position lines and everyone's assignment to
    them. Also clears any hours-tracker entries those assignments had autofilled."""
    shift_res = supabase.table('show_shifts').select('shift_date').eq('id', str(shift_id)).single().execute()
    if not shift_res.data:
        raise HTTPException(status_code=404, detail="Shift not found.")
    shift_date_str = shift_res.data['shift_date']

    assignments_res = supabase.table('show_crew_shifts').select('show_crew_id').eq('shift_id', str(shift_id)).execute()
    show_crew_ids = [a['show_crew_id'] for a in (assignments_res.data or [])]
    if show_crew_ids:
        supabase.table('timesheet_entries').delete().in_('show_crew_id', show_crew_ids).eq('date', shift_date_str).execute()

    supabase.table('show_shifts').delete().eq('id', str(shift_id)).execute()
    return


@router.post("/shifts/{shift_id}/positions", tags=["Schedule"])
async def add_shift_position(shift_id: uuid.UUID, data: ShiftPositionInput, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Adds another position line (e.g. a second "Hands" requirement) to an existing shift."""
    res = supabase.table('show_shift_positions').insert({
        'shift_id': str(shift_id), 'position': data.position, 'required_count': data.required_count,
    }).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to add position.")
    return res.data[0]


@router.put("/shifts/{shift_id}/positions/{position_id}", tags=["Schedule"])
async def update_shift_position(shift_id: uuid.UUID, position_id: uuid.UUID, data: ShiftPositionEdit, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Renames a position or changes its headcount. Lowering required_count below however
    many are already filling it is allowed — it just reads as overfilled (e.g. 5/4) rather
    than being blocked, since the people are already assigned and unassigning them isn't this
    endpoint's job."""
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update.")
    res = supabase.table('show_shift_positions').update(update_data).eq('id', str(position_id)).eq('shift_id', str(shift_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Position not found.")
    return res.data[0]


@router.delete("/shifts/{shift_id}/positions/{position_id}", status_code=204, tags=["Schedule"])
async def delete_shift_position(shift_id: uuid.UUID, position_id: uuid.UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Removes a position line and, via cascade, anyone assigned to it — along with any
    hours-tracker entries those assignments had autofilled."""
    shift_res = supabase.table('show_shifts').select('shift_date').eq('id', str(shift_id)).single().execute()
    shift_date_str = (shift_res.data or {}).get('shift_date')

    assignments_res = supabase.table('show_crew_shifts').select('show_crew_id').eq('shift_position_id', str(position_id)).execute()
    show_crew_ids = [a['show_crew_id'] for a in (assignments_res.data or [])]
    if show_crew_ids and shift_date_str:
        supabase.table('timesheet_entries').delete().in_('show_crew_id', show_crew_ids).eq('date', shift_date_str).execute()

    supabase.table('show_shift_positions').delete().eq('id', str(position_id)).eq('shift_id', str(shift_id)).execute()
    return


@router.put("/shift-assignments/{assignment_id}", tags=["Schedule"])
async def update_shift_assignment(assignment_id: uuid.UUID, data: AssignmentOverrideUpdate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Edits one person's override call/end time or note on a shift they're already assigned
    to (null clears the override back to the shift's own default). Sends no email."""
    assignment_res = supabase.table('show_crew_shifts').select('id, show_crew_id, shift:show_shifts(shift_date, call_time, end_time)').eq('id', str(assignment_id)).single().execute()
    if not assignment_res.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    assignment = assignment_res.data
    shift = assignment.get('shift') or {}

    update_data = {
        'call_time': data.call_time.isoformat() if data.call_time else None,
        'end_time': data.end_time.isoformat() if data.end_time else None,
        'notes': data.notes,
    }
    res = supabase.table('show_crew_shifts').update(update_data).eq('id', str(assignment_id)).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save.")

    crew_res = supabase.table('show_crew').select('show_id').eq('id', assignment['show_crew_id']).single().execute()
    if crew_res.data and shift.get('shift_date'):
        effective_call = update_data['call_time'] or shift.get('call_time')
        effective_end = update_data['end_time'] or shift.get('end_time')
        _sync_timesheet_entry_to_shift(supabase, crew_res.data['show_id'], assignment['show_crew_id'], shift['shift_date'], effective_call, effective_end)

    return res.data[0]


@router.delete("/shift-assignments/{assignment_id}", status_code=204, tags=["Schedule"])
async def delete_shift_assignment(assignment_id: uuid.UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Unassigns someone from a shift, freeing the position slot. Also clears any
    hours-tracker entry that shift had autofilled for them."""
    res = supabase.table('show_crew_shifts').select('show_crew_id, shift:show_shifts(shift_date)').eq('id', str(assignment_id)).execute()
    if res.data:
        shift_date_str = (res.data[0].get('shift') or {}).get('shift_date')
        if shift_date_str:
            supabase.table('timesheet_entries').delete().eq('show_crew_id', res.data[0]['show_crew_id']).eq('date', shift_date_str).execute()
    supabase.table('show_crew_shifts').delete().eq('id', str(assignment_id)).execute()
    return


@router.put("/shift-assignments/{assignment_id}/status", tags=["Schedule"])
async def update_shift_assignment_status(assignment_id: uuid.UUID, data: ShiftStatusUpdate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Marks attendance (scheduled/no_show/cancelled) for one assignment — deliberately
    separate from update_shift_assignment above: attendance is a per-shift outcome, not a
    property of the call-time/notes override."""
    res = supabase.table('show_crew_shifts').update({'status': data.status}).eq('id', str(assignment_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    return res.data[0]


@router.get("/schedule/global", tags=["Schedule"])
def get_global_schedule(user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Account-wide Scheduling view: every non-archived show's shift board and planning
    dates in one call instead of one round trip per show. RLS on shows/show_collaborators
    already scopes the show list to what this caller can see. Sync def (not async) — same
    reasoning as the other hot read endpoints in api.py: this fans out to several tables
    across every show, so it runs in the threadpool instead of blocking the event loop."""
    shows_res = supabase.table('shows').select('id, name, user_id, status').neq('status', 'archived').order('name').execute()
    shows = shows_res.data or []
    if not shows:
        return []
    show_ids = [s['id'] for s in shows]

    collab_res = supabase.table('show_collaborators').select('show_id, role').in_('show_id', show_ids).eq('user_id', str(user.id)).execute()
    role_by_show = {row['show_id']: row['role'] for row in (collab_res.data or [])}

    all_shifts_res = supabase.table('show_shifts').select('*').in_('show_id', show_ids).order('shift_date').execute()
    built_shifts = _build_shifts_response(supabase, all_shifts_res.data or [])
    shifts_by_show = {}
    for shift in built_shifts:
        shifts_by_show.setdefault(shift['show_id'], []).append(shift)

    dates_res = supabase.table('show_schedule_dates').select('show_id, shift_date, notes').in_('show_id', show_ids).order('shift_date').execute()
    dates_by_show = {}
    for row in (dates_res.data or []):
        dates_by_show.setdefault(row['show_id'], []).append({'shift_date': row['shift_date'], 'notes': row['notes']})

    return [
        {
            'show_id': s['id'],
            'show_name': s['name'],
            # Same rule as _get_current_user_role in api.py: creator is always owner even
            # if their show_collaborators row hasn't been self-healed yet; everyone else
            # falls back to 'viewer' (least-privileged) if no row is found.
            'current_user_role': 'owner' if str(s['user_id']) == str(user.id) else role_by_show.get(s['id'], 'viewer'),
            'shifts': shifts_by_show.get(s['id'], []),
            'schedule_dates': dates_by_show.get(s['id'], []),
        }
        for s in shows
    ]


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
    roster_res = supabase.table('roster').select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, position, erased_at').eq('id', str(data.roster_id)).execute()
    if not roster_res.data:
        raise HTTPException(status_code=404, detail="Roster member not found.")
    roster = roster_res.data[0]
    if roster.get('erased_at'):
        raise HTTPException(status_code=400, detail="This roster member's personal data has been erased.")

    already = supabase.table('availability_responses').select('id').eq('show_id', show_id).eq('roster_id', str(data.roster_id))         .eq('status', 'available').is_('show_crew_id', 'null').is_('dismissed_at', 'null').execute()
    if already.data:
        raise HTTPException(status_code=409, detail="They're already in the available list for this show.")

    now_iso = datetime.now(timezone.utc).isoformat()
    disp_first, disp_last = get_display_first_last(roster)
    name = f"Added manually — {disp_first} {disp_last}".strip()
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
        'preferred_first_name': roster.get('preferred_first_name'),
        'preferred_last_name': roster.get('preferred_last_name'),
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
