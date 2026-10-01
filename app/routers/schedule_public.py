import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from supabase import Client

from app.api import get_service_client
from app.schemas.schedule import AvailabilityRespondRequest, DateStatus, PublicAvailabilityDetail, ShiftInput
from app.services.roster_shared import get_display_first_last

router = APIRouter()

FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://showready.k-p.video")


def _load_response(supabase: Client, token: str) -> dict:
    res = supabase.table('availability_responses').select(
        '*, roster(first_name, last_name, preferred_first_name, preferred_last_name), shows(name), availability_calls(name)'
    ).eq('invite_token', token).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="This link is invalid.")
    return res.data[0]


def _detail_for(supabase: Client, response_row: dict) -> PublicAvailabilityDetail:
    shifts_res = supabase.table('availability_call_shifts').select('id, shift_date, call_time, end_time, notes').eq('call_id', response_row['call_id']).order('shift_date').execute()
    shift_rows = shifts_res.data or []
    shifts = [ShiftInput(**{k: v for k, v in row.items() if k != 'id'}) for row in shift_rows]

    date_statuses = []
    if shift_rows:
        dates_res = supabase.table('availability_response_dates').select('call_shift_id, status').eq('response_id', response_row['id']).execute()
        status_by_shift_id = {row['call_shift_id']: row['status'] for row in (dates_res.data or [])}
        date_statuses = [
            DateStatus(shift_date=row['shift_date'], status=status_by_shift_id.get(row['id'], 'pending'))
            for row in shift_rows
        ]

    roster = response_row.get('roster') or {}
    shows = response_row.get('shows') or {}
    call = response_row.get('availability_calls') or {}
    return PublicAvailabilityDetail(
        show_name=shows.get('name', ''),
        call_name=call.get('name'),
        first_name=get_display_first_last(roster)[0],
        shifts=shifts,
        date_statuses=date_statuses,
        status=response_row.get('status') or 'pending',
        responded_at=response_row.get('responded_at'),
    )


@router.get("/availability/{token}", response_model=PublicAvailabilityDetail, tags=["Schedule (Public)"])
async def get_public_availability(token: str):
    """Unauthenticated lookup, used by the picker/confirmation page the email links land on."""
    supabase = get_service_client()
    response_row = _load_response(supabase, token)
    return _detail_for(supabase, response_row)


@router.get("/availability/{token}/accept", tags=["Schedule (Public)"])
async def accept_public_availability(token: str):
    """The email's Accept button — no state change here. It just sends them to the
    picker page, where they choose which of the candidate dates they can actually work."""
    return RedirectResponse(url=f"{FRONTEND_URL}/invite/{token}")


@router.get("/availability/{token}/decline", tags=["Schedule (Public)"])
async def decline_public_availability(token: str):
    """One-click decline, meant to be the literal href of the email's Decline button —
    no intermediate page. Declines every candidate date at once."""
    supabase = get_service_client()
    try:
        response_row = _load_response(supabase, token)
        if (response_row.get('status') or 'pending') == 'pending':
            now_iso = datetime.now(timezone.utc).isoformat()
            supabase.table('availability_responses').update({
                'status': 'declined',
                'responded_at': now_iso,
                # A reply that arrives after the row was cleared out brings it back rather than vanishing.
                'dismissed_at': None,
            }).eq('id', response_row['id']).execute()
            supabase.table('availability_response_dates').update({
                'status': 'unavailable',
                'responded_at': now_iso,
            }).eq('response_id', response_row['id']).execute()
    except HTTPException:
        pass  # Invalid token — fall through and let the landing page show its own error state.
    return RedirectResponse(url=f"{FRONTEND_URL}/invite/{token}")


@router.post("/availability/{token}/respond", response_model=PublicAvailabilityDetail, tags=["Schedule (Public)"])
async def respond_public_availability(token: str, data: AvailabilityRespondRequest):
    """The picker page's submit — records a yes/no per candidate date and rolls
    that up into the response's overall status (available if any date is a yes)."""
    supabase = get_service_client()
    response_row = _load_response(supabase, token)

    shift_rows = supabase.table('availability_call_shifts').select('id, shift_date').eq('call_id', response_row['call_id']).execute().data or []
    shift_id_by_date = {row['shift_date']: row['id'] for row in shift_rows}

    now_iso = datetime.now(timezone.utc).isoformat()
    any_available = False
    for entry in data.dates:
        call_shift_id = shift_id_by_date.get(entry.shift_date.isoformat())
        if not call_shift_id:
            continue
        if entry.available:
            any_available = True
        supabase.table('availability_response_dates').update({
            'status': 'available' if entry.available else 'unavailable',
            'responded_at': now_iso,
        }).eq('response_id', response_row['id']).eq('call_shift_id', call_shift_id).execute()

    supabase.table('availability_responses').update({
        'status': 'available' if any_available else 'declined',
        'responded_at': now_iso,
        'dismissed_at': None,
    }).eq('id', response_row['id']).execute()

    response_row = _load_response(supabase, token)
    return _detail_for(supabase, response_row)
