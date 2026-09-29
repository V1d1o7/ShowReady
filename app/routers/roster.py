from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from app.api import get_supabase_client, get_user, feature_check
from app.models import (
    RosterMember, RosterMemberCreate, RosterMemberDetail, RosterMemberAssignment, RosterMemberStats,
    ShowCrewMember, RosterMemberAndShowCrewCreate, ShowCrewMemberUpdate, ShowCrewMemberCreate,
    RosterCustomFieldDefinition, RosterCustomFieldDefinitionCreate, RosterCustomFieldDefinitionUpdate,
)
import uuid
import re
from datetime import date, datetime, timezone
from typing import List

router = APIRouter()

RESOLVED_SHOW_CREW_STATUSES = {'confirmed', 'declined', 'cancelled', 'completed', 'no_show'}


def _slugify_field_key(label: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '_', label.strip().lower()).strip('_')
    return slug or 'field'

@router.get("/roster", response_model=List[RosterMember], tags=["Roster"], dependencies=[Depends(feature_check("crew"))])
async def get_roster(user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Gets all members of the user's global roster."""
    roster_response = supabase.table('roster').select('*').eq('user_id', str(user.id)).execute()
    if not roster_response.data:
        return []

    roster_members = roster_response.data
    roster_ids = [str(member['id']) for member in roster_members]

    notes_response = supabase.table('notes').select('parent_entity_id').eq('parent_entity_type', 'roster_member').in_('parent_entity_id', roster_ids).execute()
    
    notes_by_roster_id = {note['parent_entity_id'] for note in notes_response.data}

    for member in roster_members:
        member['has_notes'] = str(member['id']) in notes_by_roster_id

    return roster_members

@router.post("/roster", response_model=RosterMember, tags=["Roster"], dependencies=[Depends(feature_check("crew"))])
async def create_roster_member(roster_data: RosterMemberCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new member in the user's global roster."""
    insert_data = roster_data.model_dump()
    insert_data['user_id'] = str(user.id)
    response = supabase.table('roster').insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create roster member.")
    return response.data[0]

@router.get("/roster/{roster_id}", response_model=RosterMemberDetail, tags=["Roster"], dependencies=[Depends(feature_check("crew"))])
def get_roster_member(roster_id: uuid.UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Gets a single roster member's full profile: details, assignment history, and stats."""
    member_res = supabase.table('roster').select('*').eq('id', str(roster_id)).eq('user_id', str(user.id)).execute()
    if not member_res.data:
        raise HTTPException(status_code=404, detail="Roster member not found.")
    member = member_res.data[0]

    notes_res = supabase.table('notes').select('id').eq('parent_entity_type', 'roster_member').eq('parent_entity_id', str(roster_id)).limit(1).execute()
    member['has_notes'] = bool(notes_res.data)

    assignments_res = supabase.table('show_crew').select('*, shows(id, name)').eq('roster_id', str(roster_id)).order('created_at', desc=True).execute()
    assignment_rows = assignments_res.data or []

    shifts_by_show_crew_id = {}
    if assignment_rows:
        shifts_res = supabase.table('show_crew_shifts').select('*').in_('show_crew_id', [row['id'] for row in assignment_rows]).order('shift_date').execute()
        for shift in (shifts_res.data or []):
            shifts_by_show_crew_id.setdefault(shift['show_crew_id'], []).append(shift)

    assignments = [{
        'show_crew_id': row['id'],
        'show_id': row['shows']['id'] if row.get('shows') else row['show_id'],
        'show_name': row['shows']['name'] if row.get('shows') else 'Unknown Show',
        'position': row.get('position'),
        'rate_type': row.get('rate_type'),
        'hourly_rate': row.get('hourly_rate'),
        'daily_rate': row.get('daily_rate'),
        'status': row.get('status') or 'confirmed',
        'requested_at': row.get('requested_at'),
        'responded_at': row.get('responded_at'),
        'shifts': shifts_by_show_crew_id.get(row['id'], []),
    } for row in assignment_rows]

    # Accept/decline history lives mostly in availability_responses, not show_crew:
    # declining an availability call never creates a show_crew row at all (that's the
    # whole point of the pool — only an 'available' response ever gets assigned), so a
    # decline_rate sourced from show_crew alone is structurally always ~0%. Pull the
    # actual pool responses and combine with any manual 'declined' status set directly
    # on an assignment (e.g. someone confirmed, then backed out) — the two can't overlap
    # since assign_from_pool only ever creates 'confirmed' rows.
    responses_res = supabase.table('availability_responses').select('status').eq('roster_id', str(roster_id)).execute()
    response_rows = responses_res.data or []
    pool_accept_count = sum(1 for r in response_rows if r.get('status') == 'available')
    pool_decline_count = sum(1 for r in response_rows if r.get('status') == 'declined')
    manual_decline_count = sum(1 for a in assignment_rows if a.get('status') == 'declined')

    accepted_count = pool_accept_count
    decline_count = pool_decline_count + manual_decline_count
    resolved_responses = accepted_count + decline_count

    # Attendance is tracked per shift (show_crew_shifts.status), not per assignment — someone
    # can no-show one call on a multi-date show and work every other date fine, so there's no
    # single attendance outcome for the assignment as a whole to read off show_crew.
    # 'completed' is never stored — it's derived here the same way the frontend derives it:
    # a shift that's still 'scheduled' (i.e. not flagged no_show/cancelled) counts as
    # completed once its date has passed. Cancelled shifts are excluded entirely, by design:
    # the crew member took the call and it fell through for reasons that weren't on them, so
    # it shouldn't count against their attendance either way.
    today_iso = date.today().isoformat()
    all_shifts = [shift for shifts in shifts_by_show_crew_id.values() for shift in shifts]
    completed_count = sum(
        1 for s in all_shifts
        if s.get('status') not in ('no_show', 'cancelled') and s.get('shift_date') and s['shift_date'] <= today_iso
    )
    no_show_count = sum(1 for s in all_shifts if s.get('status') == 'no_show')
    attendance_resolved = completed_count + no_show_count

    member['assignments'] = assignments
    member['stats'] = {
        'shows_worked': len(assignment_rows),
        'completed_count': completed_count,
        'no_show_count': no_show_count,
        'no_show_rate': round((no_show_count / attendance_resolved) * 100, 1) if attendance_resolved else 0.0,
        'invites_sent': len(response_rows),
        'accepted_count': accepted_count,
        'decline_count': decline_count,
        'accept_rate': round((accepted_count / resolved_responses) * 100, 1) if resolved_responses else 0.0,
        'decline_rate': round((decline_count / resolved_responses) * 100, 1) if resolved_responses else 0.0,
    }
    return member

@router.put("/roster/{roster_id}", response_model=RosterMember, tags=["Roster"], dependencies=[Depends(feature_check("crew"))])
async def update_roster_member(roster_id: uuid.UUID, roster_data: RosterMemberCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates a member in the user's global roster."""
    existing = supabase.table('roster').select('erased_at').eq('id', str(roster_id)).eq('user_id', str(user.id)).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Roster member not found.")
    if existing.data[0].get('erased_at'):
        raise HTTPException(status_code=400, detail="This roster member's personal data has been erased and can no longer be edited.")

    update_data = roster_data.model_dump(exclude_unset=True)
    response = supabase.table('roster').update(update_data).eq('id', str(roster_id)).eq('user_id', str(user.id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Roster member not found or update failed.")
    return response.data[0]

@router.delete("/roster/{roster_id}", status_code=204, tags=["Roster"], dependencies=[Depends(feature_check("crew"))])
async def delete_roster_member(roster_id: uuid.UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Deletes a member from the user's global roster. Only allowed when they have
    no show assignment history. Once someone has been assigned to a show (and may
    have been paid), use the erase-personal-data endpoint instead, which removes
    their personal data but preserves pay/assignment records.
    """
    show_crew_res = supabase.table('show_crew').select('id').eq('roster_id', str(roster_id)).limit(1).execute()
    if show_crew_res.data:
        raise HTTPException(
            status_code=400,
            detail="This roster member has show assignment history and can't be deleted. Use 'Erase Personal Data' instead to preserve pay records."
        )

    response = supabase.table('roster').delete().eq('id', str(roster_id)).eq('user_id', str(user.id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Roster member not found.")
    return

@router.post("/roster/{roster_id}/erase", response_model=RosterMember, tags=["Roster"], dependencies=[Depends(feature_check("crew"))])
async def erase_roster_member(roster_id: uuid.UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Permanently erases a roster member's personal data (GDPR right to erasure)
    while preserving their show assignment and pay history. Irreversible.
    """
    existing = supabase.table('roster').select('id, erased_at').eq('id', str(roster_id)).eq('user_id', str(user.id)).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Roster member not found.")
    if existing.data[0].get('erased_at'):
        raise HTTPException(status_code=400, detail="This roster member's personal data has already been erased.")

    erasure_data = {
        'first_name': 'Erased',
        'last_name': f"Member {str(roster_id)[:8]}",
        'phone_number': None,
        'email': None,
        'custom_fields': {},
        'status': 'inactive',
        'erased_at': datetime.now(timezone.utc).isoformat(),
    }
    response = supabase.table('roster').update(erasure_data).eq('id', str(roster_id)).eq('user_id', str(user.id)).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to erase roster member.")
    return response.data[0]

# --- Roster Custom Field Definitions ---
@router.get("/roster_custom_fields", response_model=List[RosterCustomFieldDefinition], tags=["Roster"], dependencies=[Depends(feature_check("crew"))])
async def get_roster_custom_fields(user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Gets the user's custom roster field definitions, in display order."""
    response = supabase.table('roster_custom_field_definitions').select('*').eq('user_id', str(user.id)).order('sort_order').execute()
    return response.data or []

@router.post("/roster_custom_fields", response_model=RosterCustomFieldDefinition, tags=["Roster"], dependencies=[Depends(feature_check("crew"))])
async def create_roster_custom_field(data: RosterCustomFieldDefinitionCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new custom field definition for the user's roster."""
    existing = supabase.table('roster_custom_field_definitions').select('key, sort_order').eq('user_id', str(user.id)).execute()
    existing_rows = existing.data or []
    existing_keys = {row['key'] for row in existing_rows}
    next_sort_order = max((row['sort_order'] for row in existing_rows), default=-1) + 1

    base_key = _slugify_field_key(data.label)
    key = base_key
    suffix = 2
    while key in existing_keys:
        key = f"{base_key}_{suffix}"
        suffix += 1

    insert_data = {
        'user_id': str(user.id),
        'key': key,
        'label': data.label,
        'field_type': data.field_type,
        'options': data.options,
        'sort_order': next_sort_order,
    }
    response = supabase.table('roster_custom_field_definitions').insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create custom field.")
    return response.data[0]

@router.put("/roster_custom_fields/{field_id}", response_model=RosterCustomFieldDefinition, tags=["Roster"], dependencies=[Depends(feature_check("crew"))])
async def update_roster_custom_field(field_id: uuid.UUID, data: RosterCustomFieldDefinitionUpdate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates a custom field's label, dropdown options, or display order. The field type can't be changed once created."""
    update_data = data.model_dump(exclude_unset=True)
    response = supabase.table('roster_custom_field_definitions').update(update_data).eq('id', str(field_id)).eq('user_id', str(user.id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Custom field not found or update failed.")
    return response.data[0]

@router.delete("/roster_custom_fields/{field_id}", status_code=204, tags=["Roster"], dependencies=[Depends(feature_check("crew"))])
async def delete_roster_custom_field(field_id: uuid.UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Deletes a custom field definition. Values already stored under it on roster members are left in place, just no longer shown."""
    supabase.table('roster_custom_field_definitions').delete().eq('id', str(field_id)).eq('user_id', str(user.id)).execute()
    return

# --- Show Crew Endpoints ---
@router.post("/roster_and_show_crew", response_model=RosterMember, tags=["Show Crew"], dependencies=[Depends(feature_check("crew"))])
async def create_roster_member_and_add_to_show(data: RosterMemberAndShowCrewCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new member in the user's global roster and adds them to a show's crew."""
    # Create the roster member
    roster_insert_data = data.model_dump(exclude={'show_id'})
    roster_insert_data['user_id'] = str(user.id)
    roster_response = supabase.table('roster').insert(roster_insert_data).execute()
    if not roster_response.data:
        raise HTTPException(status_code=500, detail="Failed to create roster member.")
    
    new_roster_member = roster_response.data[0]
    
    # Add the new member to the show crew
    show_crew_insert_data = {
        'show_id': data.show_id, 
        'roster_id': new_roster_member['id'],
        'position': data.position
    }
    show_crew_response = supabase.table('show_crew').insert(show_crew_insert_data).execute()
    if not show_crew_response.data:
        # Rollback roster creation
        supabase.table('roster').delete().eq('id', new_roster_member['id']).execute()
        raise HTTPException(status_code=500, detail="Failed to add crew to show.")
        
    return new_roster_member

@router.get("/shows/{show_id}/crew", response_model=List[ShowCrewMember], tags=["Show Crew"], dependencies=[Depends(feature_check("crew"))])
async def get_show_crew(show_id: int, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Gets all crew members for a specific show, with their dated shifts."""
    response = supabase.table('show_crew').select('*, roster(*), shifts:show_crew_shifts(*)').eq('show_id', show_id).execute()
    return response.data

@router.post("/shows/{show_id}/crew/{roster_id}", response_model=ShowCrewMember, tags=["Show Crew"], dependencies=[Depends(feature_check("crew"))])
async def add_crew_to_show(show_id: int, roster_id: uuid.UUID, crew_data: ShowCrewMemberCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Adds a roster member to a show's crew with specific details."""
    insert_data = crew_data.model_dump()
    insert_data['show_id'] = show_id
    insert_data['roster_id'] = str(roster_id)
    
    response = supabase.table('show_crew').insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to add crew to show.")
    
    # Fetch the full show crew member details to return
    member_res = supabase.table('show_crew').select('*, roster(*)').eq('id', response.data[0]['id']).single().execute()
    return member_res.data

@router.delete("/shows/{show_id}/crew/{show_crew_id}", status_code=204, tags=["Show Crew"], dependencies=[Depends(feature_check("crew"))])
async def remove_crew_from_show(show_id: int, show_crew_id: uuid.UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Removes a crew member from a show and their associated timesheet entries."""
    # First, delete any timesheet entries associated with this show_crew member
    supabase.table('timesheet_entries').delete().eq('show_crew_id', str(show_crew_id)).execute()
    
    # Then, delete the show_crew member
    supabase.table('show_crew').delete().eq('show_id', show_id).eq('id', str(show_crew_id)).execute()
    return

@router.put("/show_crew/{show_crew_id}", response_model=ShowCrewMember, tags=["Show Crew"], dependencies=[Depends(feature_check("crew"))])
async def update_show_crew_member(show_crew_id: uuid.UUID, data: ShowCrewMemberUpdate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates a show crew member's rate information and/or assignment status."""
    update_data = data.model_dump(exclude_unset=True)
    if update_data.get('status') and update_data['status'] in RESOLVED_SHOW_CREW_STATUSES:
        update_data['responded_at'] = datetime.now(timezone.utc).isoformat()
    response = supabase.table('show_crew').update(update_data).eq('id', str(show_crew_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Show crew member not found or update failed.")
    
    # Fetch the full show crew member details to return
    member_res = supabase.table('show_crew').select('*, roster(*)').eq('id', response.data[0]['id']).single().execute()
    return member_res.data