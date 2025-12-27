from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import List, Optional
import uuid
import io

from app.models import (
    User, LabelStock, LabelTemplate, LabelTemplateCreate, DynamicLabelPdfPayload
)
from app.api import get_supabase_client, get_user, feature_check
from app.LE_pdf_utils import render_template_to_buffer

from supabase import Client

router = APIRouter(dependencies=[Depends(feature_check("label_engine"))])

# Dependency for label_engine feature check
LABEL_ENGINE_FEATURE = Depends(feature_check("label_engine"))

@router.get("/library/label-stocks", response_model=List[LabelStock], dependencies=[LABEL_ENGINE_FEATURE])
def get_label_stocks(
    supabase: Client = Depends(get_supabase_client)
):
    """Lists all available label stocks."""
    response = supabase.table("label_stocks").select("*").execute()
    return response.data

@router.get("/library/label-templates", response_model=List[LabelTemplate], dependencies=[LABEL_ENGINE_FEATURE])
def get_label_templates(
    category: Optional[str] = Query(None, enum=['case', 'loom', 'generic']),
    user: User = Depends(get_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Lists available label templates for the current user.
    Returns templates created by the user plus any public system templates.
    """
    query = supabase.table("label_templates").select("*").or_(f"user_id.eq.{user.id},is_public.eq.true")
    
    if category:
        query = query.eq("category", category)
        
    response = query.execute()
    return response.data

@router.post("/library/label-templates", response_model=LabelTemplate, status_code=201, dependencies=[LABEL_ENGINE_FEATURE])
def create_label_template(
    template_data: LabelTemplateCreate,
    user: User = Depends(get_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Creates a new label template."""
    elements_dict = [element.model_dump() for element in template_data.elements]
    
    insert_data = {
        "user_id": str(user.id),
        "stock_id": str(template_data.stock_id),
        "name": template_data.name,
        "category": template_data.category,
        "elements": elements_dict,
        "is_public": False
    }
    
    response = supabase.table("label_templates").insert(insert_data).execute()
    
    if not response.data or len(response.data) == 0:
        raise HTTPException(status_code=500, detail="Failed to create label template.")
        
    return response.data[0]

@router.put("/library/label-templates/{template_id}", response_model=LabelTemplate, dependencies=[LABEL_ENGINE_FEATURE])
def update_label_template(
    template_id: uuid.UUID,
    template_data: LabelTemplateCreate,
    user: User = Depends(get_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Updates a label template owned by the user."""
    verify_res = supabase.table("label_templates").select("id").eq("id", str(template_id)).eq("user_id", str(user.id)).maybe_single().execute()
    if not verify_res.data:
        raise HTTPException(status_code=404, detail="Template not found or you do not have permission to edit it.")

    elements_dict = [element.model_dump() for element in template_data.elements]
    update_data = {
        "stock_id": str(template_data.stock_id),
        "name": template_data.name,
        "category": template_data.category,
        "elements": elements_dict,
        "updated_at": "now()"
    }
    
    response = supabase.table("label_templates").update(update_data).eq("id", str(template_id)).execute()

    if not response.data or len(response.data) == 0:
        raise HTTPException(status_code=500, detail="Failed to update label template.")

    return response.data[0]

@router.delete("/library/label-templates/{template_id}", status_code=204, dependencies=[LABEL_ENGINE_FEATURE])
def delete_label_template(
    template_id: uuid.UUID,
    user: User = Depends(get_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Deletes a label template owned by the user."""
    verify_res = supabase.table("label_templates").select("id").eq("id", str(template_id)).eq("user_id", str(user.id)).maybe_single().execute()
    if not verify_res.data:
        raise HTTPException(status_code=404, detail="Template not found or you do not have permission to delete it.")

    supabase.table("label_templates").delete().eq("id", str(template_id)).execute()
    return

@router.get("/shows/{show_id}/label-engine", dependencies=[LABEL_ENGINE_FEATURE])
def get_label_engine_status(show_id: int):
    """
    Endpoint for the frontend to verify access and 
    initialize the Label Engine UI for a specific show.
    """
    return {"status": "success", "show_id": show_id}

@router.post("/shows/{show_id}/label-engine/print", dependencies=[LABEL_ENGINE_FEATURE])
def print_labels(
    show_id: int,
    payload: DynamicLabelPdfPayload,
    supabase: Client = Depends(get_supabase_client)
):
    """Generates and returns a PDF of labels based on a template and dynamic data."""
    template_res = supabase.table("label_templates").select("*").eq("id", str(payload.template_id)).maybe_single().execute()
    if not template_res.data:
        raise HTTPException(status_code=404, detail="Label template not found.")
    template = LabelTemplate(**template_res.data)

    stock_res = supabase.table("label_stocks").select("*").eq("id", str(template.stock_id)).maybe_single().execute()
    if not stock_res.data:
        raise HTTPException(status_code=404, detail="Label stock not found for the given template.")
    stock = LabelStock(**stock_res.data)

    data_rows = [row for row in payload.data_rows]
    if payload.show_logo_bytes:
        for row in data_rows:
            row["__SHOW_LOGO__"] = payload.show_logo_bytes

    try:
        pdf_buffer = render_template_to_buffer(template, stock, data_rows)
    except Exception as e:
        print(f"PDF Generation Error: {repr(e)}")
        raise HTTPException(status_code=500, detail="An error occurred during PDF generation.")

    return StreamingResponse(pdf_buffer, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=\"labels.pdf\""
    })
