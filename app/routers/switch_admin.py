from fastapi import APIRouter, Depends, HTTPException, Body
from supabase import Client
from app.api import get_supabase_client, get_admin_user
from app.models import SwitchModel, SwitchModelCreate, SwitchModelUpdate
import uuid
from typing import Optional

router = APIRouter()

@router.get("/admin/switch_models", response_model=list[SwitchModel], tags=["Admin"])
def get_switch_models(supabase: Client = Depends(get_supabase_client), user = Depends(get_admin_user)):
    """
    Retrieve all switch models. Admin only.
    """
    response = supabase.table("switch_models").select("*").order("manufacturer").order("model_name").execute()
    return response.data

@router.post("/admin/switch_models", response_model=SwitchModel, status_code=201, tags=["Admin"])
def create_switch_model(model_data: SwitchModelCreate, supabase: Client = Depends(get_supabase_client), user = Depends(get_admin_user)):
    """
    Create a new switch model. Admin only.
    """
    response = supabase.table("switch_models").insert(model_data.model_dump()).select("*").single().execute()
    if not response.data:
        raise HTTPException(status_code=400, detail="Failed to create switch model")
    return response.data

@router.put("/admin/switch_models/{model_id}", response_model=SwitchModel, tags=["Admin"])
def update_switch_model(model_id: uuid.UUID, model_data: SwitchModelUpdate, supabase: Client = Depends(get_supabase_client), user = Depends(get_admin_user)):
    """
    Update an existing switch model. Admin only.
    """
    response = supabase.table("switch_models").update(model_data.model_dump(exclude_unset=True)).eq("id", str(model_id)).select("*").single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Switch model not found or failed to update")
    return response.data

@router.delete("/admin/switch_models/{model_id}", status_code=204, tags=["Admin"])
def delete_switch_model(model_id: uuid.UUID, supabase: Client = Depends(get_supabase_client), user = Depends(get_admin_user)):
    """
    Delete a switch model. Admin only.
    """
    response = supabase.table("switch_models").delete().eq("id", str(model_id)).execute()
    if not response.data :
        raise HTTPException(status_code=404, detail="Switch model not found")
    return

@router.put("/admin/equipment/{equipment_id}/link_model", tags=["Admin"])
def link_model_to_equipment(equipment_id: uuid.UUID, switch_model_id: Optional[uuid.UUID] = Body(None, embed=True), supabase: Client = Depends(get_supabase_client), user = Depends(get_admin_user)):
    """
    Link a switch model to a piece of equipment, or unlink it by providing a null ID. Admin only.
    """
    update_data = {"switch_model_id": str(switch_model_id) if switch_model_id else None}
    response = supabase.table("equipment_templates").update(update_data).eq("id", str(equipment_id)).select("*").single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Equipment not found or failed to link model")
    return response.data
