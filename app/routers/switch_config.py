from fastapi import APIRouter, Depends, HTTPException, status, Query
from supabase import Client
from app.api import get_supabase_client, get_user
from app.models import (
    SwitchConfig, SwitchConfigCreate,
    SwitchSidebarGroup, PortConfig,
    PushJob, PushJobCreate, PushJobStatus,
    SwitchDetails
)
import uuid
from typing import List, Dict
import json
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding


router = APIRouter(tags=["Switch Configuration"])

@router.get("/switches", response_model=List[SwitchSidebarGroup])
def get_switches_for_sidebar(show_id: int = Query(...), supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Gets all configurable switches for a given show, structured for the sidebar.
    """
    response = supabase.rpc('get_configurable_switches_for_show', {'p_show_id': show_id}).execute()
    
    return response.data

@router.post("/switches", response_model=SwitchConfig, status_code=status.HTTP_201_CREATED)
def create_switch_config(
    payload: SwitchConfigCreate,
    supabase: Client = Depends(get_supabase_client),
    user=Depends(get_user)
):
    """
    Creates a new, empty switch configuration for a given rack equipment item.
    """
    rack_item_id_str = str(payload.rack_item_id)
    
    # 1. Fetch rack item to get show_id
    rack_item_res = supabase.table("rack_equipment_instances").select("racks(show_id)").eq("id", rack_item_id_str).single().execute()
    
    if not rack_item_res.data or not rack_item_res.data.get('racks'):
        raise HTTPException(status_code=404, detail="Rack equipment or associated rack not found.")
    
    show_id = rack_item_res.data['racks']['show_id']

    # 2. Insert new switch_config
    new_uuid = uuid.uuid4()
    insert_payload = {
        "id": str(new_uuid),
        "rack_item_id": rack_item_id_str,
        "show_id": show_id,
        "port_config": {}
    }
    
    # Supabase-py does not support .select() after .insert()
    supabase.table("switch_configs").insert(insert_payload).execute()
    
    # Fetch the newly created record
    select_res = supabase.table("switch_configs").select("*").eq("id", str(new_uuid)).single().execute()

    if not select_res.data:
        raise HTTPException(status_code=500, detail="Failed to create or retrieve switch configuration.")

    return select_res.data

@router.get("/switches/{switch_id}/details", response_model=SwitchDetails)
def get_switch_details(switch_id: uuid.UUID, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Gets detailed information for a specific switch, including model details.
    """
    switch_id_str = str(switch_id)
    
    # RLS ensures the user can only query switches in their shows.
    response = supabase.table("switch_configs").select("*, rack_equipment_instances(*, equipment_templates(*, switch_models(*)))").eq("id", switch_id_str).single().execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Switch configuration not found.")

    # Flatten the complex nested response into the SwitchDetails model
    switch_config = response.data
    rack_item = switch_config.get('rack_equipment_instances', {})
    template = rack_item.get('equipment_templates', {})
    model = template.get('switch_models', {})

    return SwitchDetails(
        id=switch_config['id'],
        rack_item_id=switch_config['rack_item_id'],
        show_id=switch_config['show_id'],
        name=rack_item.get('instance_name', 'Unnamed Switch'),
        model_name=model.get('model_name', 'Unknown Model'),
        port_count=model.get('port_count', 0),
        created_at=switch_config['created_at']
    )

@router.put("/switches/{switch_id}/config", response_model=SwitchConfig)
def save_switch_port_config(switch_id: uuid.UUID, port_configs: Dict[str, PortConfig], supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Saves the entire port configuration blob for a switch.
    """
    # Convert Pydantic models to dict for JSONB storage
    config_dict = {port: config.model_dump() for port, config in port_configs.items()}
    
    supabase.table("switch_configs").update({"port_config": config_dict}).eq("id", str(switch_id)).execute()
    
    # Fetch the updated record
    response = supabase.table("switch_configs").select("*").eq("id", str(switch_id)).single().execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Switch configuration not found or update failed.")

    return response.data

@router.post("/switches/{switch_id}/push_config", response_model=PushJob)
def create_push_job(switch_id: uuid.UUID, job_data: PushJobCreate, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Creates a new push job for the local agent to execute, encrypting credentials with the agent's public key.
    """
    user_id = user.id
    switch_id_str = str(switch_id)

    # Get show_id from switch_config
    switch_res = supabase.table("switch_configs").select("show_id").eq("id", switch_id_str).single().execute()
    if not switch_res.data:
        raise HTTPException(status_code=404, detail="Switch configuration not found.")
    show_id = switch_res.data['show_id']

    # Fetch agent's public key
    key_res = supabase.table("agent_api_keys").select("public_key").eq("user_id", str(user_id)).limit(1).single().execute()
    if not key_res.data or not key_res.data.get('public_key'):
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

    new_job_id = uuid.uuid4()
    job_insert_data = {
        "id": str(new_job_id),
        "show_id": show_id,
        "switch_id": switch_id_str,
        "user_id": str(user_id),
        "target_ip": job_data.target_ip,
        "target_credentials": encrypted_credentials,
        "status": "pending"
    }

    supabase.table("switch_push_jobs").insert(job_insert_data).execute()
    
    job_res = supabase.table("switch_push_jobs").select("*").eq("id", str(new_job_id)).single().execute()

    if not job_res.data:
        raise HTTPException(status_code=500, detail="Failed to create push job.")

    return job_res.data

@router.get("/push_jobs/{job_id}", response_model=PushJobStatus)
def get_push_job_status(job_id: uuid.UUID, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Polls the status of a specific push job.
    """
    job_id_str = str(job_id)
    user_id_str = str(user.id)
    
    # RLS on switch_push_jobs table ensures user can only see their own jobs.
    response = supabase.table("switch_push_jobs").select("status, result_log").eq("id", job_id_str).eq("user_id", user_id_str).single().execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    return response.data
