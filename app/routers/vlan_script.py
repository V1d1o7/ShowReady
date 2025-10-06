from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
import uuid
from supabase import create_client, Client
from gotrue.errors import AuthApiError
import os
from typing import List
from .. import models

router = APIRouter()

class VlanScriptRequest(BaseModel):
    interface_name: str
    virtual_switch_name: str
    vlan_ids: List[uuid.UUID]

# --- Supabase Client Dependency ---
def get_supabase_client():
    """Dependency to create a Supabase client."""
    return create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY"))

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


@router.post("/api/shows/{show_name}/generate-vlan-script", tags=["VLANs"])
async def generate_vlan_script(show_name: str, payload: VlanScriptRequest, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Generates a PowerShell script for creating a virtual switch and adding VLANs.
    The user must have collaborator access to the show.
    """
    # 1. Verify user has access to the show and get its ID.
    show_res = supabase.table('shows').select('id').eq('name', show_name).eq('user_id', user.id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")
    show_id = show_res.data['id']

    # 2. Fetch the specified VLANs from the database.
    if not payload.vlan_ids:
        raise HTTPException(status_code=400, detail="No VLANs selected for script generation.")
        
    vlan_ids_str = [str(vid) for vid in payload.vlan_ids]
    vlans_res = supabase.table('vlans').select('*').in_('id', vlan_ids_str).execute()
    
    if not vlans_res.data:
        raise HTTPException(status_code=404, detail="Selected VLANs not found.")

    # 3. Ensure all fetched VLANs belong to the given show_id.
    for vlan in vlans_res.data:
        if vlan['show_id'] != show_id:
            raise HTTPException(status_code=403, detail="One or more selected VLANs do not belong to this show.")

    # 4. Construct the PowerShell script string.
    script_lines = [
        f"New-VMSwitch -name \"{payload.virtual_switch_name}\" -NetAdapterName \"{payload.interface_name}\" -AllowManagementOS $true",
        f"Remove-VMNetworkAdapter -ManagementOS -Name \"{payload.virtual_switch_name}\""
    ]

    for vlan in vlans_res.data:
        script_lines.append(f'Add-VMNetworkAdapter -ManagementOS -Name "MGMT 1" -SwitchName "{vlan["name"]}" -Passthru | Set-VMNetworkAdapterVlan -Access -VlanId {vlan["tag"]}')

    script_content = "\n".join(script_lines)

    return PlainTextResponse(
        script_content,
        headers={
            "Content-Disposition": "attachment; filename=vlan_setup.ps1"
        }
    )