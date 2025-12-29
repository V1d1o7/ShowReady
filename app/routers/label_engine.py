from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import List, Optional
import uuid
import io
import os
import base64
import requests

from app.models import (
    User, LabelStock, LabelTemplate, LabelTemplateCreate, DynamicLabelPdfPayload
)
from app.api import get_supabase_client, get_user, feature_check
from app.LE_pdf_utils import render_template_to_buffer

from supabase import Client

router = APIRouter(dependencies=[Depends(feature_check("label_engine"))])

LABEL_ENGINE_FEATURE = Depends(feature_check("label_engine"))

# --- Helper: Load Image from Path/URL (Fallback) ---
def load_image_b64_fallback(path: str) -> Optional[str]:
    if not path:
        return None
    try:
        image_data = None
        if path.startswith("http://") or path.startswith("https://"):
            res = requests.get(path, timeout=5)
            if res.status_code == 200:
                image_data = res.content
        else:
            if os.path.exists(path):
                with open(path, "rb") as f:
                    image_data = f.read()
            else:
                base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
                rel_path = os.path.join(base_dir, path.lstrip("/"))
                if os.path.exists(rel_path):
                    with open(rel_path, "rb") as f:
                        image_data = f.read()
                elif path.startswith("/"):
                     public_path = os.path.join(base_dir, "frontend", "public", path.lstrip("/"))
                     if os.path.exists(public_path):
                         with open(public_path, "rb") as f:
                             image_data = f.read()

        if image_data:
            return base64.b64encode(image_data).decode('utf-8')
        return None
    except Exception:
        return None


@router.get("/library/label-stocks", response_model=List[LabelStock])
def get_label_stocks(supabase: Client = Depends(get_supabase_client)):
    response = supabase.table("label_stocks").select("*").execute()
    return response.data

@router.get("/library/label-templates", response_model=List[LabelTemplate])
def get_label_templates(
    category: Optional[str] = Query(None, enum=['case', 'loom', 'generic']),
    user: User = Depends(get_user),
    supabase: Client = Depends(get_supabase_client)
):
    query = supabase.table("label_templates").select("*").or_(f"user_id.eq.{user.id},is_public.eq.true")
    if category:
        query = query.eq("category", category)
    response = query.execute()
    return response.data

@router.get("/library/label-templates/{template_id}", response_model=LabelTemplate)
def get_label_template(
    template_id: uuid.UUID,
    user: User = Depends(get_user),
    supabase: Client = Depends(get_supabase_client)
):
    response = supabase.table("label_templates").select("*").eq("id", str(template_id)).maybe_single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Template not found")
    return response.data

@router.post("/library/label-templates", response_model=LabelTemplate, status_code=201)
def create_label_template(
    template_data: LabelTemplateCreate,
    user: User = Depends(get_user),
    supabase: Client = Depends(get_supabase_client)
):
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
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create label template.")
    return response.data[0]

@router.put("/library/label-templates/{template_id}", response_model=LabelTemplate)
def update_label_template(
    template_id: uuid.UUID,
    template_data: LabelTemplateCreate,
    user: User = Depends(get_user),
    supabase: Client = Depends(get_supabase_client)
):
    elements_dict = [element.model_dump() for element in template_data.elements]
    update_data = {
        "stock_id": str(template_data.stock_id),
        "name": template_data.name,
        "category": template_data.category,
        "elements": elements_dict,
        "updated_at": "now()"
    }
    response = supabase.table("label_templates").update(update_data).eq("id", str(template_id)).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to update label template.")
    return response.data[0]

@router.delete("/library/label-templates/{template_id}", status_code=204)
def delete_label_template(
    template_id: uuid.UUID,
    user: User = Depends(get_user),
    supabase: Client = Depends(get_supabase_client)
):
    supabase.table("label_templates").delete().eq("id", str(template_id)).execute()
    return

@router.get("/shows/{show_id}/label-engine")
def get_label_engine_status(show_id: int):
    return {"status": "success", "show_id": show_id}

@router.post("/shows/{show_id}/label-engine/print")
def print_labels(
    show_id: int,
    payload: DynamicLabelPdfPayload,
    user: User = Depends(get_user), # ADDED: Get authenticated user
    supabase: Client = Depends(get_supabase_client)
):
    """Generates and returns a PDF of labels based on a template and dynamic data."""
    # 1. Fetch Template
    template_res = supabase.table("label_templates").select("*").eq("id", str(payload.template_id)).maybe_single().execute()
    if not template_res.data:
        raise HTTPException(status_code=404, detail="Label template not found.")
    template = LabelTemplate(**template_res.data)

    # 2. Fetch Stock
    stock_res = supabase.table("label_stocks").select("*").eq("id", str(template.stock_id)).maybe_single().execute()
    if not stock_res.data:
        raise HTTPException(status_code=404, detail="Label stock not found.")
    stock = LabelStock(**stock_res.data)

    data_rows = [row for row in payload.data_rows]

    # --- 3. Fetch Show Logo ---
    show_logo_b64 = None
    try:
        show_res = supabase.table("shows").select("*").eq("id", str(show_id)).maybe_single().execute()
        logo_path = None
        if show_res.data:
            info = show_res.data.get('data', {}).get('info')
            if not info:
                info = show_res.data.get('info')
            if info:
                logo_path = info.get("logo_path")
        
        if logo_path:
            try:
                logo_bytes = supabase.storage.from_('logos').download(logo_path)
                if logo_bytes:
                    show_logo_b64 = base64.b64encode(logo_bytes).decode('utf-8')
            except Exception:
                show_logo_b64 = load_image_b64_fallback(logo_path)
    except Exception:
        pass

    # --- 4. Fetch Company Logo ---
    company_logo_b64 = None
    try:
        profile_res = supabase.table("profiles").select("company_logo_path").eq("id", str(user.id)).maybe_single().execute()
        if profile_res.data and profile_res.data.get("company_logo_path"):
            c_logo_path = profile_res.data["company_logo_path"]
            try:
                # Try downloading from storage first
                c_logo_bytes = supabase.storage.from_('logos').download(c_logo_path)
                if c_logo_bytes:
                    company_logo_b64 = base64.b64encode(c_logo_bytes).decode('utf-8')
            except Exception:
                # Fallback
                company_logo_b64 = load_image_b64_fallback(c_logo_path)
    except Exception:
        pass

    # 5. Inject Logos
    for row in data_rows:
        if show_logo_b64:
            row["__SHOW_LOGO__"] = show_logo_b64
        if company_logo_b64:
            row["__COMPANY_LOGO__"] = company_logo_b64

    # 6. Generate PDF
    try:
        pdf_buffer = render_template_to_buffer(template, stock, data_rows)
    except Exception as e:
        print(f"PDF Generation Error: {repr(e)}")
        raise HTTPException(status_code=500, detail=f"PDF Error: {str(e)}")

    return StreamingResponse(pdf_buffer, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=\"labels.pdf\""
    })