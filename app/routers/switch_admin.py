from fastapi import APIRouter, Depends, HTTPException, Body
from supabase import Client
from app.api import get_supabase_client, get_admin_user, get_service_client
from app.models import SwitchModel, SwitchModelCreate, SwitchModelUpdate
import uuid
from typing import Optional

router = APIRouter()

# Switch models only have a SELECT RLS policy (any authenticated user can read the
# catalog) -- writes are admin-only and go through the service-role client rather than
# a broad admin RLS policy, matching the pattern used by other admin-only writes (e.g.
# create_default_equipment in app/api.py).

@router.get("/admin/switch_models", response_model=list[SwitchModel], tags=["Admin"])
def get_switch_models(supabase: Client = Depends(get_supabase_client), user = Depends(get_admin_user)):
    """
    Retrieve all switch models. Admin only.
    """
    response = supabase.table("switch_models").select("*").order("manufacturer").order("model_name").execute()
    return response.data

@router.post("/admin/switch_models", response_model=SwitchModel, status_code=201, tags=["Admin"])
def create_switch_model(model_data: SwitchModelCreate, user = Depends(get_admin_user)):
    """
    Create a new switch model. Admin only.
    """
    admin_client = get_service_client()
    # supabase-py (2.18.1) doesn't support chaining .select() after .insert()/.update()
    # -- but insert/update already return the affected row(s) via Prefer:
    # return=representation by default, so just take response.data[0] directly (same
    # pattern used throughout app/api.py, e.g. create_default_equipment).
    response = admin_client.table("switch_models").insert(model_data.model_dump()).execute()
    if not response.data:
        raise HTTPException(status_code=400, detail="Failed to create switch model")
    return response.data[0]

@router.put("/admin/switch_models/{model_id}", response_model=SwitchModel, tags=["Admin"])
def update_switch_model(model_id: uuid.UUID, model_data: SwitchModelUpdate, user = Depends(get_admin_user)):
    """
    Update an existing switch model. Admin only.
    """
    admin_client = get_service_client()
    response = admin_client.table("switch_models").update(model_data.model_dump(exclude_unset=True)).eq("id", str(model_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Switch model not found or failed to update")
    return response.data[0]

@router.delete("/admin/switch_models/{model_id}", status_code=204, tags=["Admin"])
def delete_switch_model(model_id: uuid.UUID, user = Depends(get_admin_user)):
    """
    Delete a switch model. Admin only.
    """
    admin_client = get_service_client()
    response = admin_client.table("switch_models").delete().eq("id", str(model_id)).execute()
    if not response.data :
        raise HTTPException(status_code=404, detail="Switch model not found")
    return

@router.put("/admin/equipment/{equipment_id}/link_model", tags=["Admin"])
def link_model_to_equipment(equipment_id: uuid.UUID, switch_model_id: Optional[uuid.UUID] = Body(None, embed=True), user = Depends(get_admin_user)):
    """
    Link a switch model to a piece of equipment, or unlink it by providing a null ID. Admin only.

    Default (admin-catalog) equipment_templates rows have user_id = NULL, and every
    write-capable RLS policy on this table requires auth.uid() = user_id -- so a
    user-scoped client can never write to a default row, not even as global_admin. Use
    the service client, same as the switch_models writes above.
    """
    admin_client = get_service_client()
    update_data = {"switch_model_id": str(switch_model_id) if switch_model_id else None}
    response = admin_client.table("equipment_templates").update(update_data).eq("id", str(equipment_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Equipment not found or failed to link model")
    return response.data[0]
