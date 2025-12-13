from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from app.api import get_supabase_client, get_user, feature_check
from app.models import EmailTemplate, EmailTemplateCreate, BulkEmailRequest, UserSMTPSettingsResponse
from app.user_email import send_email_with_user_smtp, SMTPSettings
import uuid
from typing import List

router = APIRouter(dependencies=[Depends(feature_check("communications"))])

@router.get("/templates", response_model=List[EmailTemplate], tags=["Communications"])
async def get_email_templates(user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Gets all email templates for the user."""
    response = supabase.table('email_templates').select('*').eq('user_id', str(user.id)).execute()
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

@router.post("/send", tags=["Communications"])
async def send_bulk_email(request: BulkEmailRequest, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Sends a bulk email to a list of recipients."""
    # 1. Fetch SMTP settings
    smtp_res = supabase.table('user_smtp_settings').select('*').eq('user_id', str(user.id)).single().execute()
    if not smtp_res.data:
        raise HTTPException(status_code=400, detail="SMTP settings not configured.")
    
    smtp_settings = SMTPSettings(**smtp_res.data)

    # 2. Resolve Recipients
    recipients = []
    if request.category == 'roster':
        roster_res = supabase.table('roster').select('*').in_('id', [str(rid) for rid in request.recipient_ids]).execute()
        recipients = roster_res.data
    elif request.category == 'crew':
        crew_res = supabase.table('show_crew').select('*, roster(*), shows(name, data)').in_('id', [str(rid) for rid in request.recipient_ids]).execute()
        recipients = crew_res.data
    
    if not recipients:
        raise HTTPException(status_code=404, detail="No valid recipients found.")

    # 3. Variable Substitution & Sending
    for recipient in recipients:
        subject = request.subject
        body = request.body
        
        if request.category == 'roster':
            subject = subject.replace("{{firstName}}", recipient.get('first_name', ''))
            subject = subject.replace("{{lastName}}", recipient.get('last_name', ''))
            subject = subject.replace("{{position}}", recipient.get('position', ''))
            
            body = body.replace("{{firstName}}", recipient.get('first_name', ''))
            body = body.replace("{{lastName}}", recipient.get('last_name', ''))
            body = body.replace("{{position}}", recipient.get('position', ''))
            
        elif request.category == 'crew':
            roster_member = recipient.get('roster', {})
            show = recipient.get('shows', {})
            show_data = show.get('data', {})
            
            subject = subject.replace("{{firstName}}", roster_member.get('first_name', ''))
            subject = subject.replace("{{lastName}}", roster_member.get('last_name', ''))
            subject = subject.replace("{{showName}}", show.get('name', ''))
            subject = subject.replace("{{position}}", recipient.get('position', ''))
            
            body = body.replace("{{firstName}}", roster_member.get('first_name', ''))
            body = body.replace("{{lastName}}", roster_member.get('last_name', ''))
            body = body.replace("{{showName}}", show.get('name', ''))
            body = body.replace("{{position}}", recipient.get('position', ''))
            body = body.replace("{{rate}}", str(recipient.get('hourly_rate') or recipient.get('daily_rate', '')))
            body = body.replace("{{pmFirstName}}", show_data.get('info', {}).get('show_pm_first_name', ''))
            body = body.replace("{{pmLastName}}", show_data.get('info', {}).get('show_pm_last_name', ''))

        send_email_with_user_smtp(
            smtp_settings=smtp_settings,
            recipient_emails=[roster_member.get('email') if request.category == 'crew' else recipient.get('email')],
            subject=subject,
            html_body=body
        )

    return {"message": "Emails sent successfully."}
