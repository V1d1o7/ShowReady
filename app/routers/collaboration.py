from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from app.api import get_supabase_client, get_user, get_service_client
from app.models import Collaborator, CollaboratorInvite, CollaboratorUpdate
import uuid
from typing import List

router = APIRouter()

async def ensure_owner_consistency(show_id: int, user_id: uuid.UUID, supabase: Client):
    """
    ROOT FIX: Checks if the user is the actual Creator (shows.user_id).
    If they are, but are missing from show_collaborators, it auto-heals the data by inserting them.
    Returns True if the user is the owner (validated via either table).
    """
    # 1. Check the 'shows' table (The Source of Truth)
    # FIX: Use execute() instead of maybe_single() to avoid NoneType errors on 204 No Content
    show_res = supabase.table('shows').select('user_id').eq('id', show_id).execute()
    
    # If no data returned, show doesn't exist or RLS is blocking access.
    if not show_res.data:
        return False
        
    real_owner_id = show_res.data[0]['user_id']
    is_creator = str(real_owner_id) == str(user_id)

    if is_creator:
        # 2. Self-Healing: Check if they are missing from collaborators
        # FIX: Cast user_id to string for safety
        collab_res = supabase.table('show_collaborators').select('role').eq('show_id', show_id).eq('user_id', str(user_id)).execute()
        
        if not collab_res.data:
            print(f"fixing data integrity: Inserting missing owner {user_id} into show_collaborators for show {show_id}")
            # Use service client to bypass RLS during repair if needed
            admin_client = get_service_client() 
            admin_client.table('show_collaborators').insert({
                "show_id": show_id,
                "user_id": str(user_id),
                "role": "owner"
            }).execute()
        return True

    # 3. If not creator, check if they are a delegated owner in collaborators table
    role_res = supabase.table('show_collaborators').select('role').eq('show_id', show_id).eq('user_id', str(user_id)).execute()
    if role_res.data and role_res.data[0]['role'] == 'owner':
        return True
        
    return False

