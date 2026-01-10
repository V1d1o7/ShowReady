import uuid
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from typing import List

from ..api import get_supabase_client, get_user, feature_check
from ..models import VLAN, VLANCreate, VLANUpdate

router = APIRouter(
    tags=["VLANs"],
    dependencies=[Depends(feature_check("vlan_management"))]
)

@router.get("/{show_id}", response_model=List[VLAN])
async def get_vlans_for_show(show_id: int, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Retrieves all VLANs for a specific show.
    """
    # Fix: Removed .eq('user_id', user.id) to allow collaborators access
    show_res = supabase.table('shows').select('id').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")
    
    response = supabase.table('vlans').select('*').eq('show_id', show_id).order('tag', desc=False).execute()
    return response.data

@router.post("/{show_id}", response_model=VLAN)
async def create_vlan_for_show(show_id: int, vlan: VLANCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Creates a new VLAN for a specific show.
    """
    # Fix: Removed .eq('user_id', user.id)
    show_res = supabase.table('shows').select('id').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")
        
    # Check for duplicate VLAN name
    name_check_res = supabase.table('vlans').select('id', count='exact').eq('show_id', show_id).eq('name', vlan.name).execute()
    if name_check_res.count > 0:
        raise HTTPException(status_code=409, detail=f"A VLAN with the name '{vlan.name}' already exists in this show.")

    # Check for duplicate VLAN tag
    tag_check_res = supabase.table('vlans').select('id', count='exact').eq('show_id', show_id).eq('tag', vlan.tag).execute()
    if tag_check_res.count > 0:
        raise HTTPException(status_code=409, detail=f"A VLAN with tag '{vlan.tag}' already exists in this show.")

    insert_data = vlan.model_dump()
    insert_data['show_id'] = show_id
    
    response = supabase.table('vlans').insert(insert_data).execute()
    
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create VLAN.")
        
    return response.data[0]

@router.put("/{vlan_id}", response_model=VLAN)
async def update_vlan(vlan_id: uuid.UUID, vlan_data: VLANUpdate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Updates an existing VLAN.
    """
    # 1. Fetch the VLAN to get the show_id
    vlan_res = supabase.table('vlans').select('show_id').eq('id', str(vlan_id)).single().execute()
    if not vlan_res.data:
        raise HTTPException(status_code=404, detail="VLAN not found.")
    show_id = vlan_res.data['show_id']

    # 2. Verify access (Fix: Removed strict owner check, rely on RLS/Membership)
    show_res = supabase.table('shows').select('id').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=403, detail="Access denied: Show not found.")

    update_dict = vlan_data.model_dump(exclude_unset=True)

    # 3. Check for duplicates if name or tag are being updated
    if 'name' in update_dict:
        name_check_res = supabase.table('vlans').select('id', count='exact') \
            .eq('show_id', show_id) \
            .eq('name', update_dict['name']) \
            .neq('id', str(vlan_id)) \
            .execute()
        if name_check_res.count > 0:
            raise HTTPException(status_code=409, detail=f"A VLAN with the name '{update_dict['name']}' already exists in this show.")

    if 'tag' in update_dict:
        tag_check_res = supabase.table('vlans').select('id', count='exact') \
            .eq('show_id', show_id) \
            .eq('tag', update_dict['tag']) \
            .neq('id', str(vlan_id)) \
            .execute()
        if tag_check_res.count > 0:
            raise HTTPException(status_code=409, detail=f"A VLAN with tag '{update_dict['tag']}' already exists in this show.")

    # 4. Perform the update
    response = supabase.table('vlans').update(update_dict).eq('id', str(vlan_id)).execute()
    
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to update VLAN.")
    return response.data[0]


@router.delete("/{vlan_id}", status_code=204)
async def delete_vlan(vlan_id: uuid.UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Deletes a VLAN by its ID.
    """
    # 1. Fetch the VLAN to get the show_id
    vlan_res = supabase.table('vlans').select('show_id').eq('id', str(vlan_id)).single().execute()
    if not vlan_res.data:
        return # Idempotent delete

    show_id = vlan_res.data['show_id']

    # 2. Verify access (Fix: Removed strict owner check)
    show_res = supabase.table('shows').select('id').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=403, detail="Access denied: Show not found.")
        
    # 3. Perform the delete
    supabase.table('vlans').delete().eq('id', str(vlan_id)).execute()
    return