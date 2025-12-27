import os
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from html import escape
from .models import SenderIdentity
from datetime import datetime
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# --- Google API Setup ---
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), '..', 'service-account.json')
SCOPES = ['https://www.googleapis.com/auth/gmail.send']

# --- New Storage & Downgrade Templates ---

def create_downgrade_warning_email_html(user_profile: dict, days_remaining: int = 30) -> str:
    """
    Sent immediately when a user is downgraded and exceeds their storage limit.
    Theme: Yellow (Warning)
    """
    first_name = user_profile.get('first_name', 'there')
    
    html_template = f"""
<table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="background-color: #feb204;">
  <tbody>
    <tr>
      <td colspan="1" rowspan="1" align="center" style="padding: 40px 10px;">
        <table cellpadding="0" cellspacing="0" width="600" border="0" align="center" draggable="false" style="background-color: #1F2937; border-radius: 12px; overflow: hidden; border: 1px solid #374151; font-family: Helvetica, Arial, sans-serif; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); margin: 0px auto;">
          <tbody>
            <tr><td colspan="1" rowspan="1" style="background-color: #F59E0B; height: 6px;"></td></tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 30px 40px; border-bottom: 1px solid #374151;">
                <h1 style="color: #F9FAFB; margin: 0px; font-size: 24px; font-weight: 700;"><strong>Storage Limit Exceeded</strong></h1>
                <p style="color: #F59E0B; margin: 5px 0px 0px; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;"><strong>Action Required</strong></p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 40px;">
                <p style="color: #D1D5DB; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hi {escape(first_name)},</p>
                <p style="color: #D1D5DB; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Just a heads-up that your account tier has been updated, and as a result you’re now over the storage limit for archived shows.</p>
                <p style="color: #D1D5DB; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">You have <strong>{days_remaining} days</strong> to either upgrade your plan or permanently delete any excess archived shows. After that, the oldest excess shows will be automatically and permanently deleted.</p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="background-color: #111827; padding: 20px; text-align: center; border-top: 1px solid #374151;">
                <p style="color: #4B5563; font-size: 12px; margin: 0px;">Powered by ShowReady</p>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>
"""
    return html_template

def create_storage_reminder_email_html(user_profile: dict, days_remaining: int) -> str:
    """
    Sent at 15 days (Warning/Yellow) and 1 day (Critical/Red) remaining.
    """
    first_name = user_profile.get('first_name', 'there')
    
    # Determine Theme Colors
    if days_remaining <= 1:
        bg_color = "#450a0a"   # Red 950
        accent_color = "#EF4444" # Red 500
        title = "Deletion Warning"
        subtitle = "Final Notice"
    else:
        bg_color = "#feb204"   # Amber
        accent_color = "#F59E0B" # Amber 500
        title = "Storage Limit Reminder"
        subtitle = f"{days_remaining} Days Left"

    day_str = "1 day" if days_remaining == 1 else f"{days_remaining} days"

    html_template = f"""
<table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="background-color: {bg_color};">
  <tbody>
    <tr>
      <td colspan="1" rowspan="1" align="center" style="padding: 40px 10px;">
        <table cellpadding="0" cellspacing="0" width="600" border="0" align="center" draggable="false" style="background-color: #1F2937; border-radius: 12px; overflow: hidden; border: 1px solid #374151; font-family: Helvetica, Arial, sans-serif; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); margin: 0px auto;">
          <tbody>
            <tr><td colspan="1" rowspan="1" style="background-color: {accent_color}; height: 6px;"></td></tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 30px 40px; border-bottom: 1px solid #374151;">
                <h1 style="color: #F9FAFB; margin: 0px; font-size: 24px; font-weight: 700;"><strong>{title}</strong></h1>
                <p style="color: {accent_color}; margin: 5px 0px 0px; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;"><strong>{subtitle}</strong></p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 40px;">
                <p style="color: #D1D5DB; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hi {escape(first_name)},</p>
                <p style="color: #D1D5DB; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Just a heads-up that you’re over your archived show storage limit.</p>
                <p style="color: #D1D5DB; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">You have <strong>{day_str}</strong> remaining before the oldest archived shows beyond your limit are automatically and permanently deleted. Please upgrade your plan or remove archived shows to prevent any data loss.</p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="background-color: #111827; padding: 20px; text-align: center; border-top: 1px solid #374151;">
                <p style="color: #4B5563; font-size: 12px; margin: 0px;">Powered by ShowReady</p>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>
"""
    return html_template