@router.get("/shows/{show_id}/collaborators", response_model=List[Collaborator], tags=["Collaboration"])
async def list_show_collaborators(show_id: int, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Lists all collaborators for a show. Only accessible if you have access to the show."""
    
    # 1. Verify access implicitly via RLS
    show_check = supabase.table('shows').select('id').eq('id', show_id).execute()
    if not show_check.data:
        raise HTTPException(status_code=403, detail="Show not found or access denied.")

    # 2. Fetch collaborators
    admin_client = get_service_client()
    collab_res = admin_client.table('show_collaborators').select('*').eq('show_id', show_id).execute()
    collaborators = collab_res.data
    
    if not collaborators:
        return []

    user_ids = [c['user_id'] for c in collaborators]
    
    # Fetch profiles
    profiles_res = admin_client.table('profiles').select('id, first_name, last_name').in_('id', user_ids).execute()
    profiles_map = {p['id']: p for p in profiles_res.data}
    
    result = []
    for c in collaborators:
        profile = profiles_map.get(c['user_id'], {})
        result.append({
            "user_id": c['user_id'],
            "show_id": c['show_id'],
            "role": c['role'],
            "first_name": profile.get('first_name'),
            "last_name": profile.get('last_name'),
            "email": "Hidden"
        })
        
    return result

@router.post("/shows/{show_id}/collaborators", tags=["Collaboration"])
async def invite_collaborator(show_id: int, invite: CollaboratorInvite, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Invites a user. Checks against the Show Owner's tier limits."""
    
    # 1. ROBUST PERMISSION CHECK (With Self-Healing)
    is_owner = await ensure_owner_consistency(show_id, user.id, supabase)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Only show owners can invite collaborators.")

    # 2. CHECK LIMITS
    # Re-fetch owner ID from shows table to check THEIR tier
    show_res = supabase.table('shows').select('user_id').eq('id', show_id).execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found.")
    owner_id = show_res.data[0]['user_id']
    
    # FIX: Check current count BUT EXCLUDE THE OWNER
    count_res = supabase.table('show_collaborators') \
        .select('user_id', count='exact') \
        .eq('show_id', show_id) \
        .neq('user_id', owner_id) \
        .execute()
    current_count = count_res.count
    
    admin_client = get_service_client()
    
    # Fetch Owner Entitlements & Tier Config
    owner_profile_res = admin_client.table('profiles').select('tier_id, tiers(name, max_collaborators)').eq('id', owner_id).execute()
    
    # Handle case where owner profile might be missing (rare but safe)
    owner_profile_data = owner_profile_res.data[0] if owner_profile_res.data else {}
    
    # Fetch Entitlements
    owner_entitlements_res = admin_client.table('user_entitlements').select('is_founding').eq('user_id', owner_id).execute()
    
    is_founding = False
    if owner_entitlements_res.data:
        is_founding = owner_entitlements_res.data[0].get('is_founding', False)
    
    if not is_founding:
        tier_info = owner_profile_data.get('tiers', {})
        if not tier_info:
             # Fallback if tiers join failed
             limit = 3 # Default to safe low limit
             tier_name = 'unknown'
        else:
            limit = tier_info.get('max_collaborators')
            tier_name = tier_info.get('name', 'unknown')

        if limit is not None and current_count >= limit:
             raise HTTPException(status_code=403, detail=f"Collaborator limit reached for the {tier_name.capitalize()} tier ({limit} users). Upgrade to add more.")

    # 3. Find User by Email
    try:
        page = 1
        found_user = None
        while True:
            users_resp = admin_client.auth.admin.list_users(page=page, per_page=100)
            users = users_resp.users if hasattr(users_resp, 'users') else users_resp
            if not users: break
            for u in users:
                if u.email.lower() == invite.email.lower():
                    found_user = u
                    break
            if found_user: break
            page += 1
            
        if not found_user:
             raise HTTPException(status_code=404, detail=f"User with email {invite.email} not found. They must have an account to be invited.")
        target_user_id = found_user.id
    except Exception as e:
        print(f"Error finding user: {e}")
        # Only raise 404 if we explicitly didn't find them, otherwise generic 500
        if "User with email" in str(e):
            raise e
        raise HTTPException(status_code=500, detail="Failed to lookup user.")

    # 4. Insert
    try:
        new_collab = { "show_id": show_id, "user_id": target_user_id, "role": invite.role }
        admin_client.table('show_collaborators').upsert(new_collab).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add collaborator: {str(e)}")

    return {"message": "Collaborator added successfully."}

@router.delete("/shows/{show_id}/collaborators/{user_id}", tags=["Collaboration"])
async def remove_collaborator(show_id: int, user_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Removes a collaborator."""
    
    is_self_removal = str(user.id) == str(user_id)
    
    # Check ownership using the robust method
    is_owner = False
    try:
        is_owner = await ensure_owner_consistency(show_id, user.id, supabase)
    except:
        pass
    
    if not (is_self_removal or is_owner):
        raise HTTPException(status_code=403, detail="You do not have permission to remove this collaborator.")

    admin_client = get_service_client()
    admin_client.table('show_collaborators').delete().eq('show_id', show_id).eq('user_id', str(user_id)).execute()
    
    return {"message": "Collaborator removed."}

@router.put("/shows/{show_id}/collaborators/{user_id}", tags=["Collaboration"])
async def update_collaborator_role(show_id: int, user_id: uuid.UUID, update: CollaboratorUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates a collaborator's role."""
    
    is_owner = await ensure_owner_consistency(show_id, user.id, supabase)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Only owners can change roles.")

    admin_client = get_service_client()
    admin_client.table('show_collaborators').update({"role": update.role}).eq('show_id', show_id).eq('user_id', str(user_id)).execute()
    
    return {"message": "Role updated."}