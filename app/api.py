import os
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Response
from fastapi.responses import JSONResponse
from supabase import create_client, Client
from gotrue.errors import AuthApiError
import io
from pydantic import BaseModel
import uuid

# Import all necessary models, including the previously missing ones
from .models import (
    ShowFile, LoomLabel, CaseLabel, UserProfile, UserProfileUpdate, SSOConfig,
    Rack, RackUpdate, EquipmentTemplate, EquipmentTemplateCreate, RackEquipmentInstance, RackCreate,
    RackEquipmentInstanceCreate, RackEquipmentInstanceUpdate, Folder, FolderCreate,
    Connection, ConnectionCreate, ConnectionUpdate, PortTemplate,
    FolderUpdate, EquipmentTemplateUpdate, EquipmentCopy, RackLoad,
    UserFolderUpdate, UserEquipmentTemplateUpdate
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

# --- Admin Authentication Dependency ---
async def get_admin_user(user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Dependency that checks if the user has the 'admin' role."""
    try:
        profile_response = supabase.table('profiles').select('role').eq('id', user.id).single().execute()
        if not profile_response.data or profile_response.data.get('role') != 'admin':
            raise HTTPException(status_code=403, detail="User is not an administrator.")
        return user
    except Exception:
        raise HTTPException(status_code=403, detail="Forbidden: Admin access required.")

# --- Admin Library Management Endpoints ---
@router.post("/admin/folders", tags=["Admin"], response_model=Folder)
async def create_default_folder(folder_data: FolderCreate, admin_user = Depends(get_admin_user), supabase: Client = Depends(get_supabase_client)):
    """Admin: Creates a new default library folder."""
    insert_data = {
        "name": folder_data.name,
        "is_default": True,
        "nomenclature_prefix": folder_data.nomenclature_prefix
    }
    if folder_data.parent_id:
        insert_data["parent_id"] = str(folder_data.parent_id)

    response = supabase.table('folders').insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create folder.")
    return response.data[0]

@router.post("/admin/equipment", tags=["Admin"], response_model=EquipmentTemplate)
async def create_default_equipment(
    equipment_data: EquipmentTemplateCreate,
    admin_user=Depends(get_admin_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Admin: Creates a new default equipment template."""
    ports_data = [p.model_dump(mode='json') for p in equipment_data.ports]

    insert_data = {
        "model_number": equipment_data.model_number,
        "manufacturer": equipment_data.manufacturer,
        "ru_height": equipment_data.ru_height,
        "width": equipment_data.width,
        "ports": ports_data,
        "is_default": True,
    }
    if equipment_data.folder_id:
        insert_data["folder_id"] = str(equipment_data.folder_id)
        
    response = supabase.table('equipment_templates').insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create equipment template.")
    return response.data[0]

@router.get("/admin/library", tags=["Admin"])
async def get_admin_library(admin_user = Depends(get_admin_user), supabase: Client = Depends(get_supabase_client)):
    """Admin: Fetches the default library tree for the admin panel."""
    try:
        folders_response = supabase.table('folders').select('*').eq('is_default', True).execute()
        equipment_response = supabase.table('equipment_templates').select('*').eq('is_default', True).execute()
        return {
            "folders": folders_response.data,
            "equipment": equipment_response.data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch library data: {str(e)}")


# --- Profile Management Endpoints ---
@router.get("/profile", response_model=UserProfile, tags=["User Profile"])
async def get_profile(user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves the profile for the authenticated user."""
    try:
        response = supabase.table('profiles').select('*').eq('id', user.id).single().execute()
        
        if not response.data:
            user_meta = user.user_metadata or {}
            profile_to_create = {
                'id': str(user.id),
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
                raise HTTPException(status_code=500, detail="Failed to create user profile.")

        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

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
            'id': str(user.id),
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
            'user_id': str(user.id)
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
        
        # If no show_name is provided, it's a library rack template
        if not full_rack_data.get('show_name'):
            full_rack_data['saved_to_library'] = True

        response = supabase.table('racks').insert(full_rack_data).execute()

        if response.data:
            new_rack = response.data[0]
            new_rack['equipment'] = []
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
    
    equipment_response = supabase.table('rack_equipment_instances').select('*, equipment_templates(*)').eq('rack_id', rack_id).execute()
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

@router.delete("/racks/{rack_id}", status_code=204, tags=["Racks"])
async def delete_rack(rack_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    # Verify the user owns the rack before deleting
    rack_to_delete = supabase.table('racks').select('id').eq('id', str(rack_id)).eq('user_id', str(user.id)).single().execute()
    if not rack_to_delete.data:
        raise HTTPException(status_code=404, detail="Rack not found or you do not have permission to delete it.")

    supabase.table('racks').delete().eq('id', str(rack_id)).execute()
    return

@router.post("/racks/load_from_library", response_model=Rack, tags=["Racks"])
async def load_rack_from_library(load_data: RackLoad, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Loads a rack from the user's library into a show."""
    try:
        template_res = supabase.table('racks').select('*').eq('id', str(load_data.template_rack_id)).eq('user_id', str(user.id)).eq('saved_to_library', True).single().execute()
        if not template_res.data:
            raise HTTPException(status_code=404, detail="Library rack not found.")
        template_rack = template_res.data

        template_equip_res = supabase.table('rack_equipment_instances').select('*').eq('rack_id', str(template_rack['id'])).execute()
        template_equipment = template_equip_res.data

        new_rack_data = {
            "rack_name": f"{template_rack['rack_name']} (Copy)",
            "ru_height": template_rack['ru_height'],
            "show_name": load_data.show_name,
            "user_id": str(user.id),
            "saved_to_library": False
        }
        new_rack_res = supabase.table('racks').insert(new_rack_data).execute()
        if not new_rack_res.data:
            raise HTTPException(status_code=500, detail="Failed to create new rack copy.")
        new_rack = new_rack_res.data[0]

        if template_equipment:
            new_equipment_to_create = [
                {
                    "rack_id": new_rack['id'],
                    "template_id": item['template_id'],
                    "ru_position": item['ru_position'],
                    "instance_name": item['instance_name'],
                    "rack_side": item['rack_side'],
                    "ip_address": item['ip_address'],
                    "x_pos": item['x_pos'],
                    "y_pos": item['y_pos']
                } for item in template_equipment
            ]
            
            new_equip_res = supabase.table('rack_equipment_instances').insert(new_equipment_to_create).execute()
            if not new_equip_res.data:
                supabase.table('racks').delete().eq('id', new_rack['id']).execute()
                raise HTTPException(status_code=500, detail="Failed to copy equipment to new rack.")
            
            new_rack['equipment'] = new_equip_res.data
        else:
            new_rack['equipment'] = []

        return new_rack

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Equipment Endpoints ---
@router.post("/racks/{rack_id}/equipment", response_model=RackEquipmentInstance, tags=["Racks"])
async def add_equipment_to_rack(
    rack_id: uuid.UUID, 
    equipment_data: RackEquipmentInstanceCreate, 
    user = Depends(get_user), 
    supabase: Client = Depends(get_supabase_client)
):
    rack_res = supabase.table('racks').select('id, ru_height').eq('id', str(rack_id)).eq('user_id', str(user.id)).single().execute()
    if not rack_res.data:
        raise HTTPException(status_code=404, detail="Rack not found or access denied")

    template_res = supabase.table('equipment_templates').select('*, folders(nomenclature_prefix)').eq('id', str(equipment_data.template_id)).single().execute()
    if not template_res.data:
        raise HTTPException(status_code=404, detail="Equipment template not found")
        
    template = template_res.data
    
    existing_equipment_res = supabase.table('rack_equipment_instances').select('*, equipment_templates(width, ru_height)').eq('rack_id', str(rack_id)).execute()
    existing_equipment = existing_equipment_res.data

    new_item_end = equipment_data.ru_position + template['ru_height'] - 1
    if new_item_end > rack_res.data['ru_height']:
        raise HTTPException(status_code=400, detail="Equipment does not fit in the rack at this position.")

    for item in existing_equipment:
        item_end = item['ru_position'] + item['equipment_templates']['ru_height'] - 1
        if max(equipment_data.ru_position, item['ru_position']) <= min(new_item_end, item_end):
            is_new_full = template['width'] == 'full'
            is_item_full = item['equipment_templates']['width'] == 'full'
            
            if is_new_full or is_item_full:
                raise HTTPException(status_code=409, detail="A full-width item conflicts with the desired placement.")
            if equipment_data.rack_side == item['rack_side']:
                raise HTTPException(status_code=409, detail=f"The {equipment_data.rack_side} side is already occupied in this RU range.")

    prefix = template.get('folders', {}).get('nomenclature_prefix') if template.get('folders') else None
    base_name = prefix if prefix else template['model_number']
    
    highest_num = 0
    for item in existing_equipment:
        if item['instance_name'].startswith(base_name + "-"):
            try:
                num = int(item['instance_name'].split('-')[-1])
                if num > highest_num:
                    highest_num = num
            except (ValueError, IndexError):
                continue
    
    new_instance_name = f"{base_name}-{highest_num + 1}"

    insert_data = {
        "rack_id": str(rack_id),
        "template_id": str(equipment_data.template_id),
        "ru_position": equipment_data.ru_position,
        "rack_side": equipment_data.rack_side,
        "instance_name": new_instance_name
        
    }
    
    response = supabase.table('rack_equipment_instances').insert(insert_data).execute()
    if response.data:
        return response.data[0]
    raise HTTPException(status_code=500, detail="Failed to add equipment to rack.")

@router.put("/racks/equipment/{instance_id}", response_model=RackEquipmentInstance, tags=["Racks"])
async def update_equipment_instance(instance_id: uuid.UUID, update_data: RackEquipmentInstanceUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates the position, side, or IP address of a rack equipment instance."""
    
    try:
        owner_check_res = supabase.table('rack_equipment_instances').select('racks(user_id)').eq('id', str(instance_id)).single().execute()
        
        if not owner_check_res.data or not owner_check_res.data.get('racks'):
            raise HTTPException(status_code=404, detail="Equipment instance not found.")

        if str(owner_check_res.data['racks']['user_id']) != str(user.id):
            raise HTTPException(status_code=403, detail="Not authorized to update this equipment instance.")

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        print(f"Error during ownership check: {e}")
        raise HTTPException(status_code=500, detail="An error occurred while verifying equipment ownership.")

    update_dict = update_data.model_dump(exclude_unset=True)
    
    response = supabase.table('rack_equipment_instances').update(update_dict).eq('id', str(instance_id)).execute()
    
    if response.data:
        return response.data[0]
    
    raise HTTPException(status_code=404, detail="Equipment instance not found or update failed.")

@router.delete("/racks/equipment/{instance_id}", status_code=204, tags=["Racks"])
async def remove_equipment_from_rack(instance_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    check_owner = supabase.table('rack_equipment_instances').select('rack_id').eq('id', str(instance_id)).single().execute()
    if check_owner.data:
        rack_id = check_owner.data['rack_id']
        is_owner = supabase.table('racks').select('user_id').eq('id', rack_id).eq('user_id', str(user.id)).single().execute()
        if not is_owner.data:
            raise HTTPException(status_code=403, detail="Not authorized to delete this equipment instance.")
            
    supabase.table('rack_equipment_instances').delete().eq('id', str(instance_id)).execute()
    return

# --- Library Management Endpoints ---
@router.get("/library", tags=["Library"])
async def get_library(user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Fetches the entire library tree for the logged-in user."""
    try:
        folders_response = supabase.table('folders').select('*').or_(f'user_id.eq.{user.id},is_default.eq.true').execute()
        equipment_response = supabase.table('equipment_templates').select('*').or_(f'user_id.eq.{user.id},is_default.eq.true').execute()
        return { "folders": folders_response.data, "equipment": equipment_response.data }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch library data: {str(e)}")

@router.post("/library/folders", tags=["User Library"], response_model=Folder)
async def create_user_folder(folder_data: FolderCreate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new folder in the user's personal library."""
    insert_data = {
        "name": folder_data.name,
        "is_default": False,
        "user_id": str(user.id),
        "nomenclature_prefix": folder_data.nomenclature_prefix
    }
    if folder_data.parent_id:
        insert_data["parent_id"] = str(folder_data.parent_id)

    response = supabase.table('folders').insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create folder.")
    return response.data[0]

@router.put("/library/folders/{folder_id}", tags=["User Library"], response_model=Folder)
async def update_user_folder(folder_id: uuid.UUID, folder_data: UserFolderUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates a folder in the user's personal library."""
    update_dict = folder_data.model_dump(exclude_unset=True)
    if 'parent_id' in update_dict and update_dict['parent_id'] is not None:
        update_dict['parent_id'] = str(update_dict['parent_id'])

    response = supabase.table('folders').update(update_dict).eq('id', str(folder_id)).eq('user_id', str(user.id)).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Folder not found or you do not have permission to edit it.")
    return response.data[0]

@router.delete("/library/folders/{folder_id}", status_code=204, tags=["User Library"])
async def delete_user_folder(folder_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Deletes a folder from the user's personal library."""
    
    # Check ownership
    folder_to_delete = supabase.table('folders').select('id').eq('id', str(folder_id)).eq('user_id', str(user.id)).single().execute()
    if not folder_to_delete.data:
        raise HTTPException(status_code=404, detail="Folder not found or you do not have permission to delete it.")

    # Check for contents
    subfolder_res = supabase.table('folders').select('id', count='exact').eq('parent_id', str(folder_id)).execute()
    if subfolder_res.count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete a folder that contains subfolders.")

    equipment_res = supabase.table('equipment_templates').select('id', count='exact').eq('folder_id', str(folder_id)).execute()
    if equipment_res.count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete a folder that contains equipment.")
        
    supabase.table('folders').delete().eq('id', str(folder_id)).eq('user_id', str(user.id)).execute()
    return

@router.post("/library/equipment", tags=["User Library"], response_model=EquipmentTemplate)
async def create_user_equipment(equipment_data: EquipmentTemplateCreate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new equipment template in the user's personal library."""
    ports_data = [p.model_dump(mode='json') for p in equipment_data.ports]
    insert_data = {
        "model_number": equipment_data.model_number,
        "manufacturer": equipment_data.manufacturer,
        "ru_height": equipment_data.ru_height,
        "width": equipment_data.width,
        "ports": ports_data,
        "is_default": False,
        "user_id": str(user.id)
    }
    if equipment_data.folder_id:
        insert_data["folder_id"] = str(equipment_data.folder_id)
        
    response = supabase.table('equipment_templates').insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create equipment template.")
    return response.data[0]

@router.put("/library/equipment/{equipment_id}", tags=["User Library"], response_model=EquipmentTemplate)
async def update_user_equipment(equipment_id: uuid.UUID, equipment_data: UserEquipmentTemplateUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates an equipment template in the user's personal library."""
    update_dict = equipment_data.model_dump(exclude_unset=True)
    if 'folder_id' in update_dict and update_dict['folder_id'] is not None:
        update_dict['folder_id'] = str(update_dict['folder_id'])

    response = supabase.table('equipment_templates').update(update_dict).eq('id', str(equipment_id)).eq('user_id', str(user.id)).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Equipment not found or you do not have permission to edit it.")
    return response.data[0]

@router.delete("/library/equipment/{equipment_id}", status_code=204, tags=["User Library"])
async def delete_user_equipment(equipment_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Deletes an equipment template from the user's personal library."""
    supabase.table('equipment_templates').delete().eq('id', str(equipment_id)).eq('user_id', str(user.id)).execute()
    return

@router.post("/library/copy_equipment", tags=["Library"], response_model=EquipmentTemplate)
async def copy_equipment_to_user_library(copy_data: EquipmentCopy, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Copies a default equipment template to the user's library."""
    original_res = supabase.table('equipment_templates').select('*').eq('id', str(copy_data.template_id)).eq('is_default', True).single().execute()
    if not original_res.data:
        raise HTTPException(status_code=404, detail="Default equipment template not found.")
    
    original_template = original_res.data
    new_template_data = {
        "model_number": f"{original_template['model_number']} (Copy)",
        "manufacturer": original_template['manufacturer'],
        "ru_height": original_template['ru_height'],
        "width": original_template['width'],
        "ports": original_template['ports'],
        "is_default": False,
        "user_id": str(user.id),
        "folder_id": str(copy_data.folder_id) if copy_data.folder_id else None
    }
    
    response = supabase.table('equipment_templates').insert(new_template_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to copy equipment to user library.")
    return response.data[0]

# --- Wire Diagram Endpoints ---
@router.post("/connections", tags=["Wire Diagram"])
async def create_connection(connection_data: ConnectionCreate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new connection between two equipment ports."""
    try:
        source_device_res = supabase.table('rack_equipment_instances').select('rack_id').eq('id', str(connection_data.source_device_id)).single().execute()
        dest_device_res = supabase.table('rack_equipment_instances').select('rack_id').eq('id', str(connection_data.destination_device_id)).single().execute()
        
        if not source_device_res.data or not dest_device_res.data:
            raise HTTPException(status_code=404, detail="Source or destination device not found.")
            
        show_id_res = supabase.table('racks').select('show_name, user_id').eq('id', source_device_res.data['rack_id']).single().execute()
        if not show_id_res.data or show_id_res.data['user_id'] != str(user.id):
            raise HTTPException(status_code=403, detail="Not authorized to create a connection in this show.")

        insert_data = connection_data.model_dump()
        insert_data['show_id'] = show_id_res.data['show_name']
        
        response = supabase.table('connections').insert(insert_data).execute()
        if response.data:
            return response.data[0]
        raise HTTPException(status_code=500, detail="Failed to create connection.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/connections/{show_name}", tags=["Wire Diagram"])
async def get_connections_for_show(show_name: str, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves all connections for a specific show."""
    try:
        response = supabase.table('connections').select('*').eq('show_id', show_name).execute()
        connections = response.data or []
        
        device_ids = {c['source_device_id'] for c in connections} | {c['destination_device_id'] for c in connections}
        equipment_map = {}
        if device_ids:
            equipment_res = supabase.table('rack_equipment_instances').select('id, instance_name, ip_address, equipment_templates(model_number, ports)').in_('id', list(device_ids)).execute()
            equipment_map = {e['id']: e for e in equipment_res.data}
        
        return {"connections": connections, "equipment": equipment_map}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch connections: {str(e)}")

@router.put("/connections/{connection_id}", tags=["Wire Diagram"])
async def update_connection(connection_id: uuid.UUID, update_data: ConnectionUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates a connection's details."""
    try:
        update_dict = update_data.model_dump(exclude_unset=True)
        response = supabase.table('connections').update(update_dict).eq('id', str(connection_id)).execute()
        if response.data:
            return response.data[0]
        raise HTTPException(status_code=404, detail="Connection not found or update failed.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/connections/{connection_id}", status_code=204, tags=["Wire Diagram"])
async def delete_connection(connection_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Deletes a specific connection."""
    conn_res = supabase.table('connections').select('show_id').eq('id', str(connection_id)).single().execute()
    if conn_res.data:
        show_name = conn_res.data['show_id']
        is_owner = supabase.table('shows').select('user_id').eq('name', show_name).eq('user_id', str(user.id)).single().execute()
        if not is_owner.data:
            raise HTTPException(status_code=403, detail="Not authorized to delete this connection.")
            
    supabase.table('connections').delete().eq('id', str(connection_id)).execute()
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

        file_path_in_bucket = f"{user.id}/{uuid.uuid4()}-{safe_filename}"
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
async def create_loom_label_pdf(payload: LoomLabelPayload, user = Depends(get_user)):
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

@router.delete("/admin/folders/{folder_id}", status_code=204, tags=["Admin"])
async def delete_default_folder(
    folder_id: uuid.UUID,
    admin_user=Depends(get_admin_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Admin: Deletes a default library folder if it is empty."""
    subfolder_res = supabase.table('folders').select('id', count='exact').eq('parent_id', str(folder_id)).execute()
    if subfolder_res.count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete a folder that contains subfolders.")

    equipment_res = supabase.table('equipment_templates').select('id', count='exact').eq('folder_id', str(folder_id)).execute()
    if equipment_res.count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete a folder that contains equipment.")

    supabase.table('folders').delete().eq('id', str(folder_id)).eq('is_default', True).execute()
    return

@router.delete("/admin/equipment/{equipment_id}", status_code=204, tags=["Admin"])
async def delete_default_equipment(
    equipment_id: uuid.UUID,
    admin_user=Depends(get_admin_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Admin: Deletes a default equipment template."""
    supabase.table('equipment_templates').delete().eq('id', str(equipment_id)).eq('is_default', True).execute()
    return
    
@router.put("/admin/folders/{folder_id}", tags=["Admin"], response_model=Folder)
async def update_admin_folder(
    folder_id: uuid.UUID,
    folder_data: FolderUpdate,
    admin_user=Depends(get_admin_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Admin: Updates a default library folder, e.g., to change its parent."""
    update_dict = folder_data.model_dump(exclude_unset=True)
    
    if 'parent_id' in update_dict and update_dict['parent_id'] is not None:
        update_dict['parent_id'] = str(update_dict['parent_id'])

    response = supabase.table('folders').update(update_dict).eq('id', str(folder_id)).eq('is_default', True).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Folder not found or not a default folder.")
    return response.data[0]

@router.put("/admin/equipment/{equipment_id}", tags=["Admin"], response_model=EquipmentTemplate)
async def update_admin_equipment(
    equipment_id: uuid.UUID,
    equipment_data: EquipmentTemplateUpdate,
    admin_user=Depends(get_admin_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Admin: Updates a default equipment template, e.g., to change its folder."""
    update_dict = equipment_data.model_dump(exclude_unset=True)

    if 'folder_id' in update_dict and update_dict['folder_id'] is not None:
        update_dict['folder_id'] = str(update_dict['folder_id'])
    
    response = supabase.table('equipment_templates').update(update_dict).eq('id', str(equipment_id)).eq('is_default', True).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Equipment not found or not a default template.")
    return response.data[0]