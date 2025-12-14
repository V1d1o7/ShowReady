from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from app.api import get_supabase_client, get_user, feature_check
from app.models import EmailTemplate, EmailTemplateCreate, BulkEmailRequest
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
    
    # 1. Delete existing defaults to prevent duplicates
    supabase.table('email_templates').delete().eq('user_id', str(user.id)).eq('is_default', True).execute()

    # 2. Define Defaults. 
    # NOTE: The body is a 'Fragment' (just the tables) so Tiptap doesn't strip the tags.
    # The 'align="center"' and 'margin: 0 auto' on the inner table is the key fix for centering.
    defaults = [
        {
            "user_id": str(user.id),
            "category": "ROSTER",
            "name": "Default Roster Email",
            "subject": "Availability Check: {{showName}}", 
            "body": """
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #111827;">
    <tr>
      <td align="center" style="padding: 40px 10px;">
        
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #1f2937; border-radius: 12px; overflow: hidden; border: 1px solid #374151; font-family: Helvetica, Arial, sans-serif; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); margin: 0 auto;">
          
          <tr><td height="6" style="background-color: #14b8a6;"></td></tr>

          <tr>
            <td style="padding: 30px 40px; border-bottom: 1px solid #374151;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Availability Check</h1>
              <p style="color: #14b8a6; margin: 5px 0 0 0; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">{{showName}}</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              
              <p style="color: #d1d5db; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                Hey <strong>{{firstName}}</strong>,
              </p>
              
              <p style="color: #d1d5db; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
                We've got a <strong>[Type of Call]</strong> for <strong>{{showName}}</strong> coming up and we are looking for <strong>[Number]</strong> people. Details are below - partial availability is ok!
              </p>

              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #111827; border-radius: 8px; border: 1px solid #374151; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 25px;">
                    
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 16px;">
                      <tr>
                        <td width="80" valign="top" style="color: #9ca3af; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; padding-top: 2px;">What:</td>
                        <td style="color: #ffffff; font-size: 15px; font-weight: normal;">[Type of Call]</td>
                      </tr>
                    </table>

                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 16px;">
                      <tr>
                        <td width="80" valign="top" style="color: #9ca3af; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; padding-top: 2px;">When:</td>
                        <td style="color: #ffffff; font-size: 15px; font-weight: normal;">{{schedule}}</td>
                      </tr>
                    </table>

                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 16px;">
                      <tr>
                        <td width="80" valign="top" style="color: #9ca3af; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; padding-top: 2px;">Where:</td>
                        <td style="color: #ffffff; font-size: 15px; font-weight: normal;">[Location / Address]</td>
                      </tr>
                    </table>

                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="80" valign="top" style="color: #9ca3af; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; padding-top: 2px;">Rate:</td>
                        <td style="color: #ffffff; font-size: 15px; font-weight: normal;">[Rate Info]</td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="mailto:?subject=Available: {{showName}}&body=Hi, I am available." style="background-color: #14b8a6; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">I'm Available</a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 20px;">
                    <a href="mailto:?subject=Decline: {{showName}}&body=Hi, I am unavailable for this one." style="color: #6b7280; font-size: 14px; text-decoration: none;">Unavailable / Decline</a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td style="background-color: #111827; padding: 20px; text-align: center; border-top: 1px solid #374151;">
              <p style="color: #4b5563; font-size: 12px; margin: 0;">
                Powered by ShowReady
              </p>
            </td>
          </tr>

        </table>
        
      </td>
    </tr>
  </table>
""",
            "is_default": True
        },
        {
            "user_id": str(user.id),
            "category": "CREW",
            "name": "Default Crew Email", 
            "subject": "Crew Assignment", 
            "body": '<div style="font-family: Arial, sans-serif; padding: 20px;"><h2>Hello {{firstName}},</h2><p>You have been assigned the position of <strong>{{position}}</strong> for {{showName}}.</p></div>',
            "is_default": True
        },
        {
            "user_id": str(user.id),
            "category": "HOURS",
            "name": "Default Hours Email", 
            "subject": "Timesheet Review", 
            "body": '<div style="font-family: Arial, sans-serif; padding: 20px;"><h2>Hello {{firstName}},</h2><p>Please review your hours for the week of {{weekStartDate}}. Reach out to your PM if you have questions.</p></div>',
            "is_default": True
        },
    ]
    
    # 3. Insert new defaults.
    response = supabase.table('email_templates').insert(defaults).execute()
    
    if not response.data:
         raise HTTPException(status_code=500, detail="Failed to restore templates.")
        
    return {"message": "Default templates restored.", "count": len(response.data)}

@router.post("/send", tags=["Communications"])
async def send_bulk_email(request: BulkEmailRequest, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Sends a bulk email to a list of recipients."""
    # 1. Fetch User SMTP settings (CONFIRMED: Uses User Settings, not Admin)
    smtp_res = supabase.table('user_smtp_settings').select('*').eq('user_id', str(user.id)).single().execute()
    if not smtp_res.data:
        raise HTTPException(status_code=400, detail="SMTP settings not configured. Please go to User Settings to configure them.")
    
    smtp_settings = SMTPSettings(**smtp_res.data)

    # 2. Resolve Recipients
    recipients = []
    if request.category == 'ROSTER':
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
        
        target_email = ""
        data_source = {}
        
        if request.category == 'ROSTER':
            data_source = recipient
            target_email = recipient.get('email')
        elif request.category == 'CREW':
            data_source = recipient.get('roster', {})
            data_source['showName'] = recipient.get('shows', {}).get('name', '')
            data_source['position'] = recipient.get('position', '')
            target_email = data_source.get('email')

        if not target_email:
            continue

        # Basic Variable Substitution
        for key, value in data_source.items():
            if isinstance(value, str):
                placeholder = "{{" + key + "}}"
                if key == 'first_name':
                    body = body.replace("{{firstName}}", value)
                    subject = subject.replace("{{firstName}}", value)
                elif key == 'last_name':
                    body = body.replace("{{lastName}}", value)
                    subject = subject.replace("{{lastName}}", value)
                else:
                    body = body.replace(placeholder, value)
                    subject = subject.replace(placeholder, value)

        # 4. CRITICAL FIX: Wrap the body if it was stripped by Tiptap (missing <html> tags)
        # This re-applies the DOCTYPE and body styles needed for centering in Outlook/Gmail
        final_html_body = body
        if "<html" not in final_html_body.lower():
            final_html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ margin: 0; padding: 0; width: 100% !important; background-color: #111827; }}
    table {{ border-collapse: collapse; }}
  </style>
</head>
<body style="margin: 0; padding: 0; width: 100% !important; background-color: #111827;">
  {body}
</body>
</html>"""

        send_email_with_user_smtp(
            smtp_settings=smtp_settings,
            recipient_emails=[target_email],
            subject=subject,
            html_body=final_html_body
        )

    return {"message": "Emails sent successfully."}