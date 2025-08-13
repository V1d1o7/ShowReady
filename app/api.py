import os
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Response
from fastapi.responses import JSONResponse
from supabase import create_client, Client
from gotrue.errors import AuthApiError
import io
from pydantic import BaseModel
import uuid

from .models import (
    ShowFile, LoomLabel, CaseLabel, UserProfile, UserProfileUpdate, SSOConfig,
    Rack, RackUpdate, EquipmentTemplate, RackEquipmentInstance, RackCreate,
    RackEquipmentInstanceCreate
)
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

# --- Profile Management Endpoints ---
@router.get("/profile", response_model=UserProfile, tags=["User Profile"])
async def get_profile(user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves the profile for the authenticated user. If not found, it creates one."""
    try:
        response = supabase.table('profiles').select('*').eq('id', user.id).single().execute()
        return response.data
    except Exception as e:
        if 'PGRST116' in str(e) or 'The result contains 0 rows' in str(e):
            try:
                user_meta = user.user_metadata
                profile_to_create = {
                    'id': user.id,
                    'first_name': user_meta.get('first_name'),
                    'last_name': user_meta.get('last_name'),
                    'company_name': user_meta.get('company_name'),
                    'production_role': user_meta.get('production_role'),
                    'production_role_other': user_meta.get('production_role_other'),
                }
                insert_response = supabase.table('profiles').insert(profile_to_create).execute()
                if insert_response.data:
                    return insert_response.data[0]
                else:
                    raise HTTPException(status_code=500, detail="Failed to create user profile after not finding one.")
            except Exception as creation_error:
                raise HTTPException(status_code=500, detail=f"Profile creation failed: {str(creation_error)}")
        else:
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred while fetching profile: {str(e)}")

@router.post("/profile", response_model=UserProfile, tags=["User Profile"])
async def update_profile(profile_data: UserProfileUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates the profile for the authenticated user."""
    try:
        update_data = profile_data.model_dump(exclude_unset=True)
        response = supabase.table('profiles').update(update_data).eq('id', user.id).execute()
        
        if response.data:
            return response.data[0]
        raise HTTPException(status_code=404, detail="Profile not found to update.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/profile", status_code=204, tags=["User Profile"])
async def delete_account(user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Deletes the authenticated user's account and profile."""
    try:
        # This calls a custom database function to perform the deletion
        # with elevated privileges.
        supabase.rpc('delete_user', {}).execute()
        return
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {str(e)}")

# --- SSO Configuration Endpoints ---
@router.get("/sso_config", response_model=SSOConfig, tags=["SSO"])
async def get_sso_config(user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves the SSO configuration for the authenticated user."""
    try:
        response = supabase.table('sso_configs').select('*').eq('id', user.id).single().execute()
        return response.data
    except Exception:
        return SSOConfig(id=user.id, provider='authentik', config={})


@router.post("/sso_config", tags=["SSO"])
async def update_sso_config(sso_data: SSOConfig, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates or updates the SSO configuration for the authenticated user."""
    try:
        response = supabase.table('sso_configs').upsert({
            'id': user.id,
            'provider': sso_data.provider,
            'config': sso_data.config
        }).execute()
        
        if response.data:
            return response.data[0]
        raise HTTPException(status_code=500, detail="Failed to save SSO configuration.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Show Management Endpoints ---

@router.post("/shows/{show_name}", tags=["Shows"])
async def create_or_update_show(show_name: str, show_data: ShowFile, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new show or updates an existing one for the authenticated user."""
    try:
        response = supabase.table('shows').upsert({
            'name': show_name,
            'data': show_data.model_dump(mode='json'),
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
    """Lists all shows for the authenticated user, including their logo paths."""
    try:
        response = supabase.table('shows').select('name, data').eq('user_id', user.id).execute()
        if not response.data:
            return []
        
        shows_with_logos = []
        for item in response.data:
            logo_path = item.get('data', {}).get('info', {}).get('logo_path')
            shows_with_logos.append({'name': item['name'], 'logo_path': logo_path})
            
        return shows_with_logos
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

# --- AV Rack Endpoints ---

@router.post("/racks", response_model=Rack, tags=["Racks"])
async def create_rack(rack_data: RackCreate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    try:
        full_rack_data = rack_data.model_dump()
        full_rack_data['user_id'] = str(user.id)
        
        response = supabase.table('racks').insert(full_rack_data).execute()
        if response.data:
            new_rack = response.data[0]
            new_rack['equipment'] = [] # Start with an empty equipment list
            return new_rack
        raise HTTPException(status_code=500, detail="Failed to create rack.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/racks", response_model=List[Rack], tags=["Racks"])
async def list_racks(show_name: Optional[str] = None, from_library: bool = False, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    query = supabase.table('racks').select('*').eq('user_id', user.id)
    if show_name:
        query = query.eq('show_name', show_name)
    if from_library:
        query = query.eq('saved_to_library', True)
    
    response = query.execute()
    return response.data

@router.get("/racks/{rack_id}", response_model=Rack, tags=["Racks"])
async def get_rack(rack_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    response = supabase.table('racks').select('*').eq('id', rack_id).eq('user_id', user.id).single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Rack not found")
    
    # Fetch equipment instances for this rack
    equipment_response = supabase.table('rack_equipment_instances').select('*').eq('rack_id', rack_id).execute()
    rack_data = response.data
    rack_data['equipment'] = equipment_response.data
    return rack_data

@router.put("/racks/{rack_id}", response_model=Rack, tags=["Racks"])
async def update_rack(rack_id: uuid.UUID, rack_update: RackUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    update_data = rack_update.model_dump(exclude_unset=True)
    response = supabase.table('racks').update(update_data).eq('id', rack_id).eq('user_id', user.id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Rack not found to update")
    return response.data[0]

# --- Equipment Endpoints ---

@router.post("/racks/{rack_id}/equipment", response_model=RackEquipmentInstance, tags=["Racks"])
async def add_equipment_to_rack(rack_id: uuid.UUID, equipment_data: RackEquipmentInstanceCreate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    # Verify user owns the rack first
    rack_response = supabase.table('racks').select('id').eq('id', str(rack_id)).eq('user_id', str(user.id)).single().execute()
    if not rack_response.data:
        raise HTTPException(status_code=404, detail="Rack not found or access denied")

    full_equipment_data = equipment_data.model_dump()
    full_equipment_data['rack_id'] = str(rack_id)
    full_equipment_data['template_id'] = str(full_equipment_data['template_id']) # Ensure UUID is string
    
    response = supabase.table('rack_equipment_instances').insert(full_equipment_data).execute()
    if response.data:
        return response.data[0]
    raise HTTPException(status_code=500, detail="Failed to add equipment to rack.")


@router.delete("/racks/equipment/{instance_id}", status_code=204, tags=["Racks"])
async def remove_equipment_from_rack(instance_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    # A more complex query is needed here to ensure the user owns the rack associated with the equipment instance
    # This might be better handled by a database function (e.g., RLS)
    # For now, we'll do a simple delete and rely on frontend logic to be correct.
    supabase.table('rack_equipment_instances').delete().eq('id', instance_id).execute()
    return

# --- File Upload Endpoint ---

@router.post("/upload/logo", tags=["File Upload"])
async def upload_logo(file: UploadFile = File(...), user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Uploads a logo for the authenticated user."""
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image.")
    
    try:
        filename = os.path.basename(file.filename)
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
    placement: Optional[Dict[str, int]] = None

class CaseLabelPayload(BaseModel):
    labels: List[CaseLabel]
    logo_path: Optional[str] = None
    placement: Optional[Dict[str, int]] = None

@router.post("/pdf/loom-labels", tags=["PDF Generation"])
async def create_loom_label_pdf(payload: LoomLabelPayload, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    pdf_buffer = generate_loom_label_pdf(payload.labels, payload.placement)
    return Response(content=pdf_buffer.getvalue(), media_type="application/pdf")

@router.post("/pdf/case-labels", tags=["PDF Generation"])
async def create_case_label_pdf(payload: CaseLabelPayload, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    logo_bytes = None
    if payload.logo_path:
        try:
            response = supabase.storage.from_('logos').download(payload.logo_path)
            logo_bytes = response
        except Exception as e:
            print(f"Could not download logo: {e}")

    pdf_buffer = generate_case_label_pdf(payload.labels, logo_bytes, payload.placement)
    return Response(content=pdf_buffer.getvalue(), media_type="application/pdf")