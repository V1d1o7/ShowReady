from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from app.api import get_supabase_client, get_user
from app.models import UserSMTPSettingsCreate, UserSMTPSettingsResponse # (You'll need to create these Pydantic models)
from app.encryption import encrypt_password
from app.user_email import test_user_smtp_connection
import uuid

router = APIRouter(prefix="/user", tags=["User Settings"])

@router.get("/smtp-settings", response_model=UserSMTPSettingsResponse)
async def get_smtp_settings(user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Fetches the user's SMTP settings, omitting the password."""
    user_id = user['id']
    res = supabase.table('user_smtp_settings').select('*').eq('user_id', user_id).maybe_single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Settings not found")
    return res.data

@router.post("/smtp-settings")
async def create_or_update_smtp_settings(
    settings: UserSMTPSettingsCreate, 
    user=Depends(get_user), 
    supabase: Client = Depends(get_supabase_client)
):
    """Creates or updates a user's SMTP settings. Password is encrypted here."""
    user_id = user['id']
    
    # Encrypt the password before saving
    encrypted_password = encrypt_password(settings.smtp_password)
    
    settings_dict = settings.model_dump()
    settings_dict.pop('smtp_password') # Remove plain text
    settings_dict['encrypted_smtp_password'] = encrypted_password # Add encrypted
    settings_dict['user_id'] = user_id
    
    res = supabase.table('user_smtp_settings').upsert(settings_dict).execute()
    return res.data

@router.post("/smtp-settings/test")
async def test_smtp_settings(
    settings: UserSMTPSettingsCreate, # Use the Create model to get plain text password
    user=Depends(get_user)
):
    """Tests SMTP credentials without saving them."""
    try:
        test_user_smtp_connection(settings.model_dump())
        return {"message": "Connection successful!"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
