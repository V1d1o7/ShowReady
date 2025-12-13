from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from app.api import get_supabase_client, get_user, feature_check
from app.models import EmailTemplate, EmailTemplateCreate, BulkEmailRequest, UserSMTPSettingsResponse
from app.user_email import send_email_with_user_smtp, SMTPSettings
import uuid
from typing import List, Optional

router = APIRouter(dependencies=[Depends(feature_check("communications"))])

@router.get("/templates", response_model=List[EmailTemplate], tags=["Communications"])
async def get_email_templates(category: Optional[str] = None, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Gets all email templates for the user, optionally filtered by category."""
    query = supabase.table('email_templates').select('*').eq('user_id', str(user.id))
    if category:
        query = query.eq('category', category)
    response = query.execute()
    return response.data

@router.post("/templates", response_model=EmailTemplate, tags=["Communications"])
async def create_email_template(template_data: EmailTemplateCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new email template."""
    insert_data = template_data.model_dump()
    insert_data['user_id'] = str(user.id)
    response = supabase.table('email_templates').insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create email template.")
    return response.data[0]

@router.put("/templates/{template_id}", response_model=EmailTemplate, tags=["Communications"])
async def update_email_template(template_id: uuid.UUID, template_data: EmailTemplateCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates an email template."""
    update_data = template_data.model_dump(exclude_unset=True)
    response = supabase.table('email_templates').update(update_data).eq('id', str(template_id)).eq('user_id', str(user.id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Email template not found or update failed.")
    return response.data[0]

@router.delete("/templates/{template_id}", status_code=204, tags=["Communications"])
async def delete_email_template(template_id: uuid.UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Deletes an email template."""
    supabase.table('email_templates').delete().eq('id', str(template_id)).eq('user_id', str(user.id)).execute()
    return

@router.post("/templates/restore", tags=["Communications"])
async def restore_default_email_templates(user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Restores default email templates for the user."""
    defaults = [
        {"name": "Default Roster Email", "subject": "Show Information", "body": "<p>Hi {{firstName}}, welcome to the show!</p>", "category": "ROSTER"},
        {"name": "Default Crew Email", "subject": "Crew Assignment", "body": "<p>Hi {{firstName}}, you are assigned as {{position}}.</p>", "category": "CREW"},
        {"name": "Default Hours Email", "subject": "Timesheet Review", "body": "<p>Hi {{firstName}}, please review your hours.</p>", "category": "HOURS"},
    ]
    
    for tmpl in defaults:
        tmpl['user_id'] = str(user.id)
        # Using upsert requires a unique constraint on (user_id, name) or similar, 
        # but for safety we'll just insert and let Supabase auto-gen IDs.
        supabase.table('email_templates').insert(tmpl).execute()
        
    return {"message": "Default templates restored."}

@router.post("/send", tags=["Communications"])
async def send_bulk_email(request: BulkEmailRequest, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Sends a bulk email to a list of recipients."""
    # 1. Fetch SMTP settings
    smtp_res = supabase.table('user_smtp_settings').select('*').eq('user_id', str(user.id)).single().execute()
    if not smtp_res.data:
        raise HTTPException(status_code=400, detail="SMTP settings not configured. Please go to User Settings to configure them.")
    
    smtp_settings = SMTPSettings(**smtp_res.data)

    # 2. Resolve Recipients
    recipients = []
    if request.category == 'ROSTER': # Check case sensitivity matches frontend
        roster_res = supabase.table('roster').select('*').in_('id', [str(rid) for rid in request.recipient_ids]).execute()
        recipients = roster_res.data
    elif request.category == 'CREW':
        crew_res = supabase.table('show_crew').select('*, roster(*), shows(name, data)').in_('id', [str(rid) for rid in request.recipient_ids]).execute()
        recipients = crew_res.data
    
    if not recipients:
        raise HTTPException(status_code=404, detail="No valid recipients found.")

    # 3. Sending Logic
    for recipient in recipients:
        subject = request.subject
        body = request.body
        
        # Determine actual recipient data based on category
        target_email = ""
        data_source = {}
        
        if request.category == 'ROSTER':
            data_source = recipient
            target_email = recipient.get('email')
        elif request.category == 'CREW':
            data_source = recipient.get('roster', {})
            # Merge show data for variable substitution if needed
            data_source['showName'] = recipient.get('shows', {}).get('name', '')
            data_source['position'] = recipient.get('position', '')
            target_email = data_source.get('email')

        if not target_email:
            continue

        # Basic Variable Substitution
        for key, value in data_source.items():
            if isinstance(value, str):
                placeholder = "{{" + key + "}}"
                # Handle camelCase mapping if needed, e.g., first_name -> firstName
                if key == 'first_name':
                    body = body.replace("{{firstName}}", value)
                    subject = subject.replace("{{firstName}}", value)
                elif key == 'last_name':
                    body = body.replace("{{lastName}}", value)
                    subject = subject.replace("{{lastName}}", value)
                else:
                    body = body.replace(placeholder, value)
                    subject = subject.replace(placeholder, value)

        send_email_with_user_smtp(
            smtp_settings=smtp_settings,
            recipient_emails=[target_email],
            subject=subject,
            html_body=body
        )

    return {"message": "Emails sent successfully."}