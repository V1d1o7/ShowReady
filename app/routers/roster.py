from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from app.api import get_supabase_client, get_user
from app.models import RosterMember, RosterMemberCreate, ShowCrewMember, RosterMemberAndShowCrewCreate, ShowCrewMemberUpdate
import uuid
from typing import List

router = APIRouter()

@router.get("/roster", response_model=List[RosterMember], tags=["Roster"])
async def get_roster(user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Gets all members of the user's global roster."""
    response = supabase.table('roster').select('*').eq('user_id', str(user.id)).execute()
    return response.data

@router.post("/roster", response_model=RosterMember, tags=["Roster"])
async def create_roster_member(roster_data: RosterMemberCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new member in the user's global roster."""
    insert_data = roster_data.model_dump()
    insert_data['user_id'] = str(user.id)
    response = supabase.table('roster').insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create roster member.")
    return response.data[0]

@router.put("/roster/{roster_id}", response_model=RosterMember, tags=["Roster"])
async def update_roster_member(roster_id: uuid.UUID, roster_data: RosterMemberCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates a member in the user's global roster."""
    update_data = roster_data.model_dump(exclude_unset=True)
    response = supabase.table('roster').update(update_data).eq('id', str(roster_id)).eq('user_id', str(user.id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Roster member not found or update failed.")
    return response.data[0]

@router.delete("/roster/{roster_id}", status_code=204, tags=["Roster"])
async def delete_roster_member(roster_id: uuid.UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Deletes a member from the user's global roster."""
    supabase.table('roster').delete().eq('id', str(roster_id)).eq('user_id', str(user.id)).execute()
    return

# --- Show Crew Endpoints ---
@router.post("/roster_and_show_crew", response_model=RosterMember, tags=["Show Crew"])
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
    show_crew_insert_data = {'show_id': data.show_id, 'roster_id': new_roster_member['id']}
    show_crew_response = supabase.table('show_crew').insert(show_crew_insert_data).execute()
    if not show_crew_response.data:
        # Rollback roster creation
        supabase.table('roster').delete().eq('id', new_roster_member['id']).execute()
        raise HTTPException(status_code=500, detail="Failed to add crew to show.")
        
    return new_roster_member

@router.get("/shows/{show_id}/crew", response_model=List[ShowCrewMember], tags=["Show Crew"])
async def get_show_crew(show_id: int, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Gets all crew members for a specific show."""
    response = supabase.table('show_crew').select('*, roster(*)').eq('show_id', show_id).execute()
    return response.data

@router.post("/shows/{show_id}/crew", response_model=ShowCrewMember, tags=["Show Crew"])
async def add_crew_to_show(show_id: int, roster_id: uuid.UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Adds a roster member to a show's crew."""
    insert_data = {'show_id': show_id, 'roster_id': str(roster_id)}
    response = supabase.table('show_crew').insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to add crew to show.")
    
    # Fetch the full show crew member details to return
    member_res = supabase.table('show_crew').select('*, roster(*)').eq('id', response.data[0]['id']).single().execute()
    return member_res.data

@router.delete("/shows/{show_id}/crew/{roster_id}", status_code=204, tags=["Show Crew"])
async def remove_crew_from_show(show_id: int, roster_id: uuid.UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Removes a crew member from a show."""
    supabase.table('show_crew').delete().eq('show_id', show_id).eq('roster_id', str(roster_id)).execute()
    return

@router.put("/show_crew/{show_crew_id}", response_model=ShowCrewMember, tags=["Show Crew"])
async def update_show_crew_member(show_crew_id: uuid.UUID, data: ShowCrewMemberUpdate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates a show crew member's rate information."""
    update_data = data.model_dump()
    response = supabase.table('show_crew').update(update_data).eq('id', str(show_crew_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Show crew member not found or update failed.")
    
    # Fetch the full show crew member details to return
    member_res = supabase.table('show_crew').select('*, roster(*)').eq('id', response.data[0]['id']).single().execute()
    return member_res.data
