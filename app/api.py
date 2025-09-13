import os
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Response, Header
from fastapi.responses import JSONResponse
from supabase import create_client, Client
from gotrue.errors import AuthApiError
import io
import traceback
from pydantic import BaseModel
import uuid
from html import escape

# Import all necessary models
from .models import (
    ShowFile, LoomLabel, CaseLabel, UserProfile, UserProfileUpdate, SSOConfig,
    Rack, RackUpdate, EquipmentTemplate, EquipmentTemplateCreate, RackEquipmentInstance, RackCreate,
    RackEquipmentInstanceCreate, RackEquipmentInstanceUpdate, Folder, FolderCreate,
    Connection, ConnectionCreate, ConnectionUpdate, PortTemplate,
    FolderUpdate, EquipmentTemplateUpdate, EquipmentCopy, RackLoad,
    UserFolderUpdate, UserEquipmentTemplateUpdate, WireDiagramPDFPayload, RackEquipmentInstanceWithTemplate,
    SenderIdentity, SenderIdentityCreate, SenderIdentityPublic, RackPDFPayload
)
from .pdf_utils import generate_loom_label_pdf, generate_case_label_pdf, generate_wire_diagram_pdf, generate_racks_pdf
from .email_utils import create_email_html, send_email
from typing import List, Dict, Optional

router = APIRouter()

# --- Supabase Configuration ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
BUCKET_NAME = "logos"

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

