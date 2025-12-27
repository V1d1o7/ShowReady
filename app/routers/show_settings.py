# app/routers/show_settings.py
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from app.api import get_supabase_client, get_user
from app.models import ShowInfo
import uuid

router = APIRouter(prefix="/shows/{show_id}", tags=["Show Settings"])

@router.put("/settings")
async def update_show_settings(
    show_id: int,
    settings: ShowInfo,
    user=Depends(get_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Update a show's settings, including status (active/archived)."""
    try:
        # 1. Fetch existing show data including status and user_id
        show_res = supabase.table("shows").select("user_id, status, data").eq("id", show_id).single().execute()
        if not show_res.data:
            raise HTTPException(status_code=404, detail="Show not found")
        
        current_show = show_res.data
        current_status = current_show.get('status', 'active')
        new_status = settings.status

        # 2. Check Permissions & Limits if Status is Changing
        if new_status and new_status != current_status:
            # Only Owner can change status (strict ownership)
            if current_show['user_id'] != str(user.id):
                 raise HTTPException(status_code=403, detail="Only the show owner can archive or unarchive this show.")

            # Get User's Tier Limits
            profile = supabase.table('profiles').select('tier_id, tiers(max_active_shows, max_archived_shows)').eq('id', user.id).single().execute()
            tier_limits = profile.data.get('tiers', {}) or {}
            
            # Logic for Unarchiving (Archived -> Active)
            if new_status == 'active':
                max_active = tier_limits.get('max_active_shows')
                if max_active is not None:
                    # Count existing active shows
                    count_active = supabase.table('shows').select('id', count='exact').eq('user_id', user.id).eq('status', 'active').execute().count
                    if count_active >= max_active:
                        raise HTTPException(status_code=403, detail=f"Cannot unarchive: Active show limit ({max_active}) reached.")
            
            # Logic for Archiving (Active -> Archived)
            elif new_status == 'archived':
                max_archived = tier_limits.get('max_archived_shows')
                if max_archived is not None:
                    # Count existing archived shows
                    count_archived = supabase.table('shows').select('id', count='exact').eq('user_id', user.id).eq('status', 'archived').execute().count
                    if count_archived >= max_archived:
                        raise HTTPException(status_code=403, detail=f"Cannot archive: Archived show limit ({max_archived}) reached.")

        # 3. Merge Settings into JSON Data
        existing_data = current_show.get('data') or {}
        info_data = existing_data.get('info', {}) or {}
        update_data = settings.dict(exclude_unset=True)

        for key, value in update_data.items():
            info_data[key] = value
        
        existing_data['info'] = info_data

        # 4. Update Database (both column and JSON)
        # Note: We update the column 'status' as well as the JSON 'data'
        update_payload = {"data": existing_data}
        if new_status:
            update_payload['status'] = new_status

        response = supabase.table("shows").update(update_payload).eq("id", show_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Failed to update show settings.")

        return {"message": "Show settings updated successfully."}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))