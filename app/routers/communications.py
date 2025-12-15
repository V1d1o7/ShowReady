#
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
    """Restores default email templates for the user with branded color coding."""
    
    # 1. Delete existing defaults to prevent duplicates
    supabase.table('email_templates').delete().eq('user_id', str(user.id)).eq('is_default', True).execute()

    # --- SHARED DESIGN VARIABLES ---
    bg_main = "#111827"   # gray-900
    bg_card = "#1F2937"   # gray-800
    text_white = "#F9FAFB"
    text_gray = "#D1D5DB"
    text_muted = "#9CA3AF"
    
    # Category Accents
    color_roster = "#14B8A6" # Teal/Cyan (Recruitment)
    color_crew = "#3B82F6"   # Blue (Operations)
    color_hours = "#F59E0B"  # Amber/Gold (Finance)

    # 2. Define Defaults
    defaults = [
        # -------------------------------------------------------------------------
        # 1. ROSTER TEMPLATE (TEAL)
        # -------------------------------------------------------------------------
        {
            "user_id": str(user.id),
            "category": "ROSTER",
            "name": "Default Roster Email",
            "subject": "Availability Check: {{showName}}",
            "body": f"""
<table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="background-color: {bg_main};">
  <tbody>
    <tr>
      <td colspan="1" rowspan="1" align="center" style="padding: 40px 10px;">
        <table cellpadding="0" cellspacing="0" width="600" border="0" align="center" draggable="false" style="background-color: {bg_card}; border-radius: 12px; overflow: hidden; border: 1px solid #374151; font-family: Helvetica, Arial, sans-serif; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); margin: 0px auto;">
          <tbody>
            <tr><td colspan="1" rowspan="1" style="background-color: {color_roster}; height: 6px;"></td></tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 30px 40px; border-bottom: 1px solid #374151;">
                <h1 style="color: {text_white}; margin: 0px; font-size: 24px; font-weight: 700;"><strong>Availability Check</strong></h1>
                <p style="color: {color_roster}; margin: 5px 0px 0px; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;"><strong>{{{{showName}}}}</strong></p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 40px;">
                <p style="color: {text_gray}; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hey {{{{firstName}}}},</p>
                <p style="color: {text_gray}; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">We have an upcoming call for <strong>{{{{showName}}}}</strong> and are looking for crew. Details below:</p>
                
                <table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="background-color: {bg_main}; border-radius: 8px; border: 1px solid #374151; margin-bottom: 30px;">
                  <tbody>
                    <tr>
                      <td colspan="1" rowspan="1" style="padding: 25px;">
                        <table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="margin-bottom: 16px;">
                           <tr>
                             <td width="80" valign="top" style="color: {text_muted}; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; padding-top: 2px;">WHAT:</td>
                             <td style="color: {text_white}; font-size: 15px;">[Type of Call]</td>
                           </tr>
                        </table>
                        <table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="margin-bottom: 16px;">
                           <tr>
                             <td width="80" valign="top" style="color: {text_muted}; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; padding-top: 2px;">WHEN:</td>
                             <td style="color: {text_white}; font-size: 15px;">{{{{schedule}}}}</td>
                           </tr>
                        </table>
                        <table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false">
                           <tr>
                             <td width="80" valign="top" style="color: {text_muted}; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; padding-top: 2px;">WHERE:</td>
                             <td style="color: {text_white}; font-size: 15px;">[Location / Venue]</td>
                           </tr>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
                
                <table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false">
                  <tbody>
                    <tr>
                      <td align="center">
                        <a href="mailto:{{{{replyToEmail}}}}?subject=Available: {{{{showName}}}}&body=I am available." style="background-color: {color_roster}; color: {text_white}; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">I'm Available</a>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top: 20px;">
                        <a href="mailto:{{{{replyToEmail}}}}?subject=Decline: {{{{showName}}}}" style="color: #6B7280; font-size: 14px; text-decoration: none;">Decline / Unavailable</a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="background-color: {bg_main}; padding: 20px; text-align: center; border-top: 1px solid #374151;">
                <p style="color: #4B5563; font-size: 12px; margin: 0px;">Powered by ShowReady</p>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>
""",
            "is_default": True
        },
        # -------------------------------------------------------------------------
        # 2. CREW TEMPLATE (BLUE)
        # -------------------------------------------------------------------------
        {
            "user_id": str(user.id),
            "category": "CREW",
            "name": "Default Crew Email",
            "subject": "Crew Assignment: {{showName}}",
            "body": f"""
<table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="background-color: {bg_main};">
  <tbody>
    <tr>
      <td colspan="1" rowspan="1" align="center" style="padding: 40px 10px;">
        <table cellpadding="0" cellspacing="0" width="600" border="0" align="center" draggable="false" style="background-color: {bg_card}; border-radius: 12px; overflow: hidden; border: 1px solid #374151; font-family: Helvetica, Arial, sans-serif; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); margin: 0px auto;">
          <tbody>
            <tr><td colspan="1" rowspan="1" style="background-color: {color_crew}; height: 6px;"></td></tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 30px 40px; border-bottom: 1px solid #374151;">
                <h1 style="color: {text_white}; margin: 0px; font-size: 24px; font-weight: 700;"><strong>Crew Assignment</strong></h1>
                <p style="color: {color_crew}; margin: 5px 0px 0px; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;"><strong>{{{{showName}}}}</strong></p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 40px;">
                <p style="color: {text_gray}; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hi {{{{firstName}}}},</p>
                <p style="color: {text_gray}; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">You have been confirmed for the following position. Please review the details below:</p>
                
                <table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="background-color: {bg_main}; border-radius: 8px; border: 1px solid #374151; margin-bottom: 30px;">
                  <tbody>
                    <tr>
                      <td colspan="1" rowspan="1" style="padding: 25px;">
                        <table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="margin-bottom: 16px;">
                           <tr>
                             <td width="80" valign="top" style="color: {text_muted}; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; padding-top: 2px;">ROLE:</td>
                             <td style="color: {text_white}; font-size: 15px;"><strong>{{{{position}}}}</strong></td>
                           </tr>
                        </table>
                        <table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="margin-bottom: 16px;">
                           <tr>
                             <td width="80" valign="top" style="color: {text_muted}; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; padding-top: 2px;">CALL TIME:</td>
                             <td style="color: {text_white}; font-size: 15px;">[Insert Call Time]</td>
                           </tr>
                        </table>
                        <table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false">
                           <tr>
                             <td width="80" valign="top" style="color: {text_muted}; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; padding-top: 2px;">NOTES:</td>
                             <td style="color: {text_white}; font-size: 15px;">Please bring standard kit.</td>
                           </tr>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
                
                <table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false">
                  <tbody>
                    <tr>
                      <td align="center">
                        <a href="mailto:{{{{replyToEmail}}}}?subject=Received: {{{{showName}}}}" style="background-color: {color_crew}; color: {text_white}; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Confirm Receipt</a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="background-color: {bg_main}; padding: 20px; text-align: center; border-top: 1px solid #374151;">
                <p style="color: #4B5563; font-size: 12px; margin: 0px;">Powered by ShowReady</p>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>
""",
            "is_default": True
        },
        # -------------------------------------------------------------------------
        # 3. HOURS TEMPLATE (AMBER)
        # -------------------------------------------------------------------------
        {
            "user_id": str(user.id),
            "category": "HOURS",
            "name": "Default Hours Email",
            "subject": "{{showName}} Timesheet Report",
            "body": f"""
<table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="background-color: {bg_main};">
  <tbody>
    <tr>
      <td colspan="1" rowspan="1" align="center" style="padding: 40px 10px;">
        <table cellpadding="0" cellspacing="0" width="600" border="0" align="center" draggable="false" style="background-color: {bg_card}; border-radius: 12px; overflow: hidden; border: 1px solid #374151; font-family: Helvetica, Arial, sans-serif; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); margin: 0px auto;">
          <tbody>
            <tr><td colspan="1" rowspan="1" style="background-color: {color_hours}; height: 6px;"></td></tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 30px 40px; border-bottom: 1px solid #374151;">
                <h1 style="color: {text_white}; margin: 0px; font-size: 24px; font-weight: 700;"><strong>Timesheet Report</strong></h1>
                <p style="color: {color_hours}; margin: 5px 0px 0px; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;"><strong>{{{{showName}}}}</strong></p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 40px;">
                <p style="color: {text_gray}; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hello {{{{firstName}}}},</p>
                <p style="color: {text_gray}; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">Please find the timesheet for the week of {{{{weekStart}}}} attached.</p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="background-color: {bg_main}; padding: 20px; text-align: center; border-top: 1px solid #374151;">
                <p style="color: #4B5563; font-size: 12px; margin: 0px;">Powered by ShowReady</p>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>
""",
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
        
        # Prepare rosteredEmail (the recipient's email)
        data_source['rosteredEmail'] = target_email

        # --- TAG FILTERING LOGIC ---
        # Handle 'tags' specially if it exists (it's a list, so standard string loop won't catch it)
        raw_tags = data_source.get('tags', [])
        if isinstance(raw_tags, list):
            # Filter out internal tags (starting with "internal:", "private:", or "_")
            public_tags = [
                t for t in raw_tags 
                if isinstance(t, str) and not (
                    t.lower().startswith("internal:") or 
                    t.lower().startswith("private:") or 
                    t.startswith("_")
                )
            ]
            # Add to data_source as a joined string for substitution
            data_source['tags'] = ", ".join(public_tags)

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
        
        # Replace {{replyToEmail}} with the user's configured SMTP 'from' address
        if smtp_settings.from_email:
            body = body.replace("{{replyToEmail}}", smtp_settings.from_email)

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