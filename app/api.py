import os
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Response, Header
from fastapi.responses import JSONResponse
from supabase import create_client, Client
from gotrue.errors import AuthApiError
import io
import traceback
from pydantic import BaseModel
import uuid
from html import escape
import jwt
from datetime import datetime, timedelta, timezone

# Import all necessary models
from .models import (
    ShowFile, LoomLabel, CaseLabel, UserProfile, UserProfileUpdate, SSOConfig,
    Rack, RackUpdate, EquipmentTemplate, EquipmentTemplateCreate, RackEquipmentInstance, RackCreate,
    RackEquipmentInstanceCreate, RackEquipmentInstanceUpdate, Folder, FolderCreate,
    Connection, ConnectionCreate, ConnectionUpdate, PortTemplate, EquipmentInstanceCreate,
    FolderUpdate, EquipmentTemplateUpdate, EquipmentCopy, RackLoad,
    UserFolderUpdate, UserEquipmentTemplateUpdate, WireDiagramPDFPayload, RackEquipmentInstanceWithTemplate,
    SenderIdentity, SenderIdentityCreate, SenderIdentityPublic, RackPDFPayload,
    Loom, LoomCreate, LoomUpdate, LoomWithCables,
    Cable, CableCreate, CableUpdate, BulkCableUpdate, LoomBuilderPDFPayload,
    ImpersonateRequest, Token
)
from .pdf_utils import generate_loom_label_pdf, generate_case_label_pdf, generate_racks_pdf, generate_loom_builder_pdf, generate_hours_pdf
from .email_utils import create_email_html, send_email
from typing import List, Dict, Optional
from .models import HoursPDFPayload


SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_supabase_client() -> Client:
    return supabase

router = APIRouter()

BUCKET_NAME = "logos"

