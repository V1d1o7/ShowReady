from fastapi import APIRouter, Depends, HTTPException, Header, Body
from supabase import Client
from app.api import get_supabase_client
from pydantic import BaseModel
import hashlib
import base64
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
from cryptography.hazmat.primitives import hashes

router = APIRouter()

class AgentRegistration(BaseModel):
    public_key: str

class DiscoveredDevice(BaseModel):
    hostname: str
    ip_address: str
    model: str
    serial_number: str

@router.post("/agent/register", status_code=201, tags=["Local Agent"])
def agent_register(registration: AgentRegistration, x_api_key: str = Header(...), supabase: Client = Depends(get_supabase_client)):
    """
    Called by a local agent to register itself with the system.
    Stores the public key and associates it with the API key.
    """
    if not x_api_key.startswith("SRLA-"):
        raise HTTPException(status_code=400, detail="Invalid API Key format")

    token = x_api_key.split("SRLA-")[1]
    hashed_token = hashlib.sha256(token.encode()).hexdigest()

    # Find the local_agent record by the hashed token
    response = supabase.table("local_agents").select("id").eq("hashed_token", hashed_token).maybe_single().execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="API Key not found or invalid")

    agent_id = response.data['id']

    # Update the agent with its public key
    update_response = supabase.table("local_agents").update({"public_key": registration.public_key}).eq("id", agent_id).execute()
    
    return {"message": "Agent registered successfully"}

@router.post("/agent/discover", status_code=200, tags=["Local Agent"])
def agent_discover(devices: list[DiscoveredDevice], x_api_key: str = Header(...), supabase: Client = Depends(get_supabase_client)):
    """
    Called by a local agent to report discovered network devices.
    """
    response = supabase.table("local_agents").select("id, show_id").eq("hashed_token", hashlib.sha256(x_api_key.split('SRLA-')[1]).hexdigest()).maybe_single().execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent = response.data
    
    # Here you would typically process the list of devices,
    # for example, by adding them to a 'discovered_devices' table associated with the show.
    # For this example, we'll just return a success message.
    print(f"Agent {agent['id']} for show {agent['show_id']} discovered {len(devices)} devices.")
    
    return {"message": "Discovery data received"}

@router.get("/agent/credentials", tags=["Local Agent"])
def get_credentials_for_agent(target_ip: str, x_api_key: str = Header(...), supabase: Client = Depends(get_supabase_client)):
    """
    Provides encrypted credentials for a specific device to the local agent.
    """
    # 1. Authenticate the agent
    agent_response = supabase.table("local_agents").select("id, show_id, public_key").eq("hashed_token", hashlib.sha256(x_api_key.split('SRLA-')[1]).hexdigest()).maybe_single().execute()
    
    if not agent_response.data or not agent_response.data.get('public_key'):
        raise HTTPException(status_code=404, detail="Agent not found or not registered with a public key")

    agent = agent_response.data
    public_key_str = agent['public_key']

    # 2. Find the target device and its credentials for the agent's show
    # This logic assumes you have a way to map an IP to a rack_equipment_instance
    # and that credentials are stored (securely) with the instance.
    # This is a simplified example.
    
    # For demonstration, we'll find a piece of equipment with matching IP in the agent's show
    credential_response = supabase.rpc('get_credentials_for_ip', {
        'show_id_param': agent['show_id'],
        'ip_param': target_ip
    }).maybe_single().execute()

    if not credential_response.data or not credential_response.data.get('target_credentials'):
        raise HTTPException(status_code=404, detail="No credentials found for the target device in this show")

    credentials = credential_response.data['target_credentials'] # Expects { "username": "...", "password": "..." }

    # 3. Encrypt the credentials with the agent's public key
    try:
        public_key = serialization.load_pem_public_key(
            public_key_str.encode('utf-8')
        )

        encrypted_credentials = {}
        for key, value in credentials.items():
            encrypted_value = public_key.encrypt(
                value.encode('utf-8'),
                asym_padding.OAEP(
                    mgf=asym_padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None
                )
            )
            encrypted_credentials[key] = base64.b64encode(encrypted_value).decode('utf-8')
        
        return encrypted_credentials

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Encryption failed: {str(e)}")
