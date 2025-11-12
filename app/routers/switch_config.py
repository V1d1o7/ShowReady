from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from app.api import get_supabase_client, get_user
from app.models import (
    Switch, SwitchCreate, SwitchDetails,
    SwitchPortConfig, SwitchPortConfigCreate, PortConfig,
    PushJob, PushJobCreate, PushJobStatus,
    SwitchSidebarGroup,
)
import uuid
from typing import List
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
import json

router = APIRouter(tags=["Switch Configuration"])

@router.get("/switches", response_model=List[SwitchSidebarGroup])
def get_switches_for_sidebar(show_id: int = Query(...), supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Gets all configurable switches for a given show, structured for the sidebar.
    """
    # Note: Assumes RLS on the called function `get_configurable_switches_for_show`
    # handles user access rights based on the provided show_id.
    response = supabase.rpc('get_configurable_switches_for_show', {'p_show_id': show_id}).execute()
    
    if response.error:
        raise HTTPException(status_code=500, detail=f"Failed to get switches: {response.error.message}")

    flat_list = response.data
    
    rack_groups = {}
    for item in flat_list:
        rack_name = item['rack_name']
        if rack_name not in rack_groups:
            rack_groups[rack_name] = {
                "rack_id": item['rack_id'],
                "rack_name": rack_name,
                "items": []
            }
        rack_groups[rack_name]['items'].append({
            "rack_item_id": item['rack_item_id'],
            "switch_name": item['switch_name'],
            "switch_config_id": item['switch_config_id']
        })
        
    return list(rack_groups.values())

@router.post("/switches", response_model=Switch, status_code=201)
def create_switch_config(switch_data: SwitchCreate, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Creates a new switch configuration for a given rack item.
    """
    # 1. Get rack_item details to find show_id and equipment_id
    # RLS ensures user can only access their own data.
    rack_item_res = supabase.table("rack_equipment_instances").select("*, racks(show_id), equipment_templates(switch_model_id, model_number, manufacturer)").eq("id", str(switch_data.rack_item_id)).single().execute()
    if not rack_item_res.data:
        raise HTTPException(status_code=404, detail="Rack item not found.")

    rack_item = rack_item_res.data
    show_id = rack_item.get('racks', {}).get('show_id')
    equipment = rack_item.get('equipment_templates', {})
    model_id = equipment.get('switch_model_id')

    if not show_id:
        raise HTTPException(status_code=400, detail="Could not determine the show for the rack item.")
    if not model_id:
        raise HTTPException(status_code=400, detail="The selected equipment is not a configurable switch model.")
    
    # 2. Create the new switch entry
    insert_data = {
        "show_id": show_id,
        "model_id": model_id,
        "rack_item_id": str(switch_data.rack_item_id),
        "name": rack_item.get('instance_name', f"{equipment.get('manufacturer')} {equipment.get('model_number')}")
    }
    
    switch_res = supabase.table("switches").insert(insert_data).execute()
    
    if switch_res.error or not switch_res.data:
        raise HTTPException(status_code=500, detail="Failed to create switch configuration.")

    return switch_res.data[0]

@router.get("/switches/{switch_id}/details", response_model=SwitchDetails)
def get_switch_details(switch_id: uuid.UUID, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Gets detailed information for a specific switch, including port count.
    """
    response = supabase.table("switches").select("*, switch_models(port_count, model_name)").eq("id", str(switch_id)).single().execute()
    if response.error or not response.data:
        raise HTTPException(status_code=404, detail="Switch not found.")
    
    # Flatten the response
    switch = response.data
    model_details = switch.pop('switch_models', {})
    switch['port_count'] = model_details.get('port_count', 0)
    switch['model_name'] = model_details.get('model_name', 'Unknown Model')

    return switch

@router.get("/switches/{switch_id}/config", response_model=List[SwitchPortConfig])
def get_switch_port_configs(switch_id: uuid.UUID, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Gets all saved port configurations for a specific switch.
    """
    response = supabase.table("switch_port_configs").select("*").eq("switch_id", str(switch_id)).execute()
    if response.error:
        raise HTTPException(status_code=500, detail=response.error.message)
    return response.data if response.data else []

@router.put("/switches/{switch_id}/config", response_model=SwitchPortConfig)
def upsert_switch_port_config(switch_id: uuid.UUID, port_config_data: SwitchPortConfigCreate, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Saves the configuration for a single port. Does not auto-create VLANs.
    """
    # This endpoint now *only* saves the port configuration.
    # VLAN creation is handled explicitly by the user via the frontend.
    
    upsert_data = {
        "switch_id": str(switch_id),
        "port_number": port_config_data.port_number,
        "config": port_config_data.config.model_dump()
    }
    
    response = supabase.table("switch_port_configs").upsert(
        upsert_data, 
        on_conflict="switch_id,port_number"
    ).execute()

    if response.error or not response.data:
        raise HTTPException(status_code=500, detail="Failed to save port configuration.")
    
    return response.data[0]


@router.post("/switches/{switch_id}/push_config", response_model=PushJob)
def create_push_job(switch_id: uuid.UUID, job_data: PushJobCreate, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Creates a new push job for the local agent, encrypting credentials with the agent's public key.
    """
    user_id = user.id
    switch_res = supabase.table("switches").select("show_id").eq("id", str(switch_id)).single().execute()
    if switch_res.error or not switch_res.data:
        raise HTTPException(status_code=404, detail="Switch not found")
    show_id = switch_res.data['show_id']

    key_res = supabase.table("agent_api_keys").select("public_key").eq("user_id", str(user_id)).limit(1).single().execute()
    if key_res.error or not key_res.data or not key_res.data.get('public_key'):
        raise HTTPException(status_code=400, detail="No active agent with a public key found for your account. Please register an agent.")
    
    public_key_pem = key_res.data['public_key']
    
    try:
        public_key = serialization.load_pem_public_key(public_key_pem.encode('utf-8'))
        credentials_json = json.dumps({"username": job_data.username, "password": job_data.password})
        
        encrypted_credentials = public_key.encrypt(
            credentials_json.encode('utf-8'),
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to encrypt credentials: {str(e)}")

    job_insert_data = {
        "show_id": show_id,
        "switch_id": str(switch_id),
        "user_id": str(user_id),
        "target_ip": job_data.target_ip,
        "target_credentials": encrypted_credentials,
        "status": "pending"
    }

    job_res = supabase.table("switch_push_jobs").insert(job_insert_data).execute()

    if job_res.error or not job_res.data:
        raise HTTPException(status_code=500, detail="Failed to create push job.")

    return job_res.data[0]

@router.get("/push_jobs/{job_id}", response_model=PushJobStatus)
def get_push_job_status(job_id: uuid.UUID, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Polls the status of a specific push job.
    """
    response = supabase.table("switch_push_jobs").select("status, result_log").eq("id", str(job_id)).eq("user_id", str(user.id)).single().execute()
    if response.error or not response.data:
        raise HTTPException(status_code=404, detail="Job not found.")
    return response.data