# --- User Authentication Dependency ---
async def get_user(request: Request):
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
async def get_user_from_token(authorization: str = Header(...)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header missing or invalid")
    token = authorization.split(" ")[1]
    try:
        user_response = supabase.auth.get_user(token)
        return user_response.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token for user")


# --- Admin Authentication Dependency ---
async def get_admin_user(user = Depends(get_user)):
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

# --- Feature Restriction Models ---
class FeatureRestriction(BaseModel):
    feature_name: str
    excluded_roles: List[str]

class FeatureRestrictionUpdate(BaseModel):
    excluded_roles: List[str]

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
        "has_ip_address": equipment_data.has_ip_address,
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
    status: str
    
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
                # Determine user status safely
                status = "active"
                banned_until = getattr(auth_user, 'banned_until', None)
                if banned_until and banned_until > datetime.now(timezone.utc):
                    status = "suspended"
                
                user_data = {
                    **profile,
                    "email": auth_user.email,
                    "roles": roles_map.get(user_id, []),
                    "status": status
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


@router.post("/admin/impersonate", tags=["Admin"], response_model=Token)
async def impersonate_user(
    impersonate_request: ImpersonateRequest,
    admin_user=Depends(get_admin_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Admin: Impersonates another user by generating a temporary JWT for them."""
    SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=500, detail="JWT secret is not configured on the server.")

    target_user_id = str(impersonate_request.user_id)
    admin_user_id = str(admin_user.id)

    if target_user_id == admin_user_id:
        raise HTTPException(status_code=400, detail="Admin cannot impersonate themselves.")

    try:
        # Verify the target user exists in profiles and auth
        target_user_profile_res = supabase.table('profiles').select('id').eq('id', target_user_id).single().execute()
        if not target_user_profile_res.data:
            raise HTTPException(status_code=404, detail="User to impersonate not found.")
        
        target_user_auth_res = supabase.auth.admin.get_user_by_id(target_user_id)
        target_user = target_user_auth_res.user
    except Exception:
        raise HTTPException(status_code=404, detail="User to impersonate not found.")

    # Create the custom JWT
    issue_time = datetime.utcnow()
    expiration_time = issue_time + timedelta(hours=2) # Short-lived token

    # Standard Supabase claims
    payload = {
        "sub": target_user_id,
        "aud": "authenticated",
        "role": "authenticated",
        "email": target_user.email,
        "phone": target_user.phone or "",
        "iat": int(issue_time.timestamp()),
        "exp": int(expiration_time.timestamp()),
        "iss": f"https://{SUPABASE_URL.split('//')[1]}/auth/v1",
        # Custom claims for impersonation
        "user_metadata": target_user.user_metadata,
        "app_metadata": {
            **target_user.app_metadata,
            "impersonator_id": admin_user_id,
            "impersonator_email": admin_user.email
        }
    }

    impersonation_token = jwt.encode(payload, SUPABASE_JWT_SECRET, algorithm="HS256")

    # Auditing
    try:
        supabase.table('audit_log').insert({
            'actor_id': admin_user_id,
            'target_id': target_user_id,
            'action': 'impersonation_start',
            'details': f"Admin {admin_user.email} started impersonating user {target_user.email}."
        }).execute()
    except Exception as e:
        print(f"Failed to create audit log for impersonation start: {e}")

    return Token(access_token=impersonation_token)


@router.post("/admin/impersonate/stop", tags=["Admin"], status_code=200)
async def stop_impersonation(user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Signals the end of an impersonation session. The actual token reversion happens on the client-side.
    This endpoint is for logging and potential future server-side state management.
    """
    try:
        impersonator_id = user.app_metadata.get('impersonator_id')
        impersonator_email = user.app_metadata.get('impersonator_email')

        # Only log if this is a valid impersonation session token
        if impersonator_id and impersonator_email:
            impersonated_user_id = str(user.id)
            impersonated_user_email = user.email
            
            supabase.table('audit_log').insert({
                'actor_id': impersonator_id,
                'target_id': impersonated_user_id,
                'action': 'impersonation_stop',
                'details': f"Admin {impersonator_email} stopped impersonating user {impersonated_user_email}."
            }).execute()
        else:
            # This case handles if a non-impersonation token is used to call this endpoint.
            # We can log this as an anomaly if desired, but for now, we just won't create a confusing audit log.
            print(f"User {user.email} called stop_impersonation without a valid impersonation token.")

    except Exception as e:
        print(f"Failed to create audit log for impersonation stop: {e}")

    return {"message": "Impersonation stopped"}

# --- Feature Restriction Dependencies ---

# A list of all manageable features in the system.
ALL_FEATURES = [
    {"key": "pdf_logo", "name": "PDF Logo"},
    {"key": "contextual_notes", "name": "Contextual Notes"},
    {"key": "loom_labels", "name": "Loom Labels"},
    {"key": "case_labels", "name": "Case Labels"},
    {"key": "rack_builder", "name": "Rack Builder"},
    {"key": "wire_diagram", "name": "Wire Diagram"},
    {"key": "loom_builder", "name": "Loom Builder"},
    {"key": "vlan_management", "name": "VLAN Management"},
    {"key": "crew", "name": "Crew Management"},
    {"key": "hours_tracking", "name": "Hours Tracking"},
    {"key": "global_feedback_button", "name": "Global Feedback Button"},
    {"key": "switch_config", "name": "Switch Configuration"},
]

def get_user_roles_sync(user_id: uuid.UUID, supabase: Client) -> set:
    """Helper to fetch user roles."""
    user_roles_res = supabase.table('user_roles').select('roles(name)').eq('user_id', user_id).execute()
    if user_roles_res.data:
        return {role['roles']['name'] for role in user_roles_res.data if 'roles' in role and role['roles']}
    return set()

def feature_check(feature_name: str):
    """
    Dependency factory for checking feature access using an allow-list model.
    Raises HTTPException 403 if a feature has a defined, non-empty list of permitted
    roles and the user does not have any of those roles.
    """
    async def checker(user = Depends(get_user)):
        user_roles = get_user_roles_sync(user.id, supabase)
        
        restriction_res = supabase.table('feature_restrictions').select('permitted_roles').eq('feature_name', feature_name).maybe_single().execute()
        
        permitted_roles = restriction_res.data.get('permitted_roles') if restriction_res and restriction_res.data else None

        # An empty list is falsy, so this block only runs for non-empty lists.
        if permitted_roles:
            permitted_roles_set = set(permitted_roles)
            if user_roles.isdisjoint(permitted_roles_set):
                raise HTTPException(status_code=403, detail=f"Your role does not have permission to access the '{feature_name}' feature.")
        # If no restrictions are set, or the list is empty, access is allowed by default.
    return checker

async def get_branding_visibility(user = Depends(get_user)) -> bool:
    """Dependency that returns True if the ShowReady branding should be visible for the user."""
    user_roles = get_user_roles_sync(user.id, supabase)
    
    restriction_res = supabase.table('feature_restrictions').select('permitted_roles').eq('feature_name', 'pdf_logo').maybe_single().execute()
    
    permitted_roles = restriction_res.data.get('permitted_roles') if restriction_res and restriction_res.data else None

    # An empty list is falsy.
    if permitted_roles:
        return not user_roles.isdisjoint(set(permitted_roles))
            
    return True


# --- Admin Feature Restriction Endpoints ---
@router.get("/admin/feature_restrictions", tags=["Admin", "RBAC"])
async def get_all_feature_restrictions(admin_user=Depends(get_admin_user), supabase: Client = Depends(get_supabase_client)):
    """Admin: Gets all feature restrictions with their display names."""
    try:
        response = supabase.table('feature_restrictions').select('*').execute()
        
        restrictions_map = {item['feature_name']: item['permitted_roles'] for item in response.data}
        
        all_restrictions = [
            {
                "feature_name": feature["key"],
                "display_name": feature["name"],
                "permitted_roles": restrictions_map.get(feature["key"], [])
            }
            for feature in ALL_FEATURES
        ]
        
        return all_restrictions
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class PermittedRolesUpdate(BaseModel):
    permitted_roles: List[str]

class PermissionsVersion(BaseModel):
    version: int

@router.get("/permissions/version", response_model=PermissionsVersion, tags=["Permissions"])
async def get_permissions_version(supabase: Client = Depends(get_supabase_client)):
    """Gets the current version of the permissions configuration."""
    try:
        response = supabase.table('permissions_meta').select('version').eq('id', 1).single().execute()
        return response.data
    except Exception as e:
        # If the table/row doesn't exist, return a default version
        print(f"Could not fetch permissions version, returning default. Error: {e}")
        return {"version": 1}


@router.put("/admin/feature_restrictions/{feature_name}", tags=["Admin", "RBAC"])
async def update_feature_restriction(
    feature_name: str,
    restriction_data: PermittedRolesUpdate,
    admin_user=Depends(get_admin_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Admin: Creates or updates the feature restriction settings for a given feature."""
    try:
        # First, update the feature restriction
        upsert_data = {
            'feature_name': feature_name,
            'permitted_roles': restriction_data.permitted_roles,
        }
        response = supabase.table('feature_restrictions').upsert(
            upsert_data,
            on_conflict='feature_name',
        ).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to update feature restriction.")
        
        # Then, increment the permissions version
        # Use an RPC call to safely increment the value on the database
        supabase.rpc('increment_permissions_version', {}).execute()

        return response.data[0]
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"An error occurred while updating feature restriction: {str(e)}")

# --- Admin Metrics ---
@router.get("/admin/metrics", tags=["Admin"])
async def get_metrics(admin_user=Depends(get_admin_user), supabase: Client = Depends(get_supabase_client)):
    try:
        user_count_res = supabase.table('profiles').select('id', count='exact').execute()
        shows_count_res = supabase.table('shows').select('name', count='exact').execute()
        racks_count_res = supabase.table('racks').select('id', count='exact').execute()
        
        # Call the existing DB function for most used equipment
        most_used_equipment_res = supabase.rpc('get_most_used_equipment', {}).execute()
        most_used_equipment = most_used_equipment_res.data
        
        # Directly query for the count of custom items
        custom_items_res = supabase.table('equipment_templates').select('id', count='exact').eq('is_default', False).execute()
        custom_items_created = custom_items_res.count

        return {
            "userCount": user_count_res.count,
            "signUps": 0, # This can be implemented later by querying profiles by created_at
            "showsCount": shows_count_res.count,
            "racksCount": racks_count_res.count,
            "mostUsedEquipment": most_used_equipment,
            "customItemsCreated": custom_items_created
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"An error occurred while fetching metrics: {str(e)}")


# --- Profile Management Endpoints ---
@router.get("/profile", response_model=UserProfile, tags=["User Profile"])
async def get_profile(user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves the profile for the authenticated user, including their roles and permissions."""
    try:
        profile_res = supabase.table('profiles').select('*').eq('id', user.id).single().execute()
        profile_data = profile_res.data
        
        if not profile_data:
            user_meta = user.user_metadata or {}
            profile_to_create = {
                'id': str(user.id),
                'first_name': user_meta.get('first_name'), 'last_name': user_meta.get('last_name'),
                'company_name': user_meta.get('company_name'), 'production_role': user_meta.get('production_role'),
                'production_role_other': user_meta.get('production_role_other'),
            }
            insert_response = supabase.table('profiles').insert(profile_to_create).execute()
            if not insert_response.data:
                 raise HTTPException(status_code=500, detail="Failed to create user profile.")
            profile_data = insert_response.data[0]

        user_roles = get_user_roles_sync(user.id, supabase)
        profile_data['roles'] = list(user_roles)

        # --- Add permitted features ---
        try:
            all_restrictions_res = supabase.table('feature_restrictions').select('*').execute()
            restrictions_map = {item['feature_name']: item['permitted_roles'] for item in all_restrictions_res.data}
            
            permitted_features = []
            for feature in ALL_FEATURES:
                permitted_roles = restrictions_map.get(feature["key"])
                # An undefined restriction or an empty list (falsy) means the feature is accessible to all.
                if not permitted_roles:
                    permitted_features.append(feature["key"])
                # If a non-empty list of roles exists, the user must have one of those roles.
                elif not user_roles.isdisjoint(set(permitted_roles)):
                    permitted_features.append(feature["key"])
            
            profile_data['permitted_features'] = permitted_features
        except Exception as e:
            print(f"Error fetching permitted features for user {user.id}: {e}")
            profile_data['permitted_features'] = []

        profile_data['feedback_button_text'] = "Feedback"

        return UserProfile(**profile_data)
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
@router.post("/shows", tags=["Shows"])
async def create_show(show_data: ShowFile, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new show for the authenticated user."""
    try:
        response = supabase.table('shows').insert({
            'name': show_data.info.show_name,
            'data': show_data.model_dump(mode='json'),
            'user_id': str(user.id)
        }).execute()
        
        if response.data:
            return response.data[0]
        raise HTTPException(status_code=500, detail="Failed to create show.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/shows/{show_id}", tags=["Shows"])
async def update_show(show_id: int, show_data: ShowFile, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates an existing show for the authenticated user."""
    try:
        update_data = {
            'name': show_data.info.show_name,
            'data': show_data.model_dump(mode='json')
        }
        
        response = supabase.table('shows').update(update_data).eq('id', show_id).eq('user_id', user.id).execute()
        
        if response.data:
            return response.data[0]
        raise HTTPException(status_code=404, detail="Show not found or update failed.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/shows/{show_id}", tags=["Shows"])
async def get_show(show_id: int, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves a specific show for the authenticated user."""
    try:
        show_response = supabase.table('shows').select('*').eq('id', show_id).eq('user_id', user.id).maybe_single().execute()
        if not show_response.data:
            raise HTTPException(status_code=404, detail="Show not found")

        show_data = show_response.data
        
        # Check for associated notes
        notes_response = supabase.table('notes').select('id', count='exact').eq('parent_entity_type', 'show').eq('parent_entity_id', str(show_id)).execute()
        
        # Add the has_notes flag to the response
        show_data['has_notes'] = notes_response.count > 0

        return show_data
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=404, detail=f"Show with id '{show_id}' not found.")

@router.get("/shows/by-name/{show_name}", tags=["Shows"])
async def get_show_by_name(show_name: str, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves a specific show for the authenticated user by its name."""
    try:
        formatted_show_name = show_name.replace('-', ' ')
        response = supabase.table('shows').select('*').eq('name', formatted_show_name).eq('user_id', user.id).maybe_single().execute()
        if response.data:
            return response.data
        raise HTTPException(status_code=404, detail="Show not found")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=404, detail=f"Show with name '{show_name}' not found.")

@router.get("/shows", tags=["Shows"])
async def list_shows(user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Lists all shows for the authenticated user, including their logo paths."""
    try:
        response = supabase.table('shows').select('id, name, data').eq('user_id', user.id).execute()
        if not response.data:
            return []
        
        shows_with_logos = []
        for item in response.data:
            logo_path = item.get('data', {}).get('info', {}).get('logo_path')
            shows_with_logos.append({'id': item['id'], 'name': item['name'], 'logo_path': logo_path})
            
        return shows_with_logos
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/shows/{show_id}", status_code=204, tags=["Shows"])
async def delete_show(show_id: int, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Deletes a specific show for the authenticated user."""
    try:
        supabase.table('shows').delete().eq('id', show_id).eq('user_id', user.id).execute()
        return
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Loom Builder Endpoints ---

# -- Looms (Containers) --
@router.get("/shows/{show_id}/looms", response_model=List[LoomWithCables], tags=["Loom Builder"], dependencies=[Depends(feature_check("loom_builder"))])
async def get_looms_for_show(show_id: int, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves all loom containers for a specific show, including their cables."""
    # 1. Verify show access and get looms
    show_res = supabase.table('shows').select('id').eq('id', show_id).eq('user_id', user.id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")
    
    looms_res = supabase.table('looms').select('*').eq('show_id', show_id).eq('user_id', user.id).execute()
    if not looms_res.data:
        return []

    looms = looms_res.data
    loom_ids = [loom['id'] for loom in looms]

    # 2. Get all cables for all looms in one query
    cables_res = supabase.table('cables').select('*').in_('loom_id', loom_ids).order('created_at').execute()
    cables_data = cables_res.data if cables_res.data else []
    
    # 3. Create a map of loom_id to its cables
    cables_by_loom_id = {}
    for cable in cables_data:
        loom_id = cable['loom_id']
        if loom_id not in cables_by_loom_id:
            cables_by_loom_id[loom_id] = []
        cables_by_loom_id[loom_id].append(cable)

    # 4. Fetch notes for all looms
    notes_res = supabase.table('notes').select('parent_entity_id').eq('parent_entity_type', 'loom').in_('parent_entity_id', loom_ids).execute()
    looms_with_notes = {note['parent_entity_id'] for note in notes_res.data}

    # 5. Attach cables and notes status to their respective looms
    looms_with_cables = []
    for loom in looms:
        loom_dict = loom.copy()
        loom_dict['cables'] = cables_by_loom_id.get(loom['id'], [])
        loom_dict['has_notes'] = loom['id'] in looms_with_notes
        looms_with_cables.append(LoomWithCables(**loom_dict))

    return looms_with_cables

@router.post("/looms", response_model=Loom, tags=["Loom Builder"], dependencies=[Depends(feature_check("loom_builder"))])
async def create_loom(loom_data: LoomCreate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new loom container for a show."""
    show_res = supabase.table('shows').select('id').eq('id', loom_data.show_id).eq('user_id', user.id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")

    insert_data = loom_data.model_dump()
    insert_data['user_id'] = str(user.id)
    
    response = supabase.table('looms').insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create loom.")
    return response.data[0]

@router.put("/looms/{loom_id}", response_model=Loom, tags=["Loom Builder"], dependencies=[Depends(feature_check("loom_builder"))])
async def update_loom(loom_id: uuid.UUID, loom_data: LoomUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates an existing loom container."""
    loom_res = supabase.table('looms').select('id').eq('id', str(loom_id)).eq('user_id', user.id).single().execute()
    if not loom_res.data:
        raise HTTPException(status_code=404, detail="Loom not found or access denied.")

    update_data = loom_data.model_dump(exclude_unset=True)
    response = supabase.table('looms').update(update_data).eq('id', str(loom_id)).execute()
    
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to update loom.")
    return response.data[0]

@router.delete("/looms/{loom_id}", status_code=204, tags=["Loom Builder"], dependencies=[Depends(feature_check("loom_builder"))])
async def delete_loom(loom_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Deletes a loom container and all its associated cables."""
    loom_res = supabase.table('looms').select('id').eq('id', str(loom_id)).eq('user_id', user.id).single().execute()
    if not loom_res.data:
        raise HTTPException(status_code=404, detail="Loom not found or access denied.")
        
    supabase.table('looms').delete().eq('id', str(loom_id)).execute() # RLS and CASCADE will handle deletion
    return

class LoomCopy(BaseModel):
    new_name: str

@router.post("/looms/{loom_id}/copy", response_model=Loom, tags=["Loom Builder"], dependencies=[Depends(feature_check("loom_builder"))])
async def copy_loom(loom_id: uuid.UUID, payload: LoomCopy, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Copies a loom and all its cables, renaming them in the process."""
    original_loom_res = supabase.table('looms').select('*').eq('id', str(loom_id)).eq('user_id', user.id).single().execute()
    if not original_loom_res.data:
        raise HTTPException(status_code=404, detail="Loom not found or access denied.")
    original_loom = original_loom_res.data
    original_loom_name = original_loom['name']

    new_loom_data = {
        "name": payload.new_name,
        "show_id": original_loom['show_id'],
        "user_id": str(user.id)
    }
    new_loom_res = supabase.table('looms').insert(new_loom_data).execute()
    if not new_loom_res.data:
        raise HTTPException(status_code=500, detail="Failed to create new loom copy.")
    new_loom = new_loom_res.data[0]

    original_cables_res = supabase.table('cables').select('*').eq('loom_id', str(loom_id)).order('created_at').execute()
    original_cables = original_cables_res.data

    if original_cables:
        new_cables_to_create = []
        for cable in original_cables:
            new_label_content = cable['label_content']
            if original_loom_name and payload.new_name and new_label_content and new_label_content.startswith(original_loom_name):
                new_label_content = payload.new_name + new_label_content[len(original_loom_name):]

            new_cable_data = {
                "loom_id": new_loom['id'],
                "label_content": new_label_content,
                "cable_type": cable['cable_type'],
                "length_ft": cable.get('length_ft'),
                "origin": cable['origin'],
                "destination": cable['destination'],
                "origin_color": cable['origin_color'],
                "destination_color": cable['destination_color'],
                "is_rcvd": cable['is_rcvd'],
                "is_complete": cable['is_complete'],
            }
            new_cables_to_create.append(new_cable_data)
        
        if new_cables_to_create:
            new_cables_res = supabase.table('cables').insert(new_cables_to_create).execute()
            if not new_cables_res.data:
                supabase.table('looms').delete().eq('id', new_loom['id']).execute()
                raise HTTPException(status_code=500, detail="Failed to copy cables to new loom.")

    return new_loom

# -- Cables (within a Loom) --
@router.get("/looms/{loom_id}/cables", response_model=List[Cable], tags=["Loom Builder"], dependencies=[Depends(feature_check("loom_builder"))])
async def get_cables_for_loom(loom_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves all cables for a specific loom."""
    loom_res = supabase.table('looms').select('id').eq('id', str(loom_id)).eq('user_id', user.id).single().execute()
    if not loom_res.data:
        raise HTTPException(status_code=404, detail="Loom not found or access denied.")
        
    response = supabase.table('cables').select('*').eq('loom_id', str(loom_id)).order('created_at').execute()
    return response.data

@router.post("/cables", response_model=Cable, tags=["Loom Builder"], dependencies=[Depends(feature_check("loom_builder"))])
async def create_cable(cable_data: CableCreate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new cable within a loom."""
    loom_res = supabase.table('looms').select('id').eq('id', str(cable_data.loom_id)).eq('user_id', user.id).single().execute()
    if not loom_res.data:
        raise HTTPException(status_code=403, detail="Access denied: you do not own the parent loom.")
    
    insert_data = cable_data.model_dump(mode='json')
    response = supabase.table('cables').insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create cable.")
    return response.data[0]

@router.put("/cables/bulk-update", status_code=200, tags=["Loom Builder"], dependencies=[Depends(feature_check("loom_builder"))])
async def bulk_update_cables(update_data: BulkCableUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Bulk updates multiple cables."""
    if not update_data.cable_ids:
        raise HTTPException(status_code=400, detail="No cable IDs provided.")

    # Verify user ownership of all cables through their looms
    cables_res = supabase.table('cables').select('id, looms(user_id)').in_('id', [str(cid) for cid in update_data.cable_ids]).execute()
    
    if len(cables_res.data) != len(update_data.cable_ids):
        raise HTTPException(status_code=404, detail="One or more cables not found.")

    for cable in cables_res.data:
        if str(cable['looms']['user_id']) != str(user.id):
            raise HTTPException(status_code=403, detail="Access denied: you do not own one or more of the selected cables.")

    update_payload = update_data.updates.model_dump(exclude_unset=True)
    if not update_payload:
        raise HTTPException(status_code=400, detail="No update fields provided.")
    
    response = supabase.table('cables').update(update_payload).in_('id', [str(cid) for cid in update_data.cable_ids]).execute()
    
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to bulk update cables.")
        
    return {"message": f"Successfully updated {len(response.data)} cables."}

@router.put("/cables/{cable_id}", response_model=Cable, tags=["Loom Builder"], dependencies=[Depends(feature_check("loom_builder"))])
async def update_cable(cable_id: uuid.UUID, cable_data: CableUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates an existing cable."""
    cable_res = supabase.table('cables').select('loom_id').eq('id', str(cable_id)).single().execute()
    if not cable_res.data:
        raise HTTPException(status_code=404, detail="Cable not found.")
    
    loom_res = supabase.table('looms').select('id').eq('id', str(cable_res.data['loom_id'])).eq('user_id', user.id).single().execute()
    if not loom_res.data:
        raise HTTPException(status_code=403, detail="Access denied: you do not own the parent loom.")
        
    update_data = cable_data.model_dump(exclude_unset=True)
    response = supabase.table('cables').update(update_data).eq('id', str(cable_id)).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to update cable.")
    return response.data[0]

@router.delete("/cables/{cable_id}", status_code=204, tags=["Loom Builder"], dependencies=[Depends(feature_check("loom_builder"))])
async def delete_cable(cable_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Deletes a cable."""
    cable_res = supabase.table('cables').select('loom_id').eq('id', str(cable_id)).single().execute()
    if not cable_res.data:
        return # Idempotent delete

    loom_res = supabase.table('looms').select('id').eq('id', str(cable_res.data['loom_id'])).eq('user_id', user.id).single().execute()
    if not loom_res.data:
        raise HTTPException(status_code=403, detail="Access denied: you do not own the parent loom.")
        
    supabase.table('cables').delete().eq('id', str(cable_id)).execute()
    return

@router.put("/cables/bulk-update", status_code=200, tags=["Loom Builder"], dependencies=[Depends(feature_check("loom_builder"))])
async def bulk_update_cables(update_data: BulkCableUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Bulk updates multiple cables."""
    if not update_data.cable_ids:
        raise HTTPException(status_code=400, detail="No cable IDs provided.")

    # Verify user ownership of all cables through their looms
    cables_res = supabase.table('cables').select('id, looms(user_id)').in_('id', [str(cid) for cid in update_data.cable_ids]).execute()
    
    if len(cables_res.data) != len(update_data.cable_ids):
        raise HTTPException(status_code=404, detail="One or more cables not found.")

    for cable in cables_res.data:
        if str(cable['looms']['user_id']) != str(user.id):
            raise HTTPException(status_code=403, detail="Access denied: you do not own one or more of the selected cables.")

    update_payload = update_data.updates.model_dump(exclude_unset=True)
    if not update_payload:
        raise HTTPException(status_code=400, detail="No update fields provided.")
    
    response = supabase.table('cables').update(update_payload).in_('id', [str(cid) for cid in update_data.cable_ids]).execute()
    
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to bulk update cables.")
        
    return {"message": f"Successfully updated {len(response.data)} cables."}

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


@router.get("/racks", response_model=List[Rack], tags=["Racks"], dependencies=[Depends(feature_check("rack_builder"))])
async def list_library_racks(from_library: bool = False, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    if not from_library:
        raise HTTPException(status_code=400, detail="This endpoint is for library racks only. Use /shows/{show_id}/racks for show-specific racks.")
    
    query = supabase.table('racks').select('*').eq('user_id', user.id).eq('saved_to_library', True)
    response = query.execute()
    return response.data

@router.get("/shows/{show_id}/racks", response_model=List[Rack], tags=["Racks"], dependencies=[Depends(feature_check("rack_builder"))])
async def list_racks_for_show(show_id: int, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    query = supabase.table('racks').select('*').eq('user_id', user.id).eq('show_id', show_id)
    
    response = query.execute()
    return response.data

@router.get("/racks/{rack_id}", response_model=Rack, tags=["Racks"], dependencies=[Depends(feature_check("rack_builder"))])
async def get_rack(rack_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    # 1. Get the rack data
    response = supabase.table('racks').select('*').eq('id', str(rack_id)).eq('user_id', str(user.id)).maybe_single().execute()
    if not response or not response.data:
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
    
    # 6. Fetch notes for the rack and its equipment
    rack_notes_res = supabase.table('notes').select('parent_entity_id').eq('parent_entity_type', 'rack').eq('parent_entity_id', str(rack_id)).execute()
    rack_data['has_notes'] = bool(rack_notes_res.data)

    equipment_ids = [str(instance['id']) for instance in equipment_instances]
    equipment_notes_res = supabase.table('notes').select('parent_entity_id').eq('parent_entity_type', 'equipment_instance').in_('parent_entity_id', equipment_ids).execute()
    equipment_with_notes = {note['parent_entity_id'] for note in equipment_notes_res.data}

    # 7. Attach the full template data and notes status to each equipment instance
    for instance in equipment_instances:
        instance['equipment_templates'] = template_map.get(instance['template_id'])
        instance['has_notes'] = str(instance['id']) in equipment_with_notes
        
    rack_data['equipment'] = equipment_instances
    return rack_data

@router.get("/shows/{show_id}/detailed_racks", response_model=List[Rack], tags=["Racks"], dependencies=[Depends(feature_check("rack_builder"))])
async def get_detailed_racks_for_show(show_id: int, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    # 1. Get all racks for the show
    racks_res = supabase.table('racks').select('*').eq('show_id', show_id).eq('user_id', str(user.id)).execute()
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
        
    # 7. Fetch notes for all racks and equipment
    rack_notes_res = supabase.table('notes').select('parent_entity_id').eq('parent_entity_type', 'rack').in_('parent_entity_id', rack_ids).execute()
    racks_with_notes = {note['parent_entity_id'] for note in rack_notes_res.data}

    equipment_ids = [str(instance['id']) for instance in equipment_instances]
    equipment_notes_res = supabase.table('notes').select('parent_entity_id').eq('parent_entity_type', 'equipment_instance').in_('parent_entity_id', equipment_ids).execute()
    equipment_with_notes = {note['parent_entity_id'] for note in equipment_notes_res.data}

    # 8. Attach notes status to equipment instances
    for instance in equipment_instances:
        instance['has_notes'] = str(instance['id']) in equipment_with_notes
        
    # 9. Attach the equipment lists and notes status to their parent racks
    for rack in racks:
        rack['equipment'] = rack_equipment_map.get(rack['id'], [])
        rack['has_notes'] = str(rack['id']) in racks_with_notes
        
    return racks

@router.get("/shows/{show_id}/racks/export-list", tags=["Racks"], dependencies=[Depends(feature_check("rack_builder"))])
async def export_racks_list_pdf(show_id: int, user = Depends(get_user), show_branding: bool = Depends(get_branding_visibility), supabase: Client = Depends(get_supabase_client)):
    """Exports a list of all equipment across all racks in a show to a PDF file."""
    
    # 1. Get Show Info
    show_res = supabase.table('shows').select('id, name, data').eq('id', show_id).eq('user_id', user.id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found")
    show_name = show_res.data.get('name', 'Show')

    # 2. Get all racks for the show to build a name map
    racks_res = supabase.table('racks').select('id, rack_name').eq('show_id', show_id).execute()
    rack_map = {r['id']: r['rack_name'] for r in racks_res.data}
    rack_ids = list(rack_map.keys())

    if not rack_ids:
        raise HTTPException(status_code=404, detail="No racks found for this show to export.")

    # 3. Get all equipment instances for those racks and join with templates
    instances_res = supabase.table('rack_equipment_instances') \
        .select('*, equipment_templates!inner(manufacturer, model_number)') \
        .in_('rack_id', rack_ids) \
        .execute()

    # 4. Process data and aggregate quantities
    equipment_counts = {}
    for item in instances_res.data:
        template = item.get('equipment_templates')
        if not template:
            continue

        manufacturer = template.get('manufacturer', 'N/A')
        model = template.get('model_number', 'N/A')
        
        key = (manufacturer, model)
        equipment_counts[key] = equipment_counts.get(key, 0) + 1

    # 5. Format data for PDF generation
    table_data = [
        ["Manufacturer", "Model Name", "Qty"]
    ]
    for (manufacturer, model), qty in sorted(equipment_counts.items()):
        table_data.append([manufacturer, model, str(qty)])
        
    # 6. Generate PDF (function to be created in pdf_utils.py)
    from .pdf_utils import generate_equipment_list_pdf
    pdf_buffer = generate_equipment_list_pdf(
        show_name=show_name,
        table_data=table_data,
        show_branding=show_branding
    )
    
    filename = f"{show_name.strip()}_Equipment_List.pdf"
    
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )

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
        existing_rack_res = supabase.table('racks').select('id').eq('show_id', load_data.show_id).eq('user_id', str(user.id)).eq('rack_name', load_data.new_rack_name).execute()
        if existing_rack_res.data:
            raise HTTPException(status_code=409, detail=f"A rack with the name '{load_data.new_rack_name}' already exists in this show.")

        # 3. Create the new rack with the unique name
        new_rack_data = {
            "rack_name": load_data.new_rack_name,
            "ru_height": template_rack['ru_height'],
            "show_id": load_data.show_id,
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
    rack_res = supabase.table('racks').select('id, ru_height, show_id').eq('id', str(rack_id)).eq('user_id', str(user.id)).single().execute()
    if not rack_res.data:
        raise HTTPException(status_code=404, detail="Rack not found or access denied")

    template_res = supabase.table('equipment_templates').select('*, folders(nomenclature_prefix)').eq('id', str(equipment_data.template_id)).single().execute()
    if not template_res.data:
        raise HTTPException(status_code=404, detail="Equipment template not found")
        
    template = template_res.data
    
    # Get all equipment in the show for nomenclature calculation
    show_id = rack_res.data['show_id']
    all_racks_res = supabase.table('racks').select('id').eq('show_id', show_id).eq('user_id', str(user.id)).execute()
    all_rack_ids = [r['id'] for r in all_racks_res.data]
    
    all_show_equipment_res = supabase.table('rack_equipment_instances').select('instance_name').in_('rack_id', all_rack_ids).execute()
    all_show_equipment = all_show_equipment_res.data

    # Get equipment for the current rack for collision detection
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
    for item in all_show_equipment:
        if item['instance_name'].startswith(base_name + "-"):
            try:
                num = int(item['instance_name'].split('-')[-1])
                if num > highest_num:
                    highest_num = num
            except (ValueError, IndexError):
                continue
    
    new_instance_name = f"{base_name}-{(highest_num + 1):02}"

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

@router.post("/equipment_instances", response_model=RackEquipmentInstanceWithTemplate, tags=["Racks"])
async def create_equipment_instance(
    equipment_data: EquipmentInstanceCreate, 
    user = Depends(get_user), 
    supabase: Client = Depends(get_supabase_client)
):
    """Creates an equipment instance, initially un-racked."""
    # 2. Find or create the "[Unracked]" rack for this show
    unracked_rack_name = "[Unracked]"
    rack_query = supabase.table('racks').select('id').eq('show_id', equipment_data.show_id).eq('rack_name', unracked_rack_name).eq('user_id', str(user.id)).execute()
    
    if rack_query.data:
        rack_id = rack_query.data[0]['id']
    else:
        new_rack_res = supabase.table('racks').insert({
            "rack_name": unracked_rack_name,
            "ru_height": 0,
            "show_id": equipment_data.show_id,
            "user_id": str(user.id)
        }).execute()
        if not new_rack_res.data:
            raise HTTPException(status_code=500, detail="Failed to create a temporary rack for the equipment.")
        rack_id = new_rack_res.data[0]['id']

    # 3. Fetch the equipment template
    template_res = supabase.table('equipment_templates').select('*, folders(nomenclature_prefix)').eq('id', str(equipment_data.equipment_template_id)).single().execute()
    if not template_res.data:
        raise HTTPException(status_code=404, detail="Equipment template not found.")
    template = template_res.data

    # 4. Get all equipment in the show for nomenclature calculation
    all_racks_res = supabase.table('racks').select('id').eq('show_id', equipment_data.show_id).eq('user_id', str(user.id)).execute()
    all_rack_ids = [r['id'] for r in all_racks_res.data]
    
    all_show_equipment_res = supabase.table('rack_equipment_instances').select('instance_name').in_('rack_id', all_rack_ids).execute()
    all_show_equipment = all_show_equipment_res.data if all_show_equipment_res.data else []

    prefix = template.get('folders', {}).get('nomenclature_prefix') if template.get('folders') else None
    base_name = prefix if prefix else template['model_number']
    
    highest_num = 0
    for item in all_show_equipment:
        if item['instance_name'].startswith(base_name + "-"):
            try:
                num = int(item['instance_name'].split('-')[-1])
                if num > highest_num:
                    highest_num = num
            except (ValueError, IndexError):
                continue
    
    new_instance_name = f"{base_name}-{(highest_num + 1):02}"

    # 5. Create the new equipment instance
    insert_data = {
        "rack_id": rack_id,
        "template_id": str(equipment_data.equipment_template_id),
        "ru_position": 1, # Default for un-racked items, won't be used
        "rack_side": "front",
        "instance_name": new_instance_name,
        "x_pos": equipment_data.x_pos,
        "y_pos": equipment_data.y_pos,
        "page_number": equipment_data.page_number,
    }
    
    response = supabase.table('rack_equipment_instances').insert(insert_data).execute()
    
    if response.data:
        new_instance = response.data[0]
        new_instance['equipment_templates'] = template
        return new_instance
        
    raise HTTPException(status_code=500, detail="Failed to create equipment instance.")


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
        "user_id": str(user.id),
        "has_ip_address": equipment_data.has_ip_address
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
            
        show_id_res = supabase.table('racks').select('show_id, user_id').eq('id', source_device_res.data['rack_id']).single().execute()
        if not show_id_res.data or show_id_res.data['user_id'] != str(user.id):
            raise HTTPException(status_code=403, detail="Not authorized to create a connection in this show.")

        insert_data = connection_data.model_dump(mode='json')
        insert_data['show_id'] = show_id_res.data['show_id']
        
        response = supabase.table('connections').insert(insert_data).execute()
        if response.data:
            return response.data[0]
        raise HTTPException(status_code=500, detail="Failed to create connection.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/shows/{show_id}/unassigned_equipment", tags=["Wire Diagram"], response_model=List[RackEquipmentInstanceWithTemplate])
async def get_unassigned_equipment(show_id: int, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves all equipment for a show that has not been assigned to a wire diagram page."""
    try:
        # First, get all racks for the given show and user
        racks_res = supabase.table('racks').select('id').eq('show_id', show_id).eq('user_id', str(user.id)).execute()
        if not racks_res.data:
            return [] # No racks for this show, so no equipment

        rack_ids = [rack['id'] for rack in racks_res.data]

        # Now, get all equipment instances from those racks where page_number is null
        # Eager load the template data as well, as the frontend will need it
        equipment_res = supabase.table('rack_equipment_instances').select('*, equipment_templates(*)').in_('rack_id', rack_ids).is_('page_number', None).execute()
        
        return equipment_res.data if equipment_res.data else []

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch unassigned equipment: {str(e)}")

@router.get("/shows/{show_id}/connections", tags=["Wire Diagram"], dependencies=[Depends(feature_check("wire_diagram"))])
async def get_connections_for_show(show_id: int, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves all connections for a specific show."""
    try:
        response = supabase.table('connections').select('*').eq('show_id', show_id).execute()
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
        show_id = conn_res.data['show_id']
        is_owner = supabase.table('shows').select('user_id').eq('id', show_id).eq('user_id', str(user.id)).single().execute()
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

@router.post("/pdf/loom_builder-labels", tags=["PDF Generation"], dependencies=[Depends(feature_check("loom_builder"))])
async def create_loom_builder_pdf(payload: LoomBuilderPDFPayload, user = Depends(get_user), show_branding: bool = Depends(get_branding_visibility), supabase: Client = Depends(get_supabase_client)):
    loom_ids = [loom.id for loom in payload.looms]
    looms_res = supabase.table('looms').select('id, user_id').in_('id', loom_ids).execute()
    for loom in looms_res.data:
        if loom['user_id'] != str(user.id):
            raise HTTPException(status_code=403, detail="You do not have access to one or more of the requested looms.")

    cables_res = supabase.table('cables').select('*').in_('loom_id', loom_ids).execute()
    cables_by_loom = {}
    for cable in cables_res.data:
        loom_id = cable['loom_id']
        if loom_id not in cables_by_loom:
            cables_by_loom[loom_id] = []
        cables_by_loom[loom_id].append(cable)
        
    final_looms = [
        LoomWithCables(
            **loom_data.model_dump(exclude={'cables'}),
            cables=[Cable(**c) for c in cables_by_loom.get(str(loom_data.id), [])]
        ) for loom_data in payload.looms
    ]
    
    pdf_payload = LoomBuilderPDFPayload(looms=final_looms, show_name=payload.show_name)
    pdf_buffer = generate_loom_builder_pdf(pdf_payload, show_branding=show_branding)
    return Response(content=pdf_buffer.getvalue(), media_type="application/pdf")

@router.post("/pdf/loom-labels", tags=["PDF Generation"], dependencies=[Depends(feature_check("loom_labels"))])
async def create_loom_label_pdf(payload: LoomLabelPayload, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    pdf_buffer = generate_loom_label_pdf(payload.labels, payload.placement)
    return Response(content=pdf_buffer.getvalue(), media_type="application/pdf")

@router.post("/pdf/case-labels", tags=["PDF Generation"], dependencies=[Depends(feature_check("case_labels"))])
async def create_case_label_pdf(payload: CaseLabelPayload, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    # Per user feedback, user-uploaded show logos should ALWAYS be visible.
    # The 'pdf_logo' restriction does not apply here.
    logo_bytes = None
    if payload.logo_path:
        try:
            response = supabase.storage.from_('logos').download(payload.logo_path)
            logo_bytes = response
        except Exception as e:
            print(f"Could not download logo: {e}")

    pdf_buffer = generate_case_label_pdf(payload.labels, logo_bytes, payload.placement)
    return Response(content=pdf_buffer.getvalue(), media_type="application/pdf")


@router.post("/pdf/racks", tags=["PDF Generation"], dependencies=[Depends(feature_check("rack_builder"))])
async def create_racks_pdf(payload: RackPDFPayload, user = Depends(get_user), show_branding: bool = Depends(get_branding_visibility), supabase: Client = Depends(get_supabase_client)):
    """Generates a PDF for the rack builder view."""
    try:
        pdf_buffer = generate_racks_pdf(payload, show_branding=show_branding)
        return Response(content=pdf_buffer.getvalue(), media_type="application/pdf")
    except Exception as e:
        print(f"Error generating rack PDF: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")

@router.post("/pdf/hours-labels", tags=["PDF Generation"], dependencies=[Depends(feature_check("hours_tracking"))])
async def create_hours_pdf(payload: HoursPDFPayload, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Generates a PDF for the hours tracking view."""
    try:
        pdf_buffer = generate_hours_pdf(payload.model_dump())
        return Response(content=pdf_buffer.getvalue(), media_type="application/pdf")
    except Exception as e:
        print(f"Error generating hours PDF: {e}")
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
