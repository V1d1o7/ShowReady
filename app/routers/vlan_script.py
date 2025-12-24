from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
import uuid
from supabase import Client
from typing import List
# Use shared dependencies to ensure consistent RLS and Feature Checks
from ..api import get_supabase_client, get_user, feature_check

# Apply the feature restriction to the entire router
router = APIRouter(
    dependencies=[Depends(feature_check("vlan_management"))]
)

class VlanScriptRequest(BaseModel):
    interface_name: str
    virtual_switch_name: str
    vlan_ids: List[uuid.UUID]

@router.post("/vlans/{show_id}/generate-script", tags=["VLANs"])
async def generate_vlan_script(
    show_id: int, 
    payload: VlanScriptRequest, 
    user = Depends(get_user), 
    supabase: Client = Depends(get_supabase_client)
):
    """
    Generates a PowerShell script for creating a virtual switch and adding VLANs.
    The user must have collaborator access to the show.
    """
    # 1. Verify user has access to the show and get its ID.
    show_res = supabase.table('shows').select('id').eq('id', show_id).eq('user_id', user.id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")

    # 2. Fetch the specified VLANs from the database.
    if not payload.vlan_ids:
        raise HTTPException(status_code=400, detail="No VLANs selected for script generation.")
        
    vlan_ids_str = [str(vid) for vid in payload.vlan_ids]
    # Fetch VLANs (RLS is handled by the authenticated client)
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
        script_lines.append(f'Add-VMNetworkAdapter -ManagementOS -Name "{vlan["name"]}" -SwitchName "{payload.virtual_switch_name}" -Passthru | Set-VMNetworkAdapterVlan -Access -VlanId {vlan["tag"]}')

    script_content = "\n".join(script_lines)

    return PlainTextResponse(
        script_content,
        headers={
            "Content-Disposition": "attachment; filename=vlan_setup.ps1"
        }
    )