# --- Reaper Templates ---

def create_warning_email_html(user_profile: dict) -> str:
    """
    Inactivity Warning.
    Theme: Yellow (Warning)
    """
    first_name = user_profile.get('first_name', 'there')
    
    html_template = f"""
<table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="background-color: #feb204;">
  <tbody>
    <tr>
      <td colspan="1" rowspan="1" align="center" style="padding: 40px 10px;">
        <table cellpadding="0" cellspacing="0" width="600" border="0" align="center" draggable="false" style="background-color: #1F2937; border-radius: 12px; overflow: hidden; border: 1px solid #374151; font-family: Helvetica, Arial, sans-serif; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); margin: 0px auto;">
          <tbody>
            <tr><td colspan="1" rowspan="1" style="background-color: #F59E0B; height: 6px;"></td></tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 30px 40px; border-bottom: 1px solid #374151;">
                <h1 style="color: #F9FAFB; margin: 0px; font-size: 24px; font-weight: 700;"><strong>Inactivity Warning</strong></h1>
                <p style="color: #F59E0B; margin: 5px 0px 0px; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;"><strong>ShowReady Beta</strong></p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 40px;">
                <p style="color: #D1D5DB; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hi {escape(first_name)},</p>
                <p style="color: #D1D5DB; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">This is a friendly notice that your ShowReady beta account has been inactive for over 30 days. To keep your access, please log in within the next 30 days. We'd love to have you continue with us!</p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="background-color: #111827; padding: 20px; text-align: center; border-top: 1px solid #374151;">
                <p style="color: #4B5563; font-size: 12px; margin: 0px;">Powered by ShowReady</p>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>
"""
    return html_template

def create_revoked_email_html(user_profile: dict) -> str:
    """
    Access Revoked.
    Theme: Red (Critical)
    """
    first_name = user_profile.get('first_name', 'there')

    html_template = f"""
<table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="background-color: #450a0a;">
  <tbody>
    <tr>
      <td colspan="1" rowspan="1" align="center" style="padding: 40px 10px;">
        <table cellpadding="0" cellspacing="0" width="600" border="0" align="center" draggable="false" style="background-color: #1F2937; border-radius: 12px; overflow: hidden; border: 1px solid #374151; font-family: Helvetica, Arial, sans-serif; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); margin: 0px auto;">
          <tbody>
            <tr><td colspan="1" rowspan="1" style="background-color: #EF4444; height: 6px;"></td></tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 30px 40px; border-bottom: 1px solid #374151;">
                <h1 style="color: #F9FAFB; margin: 0px; font-size: 24px; font-weight: 700;"><strong>Access Revoked</strong></h1>
                <p style="color: #EF4444; margin: 5px 0px 0px; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;"><strong>ShowReady Beta</strong></p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 40px;">
                <p style="color: #D1D5DB; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hi {escape(first_name)},</p>
                <p style="color: #D1D5DB; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">Your beta access for ShowReady has been revoked due to inactivity of over 60 days. If you wish to rejoin the beta, please contact our support team. Thank you for your participation!</p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="background-color: #111827; padding: 20px; text-align: center; border-top: 1px solid #374151;">
                <p style="color: #4B5563; font-size: 12px; margin: 0px;">Powered by ShowReady</p>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>
"""
    return html_template

# --- Existing Generic Templates ---