# --- Token Dependency for File Uploads ---
async def get_user_from_token(authorization: str = Header(...), supabase: Client = Depends(get_supabase_client)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header missing or invalid")
    token = authorization.split(" ")[1]
    try:
        user_response = supabase.auth.get_user(token)
        return user_response.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token for user")


# --- Admin Authentication Dependency ---
async def get_admin_user(user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Dependency that checks if the user has the 'admin' role."""
    try:
        # Check if the user has the 'admin' role in the user_roles table
        user_roles_res = supabase.table('user_roles').select('roles(name)').eq('user_id', user.id).execute()
        
        if not user_roles_res.data:
            raise HTTPException(status_code=403, detail="User has no assigned roles.")

        roles = [role['roles']['name'] for role in user_roles_res.data if 'roles' in role and role['roles']]
        
        if 'admin' not in roles:
            raise HTTPException(status_code=403, detail="User is not an administrator.")
            
        return user
    except Exception as e:
        # Log the exception for debugging purposes
        traceback.print_exc()
        raise HTTPException(status_code=403, detail="Forbidden: Admin access required.")

from .email_utils import create_email_html, send_email
# --- Email Payload Model ---
class AdminEmailPayload(BaseModel):
    sender_id: uuid.UUID
    to_role: str
    subject: str
    body: str

class NewUser(BaseModel):
    name: str
    email: str

class NewUserListPayload(BaseModel):
    sender_id: uuid.UUID
    recipients: List[NewUser]
    subject: str
    body: str

# --- Admin Endpoints ---
@router.post("/admin/send-new-user-list-email", tags=["Admin"])
async def admin_send_new_user_list_email(payload: NewUserListPayload, admin_user = Depends(get_admin_user), supabase: Client = Depends(get_supabase_client)):
    """Admin: Sends a personalized email to a list of specified new users."""
    try:
        # Fetch the selected sender identity
        sender_res = supabase.table('sender_identities').select('*').eq('id', str(payload.sender_id)).single().execute()
        if not sender_res.data:
            raise HTTPException(status_code=404, detail="Sender identity not found.")
        sender = SenderIdentity(**sender_res.data)

        sent_count = 0
        failed_count = 0

        for recipient in payload.recipients:
            try:
                # Create a personalized user profile for the email template
                user_profile = {"first_name": recipient.name}
                html_content = create_email_html(user_profile, payload.body)
                
                send_email(recipient.email, payload.subject, html_content, sender)
                sent_count += 1
            except Exception as e:
                print(f"Failed to send email to {recipient.email}: {e}")
                failed_count += 1
        
        return {"message": f"Email process completed. Sent: {sent_count}, Failed: {failed_count}."}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"An error occurred while sending emails: {str(e)}")

@router.post("/admin/send-email", tags=["Admin"])
async def admin_send_email(payload: AdminEmailPayload, admin_user = Depends(get_admin_user), supabase: Client = Depends(get_supabase_client)):
    """Admin: Sends an email to users based on their role."""
    try:
        # Fetch the selected sender identity
        sender_res = supabase.table('sender_identities').select('*').eq('id', str(payload.sender_id)).single().execute()
        if not sender_res.data:
            raise HTTPException(status_code=404, detail="Sender identity not found.")
        sender = SenderIdentity(**sender_res.data)

        # 1. Fetch users based on role criteria
        if payload.to_role == "all":
            profiles_res = supabase.table('profiles').select('*').execute()
            recipient_profiles = profiles_res.data
        else:
            # Find the role_id for the given role name
            role_res = supabase.table('roles').select('id').eq('name', payload.to_role).single().execute()
            if not role_res.data:
                raise HTTPException(status_code=404, detail=f"Role '{payload.to_role}' not found.")
            role_id = role_res.data['id']
            
            # Find all user_ids with that role
            user_roles_res = supabase.table('user_roles').select('user_id').eq('role_id', role_id).execute()
            if not user_roles_res.data:
                 return JSONResponse(content={"message": f"No users found with the role '{payload.to_role}'. No emails sent."}, status_code=200)
            
            user_ids = [item['user_id'] for item in user_roles_res.data]
            
            # Fetch the profiles for those user_ids
            profiles_res = supabase.table('profiles').select('*').in_('id', user_ids).execute()
            recipient_profiles = profiles_res.data

        if not recipient_profiles:
            return JSONResponse(content={"message": f"No users found with the role '{payload.to_role}'. No emails sent."}, status_code=200)
        
        # 2. Get all users from auth schema to create an email lookup map
        all_users_res = supabase.auth.admin.list_users()
        # Corrected line: Iterate directly over the response, as it appears to be a list
        email_map = {user.id: user.email for user in all_users_res}

        sent_count = 0
        failed_count = 0
        for profile in recipient_profiles:
            user_id = profile.get('id')
            user_email = email_map.get(user_id)
            
            if user_email:
                try:
                    html_content = create_email_html(profile, payload.body)
                    send_email(user_email, payload.subject, html_content, sender)
                    sent_count += 1
                except Exception as e:
                    print(f"Failed to send email to {user_email}: {e}")
                    failed_count += 1
        
        return {"message": f"Email process completed. Sent: {sent_count}, Failed: {failed_count}."}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"An error occurred while sending emails: {str(e)}")


@router.get("/admin/user-roles", tags=["Admin"])
async def get_user_roles(admin_user = Depends(get_admin_user), supabase: Client = Depends(get_supabase_client)):
    """Admin: Gets a list of all unique user roles for the email composer."""
    try:
        roles_response = supabase.table('roles').select('name').execute()
        if not roles_response.data:
            return {"roles": []}
        
        all_roles = sorted([role['name'] for role in roles_response.data])
        return {"roles": all_roles}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch roles: {str(e)}")

# --- Sender Identity Management ---
@router.get("/admin/senders", tags=["Admin"], response_model=List[SenderIdentityPublic])
async def get_senders(admin_user=Depends(get_admin_user), supabase: Client = Depends(get_supabase_client)):
    response = supabase.table('sender_identities').select('id, name, email, sender_login_email').execute()
    return response.data

@router.post("/admin/senders", tags=["Admin"], response_model=SenderIdentity)
async def create_sender(sender_data: SenderIdentityCreate, admin_user=Depends(get_admin_user), supabase: Client = Depends(get_supabase_client)):
    response = supabase.table('sender_identities').insert(sender_data.model_dump()).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create sender identity.")
    return response.data[0]

@router.delete("/admin/senders/{sender_id}", tags=["Admin"], status_code=204)
async def delete_sender(sender_id: uuid.UUID, admin_user=Depends(get_admin_user), supabase: Client = Depends(get_supabase_client)):
    supabase.table('sender_identities').delete().eq('id', str(sender_id)).execute()
    return

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

# --- Admin User Management ---
class UserWithProfile(UserProfile):
    email: str
    
@router.get("/admin/users", tags=["Admin"], response_model=List[UserWithProfile])
async def get_all_users(admin_user=Depends(get_admin_user), supabase: Client = Depends(get_supabase_client)):
    try:
        auth_users_res = supabase.auth.admin.list_users()
        auth_users_map = {user.id: user for user in auth_users_res}
        
        profiles_res = supabase.table('profiles').select('*').in_('id', list(auth_users_map.keys())).execute()
        
        roles_res = supabase.table('user_roles').select('user_id, roles(name)').execute()
        roles_map = {}
        for item in roles_res.data:
            if item['user_id'] not in roles_map:
                roles_map[item['user_id']] = []
            if item.get('roles'):
                roles_map[item['user_id']].append(item['roles']['name'])

        users_with_profiles = []
        for profile in profiles_res.data:
            user_id = profile['id']
            auth_user = auth_users_map.get(user_id)
            if auth_user:
                user_data = {
                    **profile,
                    "email": auth_user.email,
                    "roles": roles_map.get(user_id, [])
                }
                users_with_profiles.append(UserWithProfile(**user_data))
                
        return users_with_profiles
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch users: {str(e)}")

class UserRolesUpdate(BaseModel):
    roles: List[str]

@router.put("/admin/users/{user_id}/roles", tags=["Admin"], status_code=204)
async def update_user_roles(user_id: uuid.UUID, payload: UserRolesUpdate, admin_user=Depends(get_admin_user), supabase: Client = Depends(get_supabase_client)):
    try:
        # Get all role IDs from the roles table
        all_roles_res = supabase.table('roles').select('id, name').execute()
        role_name_to_id = {role['name']: role['id'] for role in all_roles_res.data}
        
        # Validate that all provided roles exist
        for role_name in payload.roles:
            if role_name not in role_name_to_id:
                raise HTTPException(status_code=400, detail=f"Role '{role_name}' does not exist.")
        
        # Delete existing roles for the user
        supabase.table('user_roles').delete().eq('user_id', str(user_id)).execute()
        
        # Insert new roles
        if payload.roles:
            new_user_roles = [
                {'user_id': str(user_id), 'role_id': role_name_to_id[role_name]}
                for role_name in payload.roles
            ]
            supabase.table('user_roles').insert(new_user_roles).execute()
            
        return
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to update user roles: {str(e)}")

# --- Admin Metrics ---
@router.get("/admin/metrics", tags=["Admin"])
async def get_metrics(admin_user=Depends(get_admin_user), supabase: Client = Depends(get_supabase_client)):
    # This is a placeholder. In a real application, you would query the database for these metrics.
    user_count_res = supabase.table('profiles').select('id', count='exact').execute()
    shows_count_res = supabase.table('shows').select('name', count='exact').execute()
    racks_count_res = supabase.table('racks').select('id', count='exact').execute()

    # This is a complex query, so for now we'll just return a placeholder
    most_used_equipment = "Shure ULXD4Q"
    custom_items_created = 150 # Placeholder

    return {
        "userCount": user_count_res.count,
        "signUps": 0, # Placeholder, would need to query by created_at
        "showsCount": shows_count_res.count,
        "racksCount": racks_count_res.count,
        "mostUsedEquipment": most_used_equipment,
        "customItemsCreated": custom_items_created
    }


# --- Profile Management Endpoints ---
@router.get("/profile", response_model=UserProfile, tags=["User Profile"])
async def get_profile(user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves the profile for the authenticated user, including their roles."""
    try:
        # Fetch profile and roles sequentially
        profile_res = supabase.table('profiles').select('*').eq('id', user.id).single().execute()
        roles_res = supabase.table('user_roles').select('roles(name)').eq('user_id', user.id).execute()

        profile_data = profile_res.data
        
        if not profile_data:
            # Create profile if it doesn't exist
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
            if not insert_response.data:
                 raise HTTPException(status_code=500, detail="Failed to create user profile.")
            profile_data = insert_response.data[0]

        # Extract role names
        roles = [role['roles']['name'] for role in roles_res.data if 'roles' in role and role['roles']]
        profile_data['roles'] = roles

        return profile_data
    except Exception as e:
        traceback.print_exc()
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

# --- File Upload Endpoint ---
@router.post("/upload/logo", tags=["File Upload"])
async def upload_logo(file: UploadFile = File(...), user = Depends(get_user_from_token), supabase: Client = Depends(get_supabase_client)):
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
        
        supabase.storage.from_(BUCKET_NAME).upload(
            path=file_path_in_bucket,
            file=file_content,
            file_options={'cache-control': '3600', 'upsert': 'true'}
        )
        
        return JSONResponse(content={"logo_path": file_path_in_bucket})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logo upload failed: {str(e)}")

# --- AV Rack Endpoints ---
@router.post("/racks", response_model=Rack, tags=["Racks"])
async def create_rack(rack_data: RackCreate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    try:
        full_rack_data = rack_data.model_dump()
        full_rack_data['user_id'] = str(user.id)
        
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
    # 1. Get the rack data
    response = supabase.table('racks').select('*').eq('id', str(rack_id)).eq('user_id', str(user.id)).single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Rack not found or you do not have permission to view it.")
    
    rack_data = response.data
    
    # 2. Get all equipment instances for the rack
    equipment_response = supabase.table('rack_equipment_instances').select('*').eq('rack_id', str(rack_id)).execute()
    equipment_instances = equipment_response.data if equipment_response.data else []
    
    if not equipment_instances:
        rack_data['equipment'] = []
        return rack_data
        
    # 3. Get unique template IDs
    template_ids = list(set(item['template_id'] for item in equipment_instances))
    
    # 4. Query for all needed templates
    templates_response = supabase.table('equipment_templates').select('*').in_('id', template_ids).execute()
    templates_data = templates_response.data if templates_response.data else []
    
    # 5. Create a lookup map for easy access
    template_map = {template['id']: template for template in templates_data}
    
    # 6. Attach the full template data to each equipment instance
    for instance in equipment_instances:
        instance['equipment_templates'] = template_map.get(instance['template_id'])
        
    rack_data['equipment'] = equipment_instances
    return rack_data

@router.get("/shows/{show_name}/detailed_racks", response_model=List[Rack], tags=["Racks"])
async def get_detailed_racks_for_show(show_name: str, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    # 1. Get all racks for the show
    racks_res = supabase.table('racks').select('*').eq('show_name', show_name).eq('user_id', str(user.id)).execute()
    if not racks_res.data:
        return []
    
    racks = racks_res.data
    rack_ids = [rack['id'] for rack in racks]
    
    # 2. Get all equipment instances for all racks in one query
    equipment_res = supabase.table('rack_equipment_instances').select('*').in_('rack_id', rack_ids).execute()
    equipment_instances = equipment_res.data if equipment_res.data else []
    
    if not equipment_instances:
        # If there's no equipment, just return the racks with empty equipment lists
        for rack in racks:
            rack['equipment'] = []
        return racks

    # 3. Get all unique template IDs from the equipment
    template_ids = list(set(item['template_id'] for item in equipment_instances))
    
    # 4. Get all needed equipment templates in one query
    templates_res = supabase.table('equipment_templates').select('*').in_('id', template_ids).execute()
    template_map = {template['id']: template for template in templates_res.data}
    
    # 5. Attach templates to their instances
    for instance in equipment_instances:
        instance['equipment_templates'] = template_map.get(instance['template_id'])
        
    # 6. Create a map of rack_id to its equipment
    rack_equipment_map = {}
    for instance in equipment_instances:
        rack_id = instance['rack_id']
        if rack_id not in rack_equipment_map:
            rack_equipment_map[rack_id] = []
        rack_equipment_map[rack_id].append(instance)
        
    # 7. Attach the equipment lists to their parent racks
    for rack in racks:
        rack['equipment'] = rack_equipment_map.get(rack['id'], [])
        
    return racks

@router.put("/racks/{rack_id}", response_model=Rack, tags=["Racks"])
async def update_rack(rack_id: uuid.UUID, rack_update: RackUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    update_data = rack_update.model_dump(exclude_unset=True)
    response = supabase.table('racks').update(update_data).eq('id', rack_id).eq('user_id', user.id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Rack not found to update")
    return response.data[0]

@router.delete("/racks/{rack_id}", status_code=204, tags=["Racks"])
async def delete_rack(rack_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    rack_to_delete = supabase.table('racks').select('id').eq('id', str(rack_id)).eq('user_id', str(user.id)).single().execute()
    if not rack_to_delete.data:
        raise HTTPException(status_code=404, detail="Rack not found or you do not have permission to delete it.")

    supabase.table('racks').delete().eq('id', str(rack_id)).execute()
    return

@router.post("/racks/load_from_library", response_model=Rack, tags=["Racks"])
async def load_rack_from_library(load_data: RackLoad, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Loads a rack from the user's library into a show, using a user-provided name and ensuring it's unique."""
    try:
        # 1. Fetch the template rack from the library
        template_res = supabase.table('racks').select('*').eq('id', str(load_data.template_rack_id)).eq('user_id', str(user.id)).eq('saved_to_library', True).single().execute()
        if not template_res.data:
            raise HTTPException(status_code=404, detail="Library rack not found.")
        template_rack = template_res.data

        # 2. Check for name uniqueness
        existing_rack_res = supabase.table('racks').select('id').eq('show_name', load_data.show_name).eq('user_id', str(user.id)).eq('rack_name', load_data.new_rack_name).execute()
        if existing_rack_res.data:
            raise HTTPException(status_code=409, detail=f"A rack with the name '{load_data.new_rack_name}' already exists in this show.")

        # 3. Create the new rack with the unique name
        new_rack_data = {
            "rack_name": load_data.new_rack_name,
            "ru_height": template_rack['ru_height'],
            "show_name": load_data.show_name,
            "user_id": str(user.id),
            "saved_to_library": False
        }
        new_rack_res = supabase.table('racks').insert(new_rack_data).execute()
        if not new_rack_res.data:
            raise HTTPException(status_code=500, detail="Failed to create new rack copy.")
        new_rack = new_rack_res.data[0]

        # 4. Copy equipment from the template to the new rack
        template_equip_res = supabase.table('rack_equipment_instances').select('*').eq('rack_id', str(template_rack['id'])).execute()
        template_equipment = template_equip_res.data

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
                # Rollback rack creation if equipment copy fails
                supabase.table('racks').delete().eq('id', new_rack['id']).execute()
                raise HTTPException(status_code=500, detail="Failed to copy equipment to new rack.")
            
            # Eagerly load equipment details for the response
            new_instance_ids = [item['id'] for item in new_equip_res.data]
            final_equipment_res = supabase.table('rack_equipment_instances').select('*, equipment_templates(*)').in_('id', new_instance_ids).execute()
            new_rack['equipment'] = final_equipment_res.data
        else:
            new_rack['equipment'] = []

        return new_rack

    except HTTPException as e:
        raise e
    except Exception as e:
        # Catch potential database errors (like unique constraint) that might not be caught by the manual check
        if '23505' in str(e): # 23505 is the postgres code for unique_violation
             raise HTTPException(status_code=409, detail=f"A rack with the name '{load_data.new_rack_name}' already exists in this show.")
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

    # --- Collision Detection Logic ---
    new_item_start = equipment_data.ru_position
    new_item_end = new_item_start + template['ru_height'] - 1
    new_item_is_full_width = template['width'] != 'half'
    new_item_side = equipment_data.rack_side

    for existing_item in existing_equipment:
        existing_template = existing_item['equipment_templates']
        existing_start = existing_item['ru_position']
        existing_end = existing_start + existing_template['ru_height'] - 1

        # Check for vertical overlap
        if max(new_item_start, existing_start) <= min(new_item_end, existing_end):
            new_item_face = new_item_side.split('-')[0]
            existing_side = existing_item['rack_side']
            existing_face = existing_side.split('-')[0]

            # Only check for collision if they are on the same face of the rack
            if new_item_face == existing_face:
                existing_is_full_width = existing_template['width'] != 'half'
                
                # Case 1: If either item is full-width, it's a guaranteed collision on the same face
                if new_item_is_full_width or existing_is_full_width:
                    raise HTTPException(
                        status_code=409, 
                        detail=f"Placement of full-width item conflicts with {existing_item.get('instance_name', 'Unnamed')}."
                    )

                # Case 2: Both items are half-width. Collision only if they are on the same side.
                if new_item_side == existing_side:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Placement of half-width item conflicts with {existing_item.get('instance_name', 'Unnamed')} on the same side."
                    )

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
        new_instance = response.data[0]
        # Eagerly load the template data to match the GET endpoint's structure
        new_instance['equipment_templates'] = template
        return new_instance
        
    raise HTTPException(status_code=500, detail="Failed to add equipment to rack.")

@router.get("/racks/equipment/{instance_id}", response_model=RackEquipmentInstance, tags=["Racks"])
async def get_equipment_instance(instance_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves a single equipment instance with its template data."""
    instance_res = supabase.table('rack_equipment_instances').select('*, equipment_templates(*)').eq('id', str(instance_id)).single().execute()
    
    if not instance_res.data:
        raise HTTPException(status_code=404, detail="Equipment instance not found.")
        
    # Check if the user is authorized to view this instance
    rack_res = supabase.table('racks').select('user_id').eq('id', instance_res.data['rack_id']).single().execute()
    if not rack_res.data or str(rack_res.data['user_id']) != str(user.id):
        raise HTTPException(status_code=403, detail="Not authorized to view this equipment instance.")
        
    return instance_res.data

@router.put("/racks/equipment/{instance_id}", response_model=RackEquipmentInstance, tags=["Racks"])
async def update_equipment_instance(instance_id: uuid.UUID, update_data: RackEquipmentInstanceUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates the position, side, or IP address of a rack equipment instance."""
    
    try:
        # Fetch the instance and its template and rack details
        instance_res = supabase.table('rack_equipment_instances').select('*, racks(user_id, ru_height), equipment_templates(*)').eq('id', str(instance_id)).single().execute()
        
        if not instance_res.data or not instance_res.data.get('racks'):
            raise HTTPException(status_code=404, detail="Equipment instance not found.")

        if str(instance_res.data['racks']['user_id']) != str(user.id):
            raise HTTPException(status_code=403, detail="Not authorized to update this equipment instance.")

        instance = instance_res.data
        update_dict = update_data.model_dump(exclude_unset=True)

        # If we are changing the position, we need to validate it
        if 'ru_position' in update_dict or 'rack_side' in update_dict:
            new_ru_position = update_dict.get('ru_position', instance['ru_position'])
            ru_height = instance['equipment_templates']['ru_height']
            rack_height = instance['racks']['ru_height']
            
            if (new_ru_position + ru_height - 1) > rack_height:
                raise HTTPException(status_code=400, detail="Equipment does not fit at the new position.")

            rack_id = instance['rack_id']
            existing_equipment_res = supabase.table('rack_equipment_instances').select('*, equipment_templates(*)').eq('rack_id', str(rack_id)).neq('id', str(instance_id)).execute()
            
            new_item_start = new_ru_position
            new_item_end = new_item_start + ru_height - 1
            new_item_is_full_width = instance['equipment_templates']['width'] != 'half'
            new_item_side = update_dict.get('rack_side', instance['rack_side'])

            for existing_item in existing_equipment_res.data:
                existing_template = existing_item['equipment_templates']
                existing_start = existing_item['ru_position']
                existing_end = existing_start + existing_template['ru_height'] - 1

                if max(new_item_start, existing_start) <= min(new_item_end, existing_end):
                    new_item_face = new_item_side.split('-')[0]
                    existing_side = existing_item['rack_side']
                    existing_face = existing_side.split('-')[0]

                    if new_item_face == existing_face:
                        existing_is_full_width = existing_template['width'] != 'half'
                        
                        if new_item_is_full_width or existing_is_full_width:
                            raise HTTPException(
                                status_code=409, 
                                detail=f"Placement of full-width item conflicts with {existing_item.get('instance_name', 'Unnamed')}."
                            )

                        if new_item_side == existing_side:
                            raise HTTPException(
                                status_code=409,
                                detail=f"Placement of half-width item conflicts with {existing_item.get('instance_name', 'Unnamed')} on the same side."
                            )

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"An error occurred during validation: {str(e)}")

    response = supabase.table('rack_equipment_instances').update(update_dict).eq('id', str(instance_id)).execute()
    
    if response.data:
        # Re-fetch the updated instance to get the full object with nested data
        final_instance_res = supabase.table('rack_equipment_instances').select('*, equipment_templates(*)').eq('id', str(instance_id)).single().execute()
        if final_instance_res.data:
            return final_instance_res.data
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
    
    folder_to_delete = supabase.table('folders').select('id').eq('id', str(folder_id)).eq('user_id', str(user.id)).single().execute()
    if not folder_to_delete.data:
        raise HTTPException(status_code=404, detail="Folder not found or you do not have permission to delete it.")

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

    if 'ports' in update_dict and update_dict['ports'] is not None:
        for port in update_dict['ports']:
            if 'id' in port and isinstance(port['id'], uuid.UUID):
                port['id'] = str(port['id'])

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

        insert_data = connection_data.model_dump(mode='json')
        insert_data['show_id'] = show_id_res.data['show_name']
        
        response = supabase.table('connections').insert(insert_data).execute()
        if response.data:
            return response.data[0]
        raise HTTPException(status_code=500, detail="Failed to create connection.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/shows/{show_name}/unassigned_equipment", tags=["Wire Diagram"], response_model=List[RackEquipmentInstanceWithTemplate])
async def get_unassigned_equipment(show_name: str, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves all equipment for a show that has not been assigned to a wire diagram page."""
    try:
        # First, get all racks for the given show and user
        racks_res = supabase.table('racks').select('id').eq('show_name', show_name).eq('user_id', str(user.id)).execute()
        if not racks_res.data:
            return [] # No racks for this show, so no equipment

        rack_ids = [rack['id'] for rack in racks_res.data]

        # Now, get all equipment instances from those racks where page_number is null
        # Eager load the template data as well, as the frontend will need it
        equipment_res = supabase.table('rack_equipment_instances').select('*, equipment_templates(*)').in_('rack_id', rack_ids).is_('page_number', None).execute()
        
        return equipment_res.data if equipment_res.data else []

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch unassigned equipment: {str(e)}")

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

@router.get("/equipment/{instance_id}/connections", response_model=List[Connection], tags=["Wire Diagram"])
async def get_connections_for_device(instance_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves all connections for a specific equipment instance."""
    # First, verify the user has access to this equipment instance
    instance_res = supabase.table('rack_equipment_instances').select('rack_id').eq('id', str(instance_id)).single().execute()
    if not instance_res.data:
        raise HTTPException(status_code=404, detail="Equipment instance not found.")
    
    rack_res = supabase.table('racks').select('user_id').eq('id', instance_res.data['rack_id']).single().execute()
    if not rack_res.data or str(rack_res.data['user_id']) != str(user.id):
        raise HTTPException(status_code=403, detail="Not authorized to view this equipment's connections.")
        
    # Fetch connections where the instance is either a source or a destination
    response = supabase.table('connections').select(
        'id, show_id, source_device_id, source_port_id, destination_device_id, destination_port_id, cable_type, label, length_ft'
    ).or_(
        f'source_device_id.eq.{instance_id},destination_device_id.eq.{instance_id}'
    ).execute()
    
    return response.data if response.data else []

@router.put("/connections/{connection_id}", tags=["Wire Diagram"])
async def update_connection(connection_id: uuid.UUID, update_data: ConnectionUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates a connection's details."""
    try:
        update_dict = update_data.model_dump(exclude_unset=True)
        # Convert any UUIDs in the update data to strings
        for key, value in update_dict.items():
            if isinstance(value, uuid.UUID):
                update_dict[key] = str(value)
                
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

@router.post("/pdf/wire-diagram", tags=["PDF Generation"])
async def create_wire_diagram_pdf(payload: WireDiagramPDFPayload, user = Depends(get_user)):
    """Generates a PDF for the wire diagram."""
    try:
        pdf_buffer = generate_wire_diagram_pdf(payload)
        return Response(content=pdf_buffer.getvalue(), media_type="application/pdf")
    except Exception as e:
        print(f"Error generating wire diagram PDF: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")

@router.post("/pdf/racks", tags=["PDF Generation"])
async def create_racks_pdf(payload: RackPDFPayload, user = Depends(get_user)):
    """Generates a PDF for the rack builder view."""
    try:
        pdf_buffer = generate_racks_pdf(payload)
        return Response(content=pdf_buffer.getvalue(), media_type="application/pdf")
    except Exception as e:
        print(f"Error generating rack PDF: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")

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
    
    if 'ports' in update_dict and update_dict['ports'] is not None:
        for port in update_dict['ports']:
            if 'id' in port and isinstance(port['id'], uuid.UUID):
                port['id'] = str(port['id'])
    
    response = supabase.table('equipment_templates').update(update_dict).eq('id', str(equipment_id)).eq('is_default', True).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Equipment not found or not a default template.")
    return response.data[0]