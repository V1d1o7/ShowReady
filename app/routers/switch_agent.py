from fastapi import APIRouter, Depends, HTTPException, Header
from supabase import Client
from app.api import get_supabase_client, get_user
from app.models import (
    AgentPublicKeyUpload, PushJob, PushJobStatus,
    EncryptedCredentials, AgentCliResponse,
    AgentApiKeyCreate, AgentApiKeyWithKey
)
from app.services.switch_generator import generate_netgear_cli
import uuid
import secrets
from typing import List, Annotated
import hashlib

router = APIRouter(tags=["Agent"])

@router.post("/agent/api-keys", response_model=AgentApiKeyWithKey)
def create_agent_api_key(
    key_data: AgentApiKeyCreate,
    supabase: Client = Depends(get_supabase_client),
    user=Depends(get_user)
):
    """
    Creates a new API key for a local agent. The key is returned only once.
    """
    # 1. Generate a new secure key
    new_key = f"sr_{secrets.token_urlsafe(32)}"
    key_prefix = new_key[:11] # sr_ + 8 chars
    key_hash = hashlib.sha256(new_key.encode('utf-8')).hexdigest()

    # 2. Prepare data for insertion
    insert_data = {
        "user_id": str(user.id),
        "name": key_data.name,
        "key_hash": key_hash,
        "key_prefix": key_prefix,
    }

    # 3. Insert into the database
    response = supabase.table("agent_api_keys").insert(insert_data).execute()

    if response.error or not response.data:
        raise HTTPException(status_code=500, detail="Failed to create API key.")

    created_key_record = response.data[0]
    
    # 4. Return the full key to the user
    return AgentApiKeyWithKey(
        **created_key_record,
        key=new_key
    )

async def get_agent_user(x_api_key: Annotated[str, Header()], supabase: Client = Depends(get_supabase_client)):
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API Key is missing")
    
    key_hash = hashlib.sha256(x_api_key.encode('utf-8')).hexdigest()
    
    response = supabase.table("agent_api_keys").select("user_id").eq("key_hash", key_hash).single().execute()
    
    if response.error or not response.data:
        raise HTTPException(status_code=401, detail="Invalid API Key")
        
    return response.data

@router.post("/agent/register")
async def register_agent_public_key(key_upload: AgentPublicKeyUpload, x_api_key: Annotated[str, Header()], supabase: Client = Depends(get_supabase_client)):
    """
    Allows the agent to upload its public key after initial authentication.
    """
    key_hash = hashlib.sha256(x_api_key.encode('utf-8')).hexdigest()
    response = supabase.table("agent_api_keys").update({"public_key": key_upload.public_key}).eq("key_hash", key_hash).execute()
    
    if response.error or not response.data:
        raise HTTPException(status_code=404, detail="Agent API Key not found.")
        
    return {"message": "Public key registered successfully"}

@router.get("/agent/jobs", response_model=List[PushJob])
async def get_pending_jobs(agent_user: dict = Depends(get_agent_user), supabase: Client = Depends(get_supabase_client)):
    """
    Pollable endpoint for the agent to find pending jobs.
    """
    user_id = agent_user['user_id']
    response = supabase.table("switch_push_jobs").select("*").eq("user_id", user_id).eq("status", "pending").limit(1).execute()
    if response.error:
        raise HTTPException(status_code=500, detail=response.error.message)
    return response.data if response.data else []

@router.get("/agent/jobs/{job_id}/cli", response_model=AgentCliResponse)
async def get_job_cli(job_id: uuid.UUID, agent_user: dict = Depends(get_agent_user), supabase: Client = Depends(get_supabase_client)):
    """
    Generates and returns the CLI commands for a specific job.
    """
    user_id = agent_user['user_id']
    # 1. Get job and verify ownership
    job_res = supabase.table("switch_push_jobs").select("*, switches(*, switch_models(*))").eq("id", str(job_id)).eq("user_id", user_id).single().execute()
    if job_res.error or not job_res.data:
        raise HTTPException(status_code=404, detail="Job not found or not authorized.")
    job = job_res.data

    switch = job.get('switches')
    if not switch:
        raise HTTPException(status_code=404, detail="Switch associated with job not found.")
    
    switch_model = switch.get('switch_models')
    if not switch_model:
        raise HTTPException(status_code=404, detail="Switch model not found.")

    # 2. Get necessary data for CLI generation
    port_configs_res = supabase.table("switch_port_configs").select("*").eq("switch_id", switch['id']).execute()
    vlans_res = supabase.table("vlans").select("*").eq("show_id", job['show_id']).execute()

    port_configs = port_configs_res.data if port_configs_res.data else []
    vlans = vlans_res.data if vlans_res.data else []

    # 3. Generate commands
    driver_type = switch_model.get('netmiko_driver_type')
    commands = []
    if driver_type == 'netgear_prosafe':
         commands = generate_netgear_cli(port_configs, vlans, switch_model)
    else:
        raise HTTPException(status_code=501, detail=f"Driver type '{driver_type}' not implemented.")

    return {"commands": commands, "driver_type": driver_type}


@router.get("/agent/jobs/{job_id}/credentials", response_model=EncryptedCredentials)
async def get_job_credentials(job_id: uuid.UUID, agent_user: dict = Depends(get_agent_user), supabase: Client = Depends(get_supabase_client)):
    """
    Securely sends the encrypted credentials to the agent.
    """
    import base64
    user_id = agent_user['user_id']
    response = supabase.table("switch_push_jobs").select("target_ip, target_credentials").eq("id", str(job_id)).eq("user_id", user_id).single().execute()
    
    if response.error or not response.data or not response.data.get('target_credentials'):
        raise HTTPException(status_code=404, detail="Credentials not found for this job.")

    creds_bytes = bytes.fromhex(response.data['target_credentials'][2:])
    creds_b64 = base64.b64encode(creds_bytes).decode('utf-8')

    return {
        "target_ip": response.data['target_ip'],
        "credentials": creds_b64
    }

@router.put("/agent/jobs/{job_id}/status")
async def update_job_status(job_id: uuid.UUID, status_update: PushJobStatus, agent_user: dict = Depends(get_agent_user), supabase: Client = Depends(get_supabase_client)):
    """
    Updates the status and result log of a job.
    """
    user_id = agent_user['user_id']
    update_data = status_update.model_dump()

    response = supabase.table("switch_push_jobs").update(update_data).eq("id", str(job_id)).eq("user_id", user_id).execute()

    if response.error or not response.data:
        raise HTTPException(status_code=404, detail="Job not found or failed to update.")

    return {"message": "Status updated successfully."}
