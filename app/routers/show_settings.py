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
    """Update a show's settings by merging them into the 'info' object within the main 'data' JSONB column."""
    try:
        # 1. Fetch the existing show's data column
        show_res = supabase.table("shows").select("data").eq("id", show_id).single().execute()
        if not show_res.data:
            raise HTTPException(status_code=404, detail="Show not found")

        # 2. Merge the new settings into the nested 'info' object
        existing_data = show_res.data.get('data') or {}
        info_data = existing_data.get('info', {}) or {}
        update_data = settings.dict(exclude_unset=True)

        for key, value in update_data.items():
            info_data[key] = value
        
        existing_data['info'] = info_data

        # 3. Update the 'data' column with the merged JSON
        response = supabase.table("shows").update({"data": existing_data}).eq("id", show_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Failed to update show settings.")

        return {"message": "Show settings updated successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
