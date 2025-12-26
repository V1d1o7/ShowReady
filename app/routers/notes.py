from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
import uuid
from .. import models
from app.api import get_supabase_client, get_user, feature_check
from postgrest import APIResponse

router = APIRouter()

@router.get("/notes/{parent_entity_type}/{parent_entity_id}", tags=["Notes"], response_model=List[models.Note], dependencies=[Depends(feature_check("contextual_notes"))])
def get_notes_for_entity(
    parent_entity_type: str,
    parent_entity_id: str,
    show_id: Optional[int] = Query(None),
    supabase=Depends(get_supabase_client),
    user=Depends(get_user)
):
    """
    Fetch all notes for a specific parent entity.
    If show_id is provided, it fetches notes for that show.
    If show_id is None, it fetches global notes (where show_id is NULL).
    """
    query = supabase.table("notes") \
        .select("*, profiles(first_name, last_name)") \
        .eq("parent_entity_type", parent_entity_type) \
        .eq("parent_entity_id", parent_entity_id) \
        .order("created_at", desc=True)

    if show_id is not None:
        query = query.eq("show_id", show_id)
    else:
        query = query.is_("show_id", "null")

    response: APIResponse = query.execute()

    notes = []
    if response.data:
        for item in response.data:
            user_profile = item.pop('profiles', {}) or {}
            note = models.Note(
                **item,
                user_first_name=user_profile.get('first_name'),
                user_last_name=user_profile.get('last_name')
            )
            notes.append(note)

    return notes


@router.post("/notes", tags=["Notes"], response_model=models.Note, status_code=201, dependencies=[Depends(feature_check("contextual_notes"))])
def create_note(
    note: models.NoteCreate,
    supabase=Depends(get_supabase_client),
    user=Depends(get_user)
):
    """
    Create a new note.
    """
    note_dict = note.model_dump()
    note_dict['user_id'] = str(user.id)
    # The parent_entity_id can be an int (show_id) or a string (UUID).
    # The database stores it as a string, so we ensure the conversion here.
    note_dict['parent_entity_id'] = str(note_dict['parent_entity_id'])

    response: APIResponse = supabase.table("notes").insert(note_dict).execute()

    if not response.data:
        raise HTTPException(status_code=400, detail="Failed to create note.")

    new_note_id = response.data[0]['id']
    fetch_response: APIResponse = supabase.table("notes") \
        .select("*, profiles(first_name, last_name)") \
        .eq("id", new_note_id) \
        .single() \
        .execute()
        
    if not fetch_response.data:
         raise HTTPException(status_code=404, detail="Could not find created note.")

    item = fetch_response.data
    user_profile = item.pop('profiles', {}) or {}
    created_note = models.Note(
        **item,
        user_first_name=user_profile.get('first_name'),
        user_last_name=user_profile.get('last_name')
    )
    return created_note


@router.patch("/notes/{note_id}", tags=["Notes"], response_model=models.Note)
def update_note(
    note_id: str,
    note_update: models.NoteUpdate,
    supabase=Depends(get_supabase_client),
    user=Depends(get_user)
):
    """
    Update a note's content or resolved status.
    """
    update_data = note_update.model_dump(exclude_unset=True)
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided.")

    response: APIResponse = supabase.table("notes") \
        .update(update_data) \
        .eq("id", str(note_id)) \
        .execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Note not found or user does not have permission to update.")

    fetch_response: APIResponse = supabase.table("notes") \
        .select("*, profiles(first_name, last_name)") \
        .eq("id", str(note_id)) \
        .single() \
        .execute()
        
    if not fetch_response.data:
         raise HTTPException(status_code=404, detail="Could not find updated note.")
    
    item = fetch_response.data
    user_profile = item.pop('profiles', {}) or {}
    updated_note = models.Note(
        **item,
        user_first_name=user_profile.get('first_name'),
        user_last_name=user_profile.get('last_name')
    )
    return updated_note


@router.delete("/notes/{note_id}", tags=["Notes"], status_code=204)
def delete_note(
    note_id: str,
    supabase=Depends(get_supabase_client),
    user=Depends(get_user)
):
    """
    Delete a note.
    """
    supabase.table("notes").delete().eq("id", str(note_id)).execute()
    return