def create_email_html(user_profile: dict, body_text: str) -> str:
    """Generates a personalized HTML email body from a template and user-provided text."""
    first_name = user_profile.get('first_name', 'there')
    
    # Split the body text into sections using '----' as a delimiter.
    sections = body_text.split('----')
    first_section_content = sections[0].strip()
    escaped_first_section = escape(first_section_content).replace('\n', '<br>')
    
    sections_html = f"""
    <div class="section">
        <p>Hi {escape(first_name)},</p>
        <p>{escaped_first_section}</p>
    </div>
    """
    
    if len(sections) > 1:
        for content in sections[1:]:
            trimmed_content = content.strip()
            if trimmed_content:
                escaped_content = escape(trimmed_content).replace('\n', '<br>')
                sections_html += f"""
                <div class="section">
                    <p>{escaped_content}</p>
                </div>
                """

    html_template = f"""
    <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          body {{ font-family: 'Inter', sans-serif; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }}
          .container {{ font-size: 16px; text-align: center; max-width: 600px; margin: 0 auto; padding: 30px; border-radius: 15px; }}
          p {{ font-size: 16px; line-height: 1.8; color: #d4d4d8; text-align: left; margin: 0; }}
          .footer {{ margin-top: 30px; font-size: 14px; color: #a1a1aa; }}
          .logo-container {{ text-align: center; margin-bottom: 20px; }}
          .logo {{ max-width: 140px; margin-bottom: 10px; }}
          .mainHeader {{ font-family: 'Space Mono', monospace; font-size: 32px; color: #f59e0b; font-weight: bold; text-align: center; letter-spacing: 1px; margin-top: 10px; }}
          .section {{ margin-top: 20px; text-align: left; background-color: #1F2937; padding: 20px; border-radius: 10px; }}
          .section p + p {{ margin-top: 1em; }}
        </style>
      </head>
      <body>
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td bgcolor="#111827" align="center" style="padding: 20px 0;">
              <div class="container" style="background-color: #111827; border: 1px solid #374151;">
                <div class="logo-container">
                  <img src="https://showready.k-p.video/logo.png" alt="ShowReady Logo" class="logo" />
                </div>
                <div class="mainHeader">A Message from ShowReady</div>
                {sections_html}
                <p class="footer">This is a message directly from the admins at ShowReady.</p>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """
    return html_template

def create_feedback_email_html(feedback_type: str, feedback: str, user_profile: dict) -> str:
    user_name = user_profile.get('full_name', 'A user')
    escaped_and_formatted_feedback = escape(feedback).replace('\n', '<br>')

    html_template = f"""
    <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          body {{ font-family: 'Inter', sans-serif; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }}
          .container {{ font-size: 16px; text-align: center; max-width: 600px; margin: 0 auto; padding: 30px; border-radius: 15px; }}
          p {{ font-size: 16px; line-height: 1.8; color: #d4d4d8; text-align: left; margin: 0; }}
          .footer {{ margin-top: 30px; font-size: 14px; color: #a1a1aa; }}
          .logo-container {{ text-align: center; margin-bottom: 20px; }}
          .logo {{ max-width: 140px; margin-bottom: 10px; }}
          .mainHeader {{ font-family: 'Space Mono', monospace; font-size: 32px; color: #f59e0b; font-weight: bold; text-align: center; letter-spacing: 1px; margin-top: 10px; }}
          .section {{ margin-top: 20px; text-align: left; background-color: #1F2937; padding: 20px; border-radius: 10px; }}
          .section p + p {{ margin-top: 1em; }}
          strong {{ color: #f59e0b; }}
        </style>
      </head>
      <body>
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td bgcolor="#111827" align="center" style="padding: 20px 0;">
              <div class="container" style="background-color: #111827; border: 1px solid #374151;">
                <div class="logo-container">
                  <img src="https://showready.k-p.video/logo.png" alt="ShowReady Logo" class="logo" />
                </div>
                <div class="mainHeader">New Feedback Received</div>
                <div class="section">
                    <p><strong>From:</strong> {escape(user_name)}</p>
                    <p><strong>Type:</strong> {escape(feedback_type)}</p>
                </div>
                <div class="section">
                    <p><strong>Message:</strong></p>
                    <p>{escaped_and_formatted_feedback}</p>
                </div>
                <p class="footer">This feedback was submitted through the global feedback button.</p>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """
    return html_template

def send_email(recipient_email: str, subject: str, html_content: str, sender: SenderIdentity, reply_to_email: str = None):
    try:
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES, subject=sender.sender_login_email)
        
        service = build('gmail', 'v1', credentials=creds)
        
        message = MIMEMultipart("alternative")
        message["To"] = recipient_email
        message["From"] = f"{sender.name} <{sender.email}>"
        message["Reply-To"] = reply_to_email if reply_to_email else sender.email
        message["Subject"] = subject

        part = MIMEText(html_content, "html")
        message.attach(part)
        
        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        
        create_message = {'raw': encoded_message}
        
        send_message = (service.users().messages().send(userId="me", body=create_message).execute())
        print(F'Sent message to {recipient_email}, Message Id: {send_message["id"]}')

    except HttpError as error:
        print(F'An error occurred: {error}')
        raise
    except FileNotFoundError:
        print("Error: service-account.json not found. Please ensure the file is in the root directory.")
        raise
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        raise