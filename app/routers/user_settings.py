from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
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
    
    # The query might return no data, which is a valid case (user has no settings yet).
    # The `maybe_single()` method can result in `res.data` being `None` or an empty list.
    if not res or not res.data:
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
    
    # Prepare the data, encrypting password if present
    data_to_save = settings.model_dump(exclude_unset=True)
    if 'smtp_password' in data_to_save and data_to_save['smtp_password']:
        encrypted_password = encrypt_password(data_to_save['smtp_password'])
        data_to_save.pop('smtp_password')
        data_to_save['encrypted_smtp_password'] = encrypted_password
    else:
        data_to_save.pop('smtp_password', None)
        
    data_to_save['user_id'] = user_id

    # Check if settings for this user already exist
    existing_settings_res = supabase.table('user_smtp_settings').select('id').eq('user_id', user_id).maybe_single().execute()

    if existing_settings_res.data:
        # UPDATE existing record
        update_op = supabase.table('user_smtp_settings').update(data_to_save).eq('user_id', user_id).execute()
        if not update_op.data:
             raise HTTPException(status_code=500, detail="Failed to update SMTP settings.")
    else:
        # INSERT new record
        data_to_save['id'] = str(uuid.uuid4())
        insert_op = supabase.table('user_smtp_settings').insert(data_to_save).execute()
        if not insert_op.data:
             raise HTTPException(status_code=500, detail="Failed to create SMTP settings.")

    # After the write operation, SELECT the full record to return it
    final_res = supabase.table('user_smtp_settings').select('*').eq('user_id', user_id).single().execute()
    if not final_res.data:
        raise HTTPException(status_code=404, detail="Could not retrieve SMTP settings after save.")
    
    return final_res.data

@router.post("/smtp-settings/test")
async def test_smtp_settings(
    settings: UserSMTPSettingsCreate, # Use the Create model to get plain text password
    user=Depends(get_user)
):
    """Tests SMTP credentials without saving them."""
    try:
        # Run the blocking smtplib call in a separate thread
        await run_in_threadpool(test_user_smtp_connection, settings.model_dump())
        return {"message": "Connection successful!"}
    except Exception as e:
        # The exception from the thread will be re-raised here
        raise HTTPException(status_code=400, detail=f"Connection test failed: {str(e)}")
