import os
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Response
from fastapi.responses import JSONResponse
from supabase import create_client, Client
from gotrue.errors import AuthApiError
import io
from pydantic import BaseModel

from .models import ShowFile, LoomLabel, CaseLabel
from .pdf_utils import generate_loom_label_pdf, generate_case_label_pdf
from typing import List, Dict, Optional

router = APIRouter()

# --- Supabase Configuration ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# --- Supabase Client Dependency ---
def get_supabase_client():
    """Dependency to create a Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)

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

# --- Show Management Endpoints ---

@router.post("/shows/{show_name}", tags=["Shows"])
async def create_or_update_show(show_name: str, show_data: ShowFile, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new show or updates an existing one for the authenticated user."""
    try:
        # Ensure the user_id in the data matches the authenticated user
        response = supabase.table('shows').upsert({
            'name': show_name,
            'data': show_data.model_dump_json(),
            'user_id': user.id
        }, on_conflict='name, user_id').execute()
        
        if response.data:
            return response.data[0]
        raise HTTPException(status_code=500, detail="Failed to save show data.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/shows/{show_name}", tags=["Shows"])
async def get_show(show_name: str, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves a specific show for the authenticated user."""
    try:
        response = supabase.table('shows').select('data').eq('name', show_name).eq('user_id', user.id).single().execute()
        if response.data:
            return response.data['data']
        raise HTTPException(status_code=404, detail="Show not found")
    except Exception:
        raise HTTPException(status_code=404, detail=f"Show '{show_name}' not found.")

@router.get("/shows", tags=["Shows"])
async def list_shows(user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Lists all shows for the authenticated user."""
    try:
        response = supabase.table('shows').select('name').eq('user_id', user.id).execute()
        return [item['name'] for item in response.data] if response.data else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/shows/{show_name}", status_code=204, tags=["Shows"])
async def delete_show(show_name: str, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Deletes a specific show for the authenticated user."""
    try:
        supabase.table('shows').delete().eq('name', show_name).eq('user_id', user.id).execute()
        return
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- File Upload Endpoint ---

@router.post("/upload/logo", tags=["File Upload"])
async def upload_logo(file: UploadFile = File(...), user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Uploads a logo for the authenticated user."""
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image.")
    
    try:
        filename = os.path.basename(file.filename)
        # Sanitize filename to prevent path traversal issues
        safe_filename = "".join(c for c in filename if c.isalnum() or c in ['.', '_', '-']).strip()
        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename.")

        file_path_in_bucket = f"{user.id}/{safe_filename}"
        file_content = await file.read()
        
        supabase.storage.from_('logos').upload(
            path=file_path_in_bucket,
            file=file_content,
            file_options={'cache-control': '3600', 'upsert': 'true'}
        )
        
        return JSONResponse(content={"logo_path": file_path_in_bucket})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logo upload failed: {str(e)}")

# --- PDF Generation Endpoints ---

class LoomLabelPayload(BaseModel):
    labels: List[LoomLabel]
    placement: Optional[Dict[int, int]] = None

class CaseLabelPayload(BaseModel):
    labels: List[CaseLabel]
    logo_path: Optional[str] = None
    placement: Optional[Dict[int, int]] = None

@router.post("/pdf/loom-labels", tags=["PDF Generation"])
async def create_loom_label_pdf(payload: LoomLabelPayload, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Generates a PDF for loom labels."""
    pdf_buffer = generate_loom_label_pdf(payload.labels, payload.placement)
    return Response(content=pdf_buffer.getvalue(), media_type="application/pdf")

@router.post("/pdf/case-labels", tags=["PDF Generation"])
async def create_case_label_pdf(payload: CaseLabelPayload, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Generates a PDF for case labels, potentially with a logo."""
    logo_bytes = None
    if payload.logo_path:
        try:
            # Download the logo from Supabase storage
            response = supabase.storage.from_('logos').download(payload.logo_path)
            logo_bytes = response
        except Exception as e:
            # Log the error but continue without the logo
            print(f"Could not download logo: {e}")

    pdf_buffer = generate_case_label_pdf(payload.labels, logo_bytes, payload.placement)
    return Response(content=pdf_buffer.getvalue(), media_type="application/pdf")
