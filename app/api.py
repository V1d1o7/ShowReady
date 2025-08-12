import os
import json
from fastapi import APIRouter, HTTPException, Body, File, UploadFile, Depends, Request
from fastapi.responses import JSONResponse
from typing import Dict, Optional
from supabase import create_client, Client
from gotrue.errors import AuthApiError

from .models import ShowFile

router = APIRouter()

# --- Supabase Configuration ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# --- User Authentication Dependency ---
async def get_user(request: Request):
    """Dependency to get user from Supabase JWT in Authorization header."""
    token = request.headers.get("Authorization")
    if not token:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    
    token = token.replace("Bearer ", "")
    
    try:
        # The service key is required to look up user information
        supabase_admin = create_client(SUPABASE_URL, SUPABASE_KEY)
        user_response = supabase_admin.auth.get_user(token)
        return user_response.user
    except AuthApiError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

# --- Show Management Endpoints ---

@router.post("/shows/{show_name}", tags=["Shows"])
async def create_or_update_show(show_name: str, show_data: ShowFile, user = Depends(get_user)):
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    try:
        response = supabase.table('shows').upsert({
            'name': show_name,
            'data': show_data.model_dump(),
            'user_id': user.id
        }).execute()
        
        if response.data:
            return response.data[0]['data']
        raise HTTPException(status_code=500, detail="Failed to save show data.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/shows/{show_name}", tags=["Shows"])
async def get_show(show_name: str, user = Depends(get_user)):
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    try:
        response = supabase.table('shows').select('data').eq('name', show_name).eq('user_id', user.id).single().execute()
        if response.data:
            return response.data['data']
        raise HTTPException(status_code=404, detail="Show not found")
    except Exception:
        raise HTTPException(status_code=404, detail=f"Show '{show_name}' not found.")

@router.get("/shows", tags=["Shows"])
async def list_shows(user = Depends(get_user)):
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    try:
        response = supabase.table('shows').select('name').eq('user_id', user.id).execute()
        return [item['name'] for item in response.data] if response.data else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/shows/{show_name}", status_code=204, tags=["Shows"])
async def delete_show(show_name: str, user = Depends(get_user)):
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    try:
        supabase.table('shows').delete().eq('name', show_name).eq('user_id', user.id).execute()
        return
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- File Upload Endpoint ---

@router.post("/upload/logo", tags=["File Upload"])
async def upload_logo(file: UploadFile = File(...), user = Depends(get_user)):
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image.")
    
    try:
        filename = os.path.basename(file.filename)
        # The path in the bucket is now user-specific
        file_path_in_bucket = f"{user.id}/{filename}"
        file_content = await file.read()
        
        supabase.storage.from_('logos').upload(
            path=file_path_in_bucket,
            file=file_content,
            file_options={'cache-control': '3600', 'upsert': 'true'}
        )
        
        # Return the path, not a public URL
        return JSONResponse(content={"logo_path": file_path_in_bucket})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logo upload failed: {str(e)}")

# PDF Generation endpoints are removed as they are not compatible with a multi-user cloud setup.
# They require a separate, scalable solution (e.g., a serverless function) for PDF generation.
