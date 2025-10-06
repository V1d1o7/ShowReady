from fastapi import APIRouter, Depends, HTTPException, Request
from typing import List
import uuid
from .. import models
from supabase import create_client, Client
from gotrue.errors import AuthApiError
import os

router = APIRouter()

# --- Supabase Client Dependency ---
def get_supabase_client():
    """Dependency to create a Supabase client."""
    return create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY"))

# --- User Authentication Dependency ---
async def get_user(request: Request, supabase: Client = Depends(get_supabase_client)):
    """Dependency to get user from Supabase JWT in Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    
    token = auth_header.replace("Bearer ", "")
    
    try:
        user_response = supabase.auth.get_user(token)
        return user_response.user
    except AuthApiError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.get("/api/shows/{show_name}/vlans", response_model=List[models.VLAN], tags=["VLANs"])
async def get_vlans_for_show(show_name: str, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Get all VLANs for a specific show.
    The user must be a collaborator on the show to access this endpoint.
    """
    show_res = supabase.table('shows').select('id').eq('name', show_name).eq('user_id', user.id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")
    
    show_id = show_res.data['id']
    
    vlan_res = supabase.table('vlans').select('*').eq('show_id', show_id).execute()
    return vlan_res.data

@router.post("/api/shows/{show_name}/vlans", response_model=models.VLAN, tags=["VLANs"])
async def create_vlan_for_show(show_name: str, vlan: models.VLANCreate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Create a new VLAN for a specific show.
    The user must have 'owner' or 'editor' role on the show.
    """
    show_res = supabase.table('shows').select('id').eq('name', show_name).eq('user_id', user.id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")
        
    show_id = show_res.data['id']

    insert_data = vlan.model_dump()
    insert_data['show_id'] = show_id
    
    response = supabase.table('vlans').insert(insert_data).execute()
    
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create VLAN.")
        
    return response.data[0]

@router.delete("/api/vlans/{vlan_id}", status_code=204, tags=["VLANs"])
async def delete_vlan(vlan_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Delete a VLAN by its ID.
    The user must have 'owner' or 'editor' role on the show this VLAN belongs to.
    """
    # RLS will enforce delete permissions.
    supabase.table('vlans').delete().eq('id', str(vlan_id)).execute()
    return