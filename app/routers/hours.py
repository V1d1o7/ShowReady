from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from app.api import get_supabase_client, get_user
from app.models import DailyHours, DailyHoursCreate, BulkDailyHoursUpdate
import uuid
from typing import List
from datetime import date, timedelta

router = APIRouter()

@router.get("/shows/{show_id}/daily_hours", response_model=List[DailyHours], tags=["Hours Tracking"])
async def get_daily_hours_for_show(show_id: int, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Gets all daily hour entries for a specific show."""
    show_crew_res = supabase.table('show_crew').select('id').eq('show_id', show_id).execute()
    if not show_crew_res.data:
        return []
    
    show_crew_ids = [item['id'] for item in show_crew_res.data]

    response = supabase.table('daily_hours').select('*').in_('show_crew_id', show_crew_ids).execute()
    return response.data

@router.post("/daily_hours/bulk-update", tags=["Hours Tracking"])
async def bulk_update_daily_hours(update_data: BulkDailyHoursUpdate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Bulk updates daily hours entries."""
    # This is a simplified implementation. A real implementation would need to
    # be more transactional to avoid partial updates.
    for entry in update_data.entries:
        supabase.table('daily_hours').upsert(entry.model_dump(), on_conflict='show_crew_id, date').execute()
    return {"message": "Hours updated successfully."}
