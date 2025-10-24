from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from app.api import get_supabase_client, get_user
from app.models import UserSMTPSettingsCreate, UserSMTPSettingsResponse, UserSMTPSettingsUpdate
from app.encryption import encrypt_password
from app.user_email import test_user_smtp_connection
import uuid

router = APIRouter(prefix="/user", tags=["User Settings"])

@router.get("/smtp-settings", response_model=UserSMTPSettingsResponse)
async def get_smtp_settings(user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Fetches the user's SMTP settings, omitting the password."""
    user_id = str(user.id)
    res = supabase.table('user_smtp_settings').select('*').eq('user_id', user_id).maybe_single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Settings not found")
    return res.data

@router.post("/smtp-settings", response_model=UserSMTPSettingsResponse)
async def create_or_update_smtp_settings(
    settings: UserSMTPSettingsUpdate, 
    user=Depends(get_user), 
    supabase: Client = Depends(get_supabase_client)
):
    """Creates or updates a user's SMTP settings. Password is encrypted if provided."""
    user_id = str(user.id)
    
    update_data = settings.model_dump(exclude_unset=True)
    
    # If a new password is provided, encrypt it and remove the plain text version.
    if 'smtp_password' in update_data and update_data['smtp_password']:
        encrypted_password = encrypt_password(update_data['smtp_password'])
        update_data.pop('smtp_password')
        update_data['encrypted_smtp_password'] = encrypted_password
    else:
        # Ensure plain password is not sent to db if it's empty or None
        update_data.pop('smtp_password', None)
        
    update_data['user_id'] = user_id

    # Upsert the data. `on_conflict` ensures that if a row with the user_id exists, it's updated.
    res = supabase.table('user_smtp_settings').upsert(update_data, on_conflict='user_id').execute()

    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save SMTP settings.")

    return res.data[0]

@router.post("/smtp-settings/test")
async def test_smtp_settings(
    settings: UserSMTPSettingsCreate, # Use the Create model to get plain text password
    user=Depends(get_user)
):
    """Tests SMTP credentials without saving them."""
    try:
        # The test function expects a dictionary
        test_user_smtp_connection(settings.model_dump())
        return {"message": "Connection successful!"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection test failed: {str(e)}")
