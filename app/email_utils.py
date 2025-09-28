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
# You will need to create a service account in your Google Cloud project
# and download the JSON key file.
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), '..', 'service-account.json')
SCOPES = ['https://www.googleapis.com/auth/gmail.send']


def create_email_html(user_profile: dict, body_text: str) -> str:
    """
    Generates a personalized HTML email body from a template and user-provided text.
    """
    first_name = user_profile.get('first_name', 'there')
    
    # Split the body text into sections using '----' as a delimiter.
    sections = body_text.split('----')
    
    # The first part of the composed message is combined with the greeting.
    first_section_content = sections[0].strip()
    escaped_first_section = escape(first_section_content).replace('\n', '<br>')
    
    # Initialize the HTML with the combined greeting and first section.
    sections_html = f"""
    <div class="section">
        <p>Hi {escape(first_name)},</p>
        <p>{escaped_first_section}</p>
    </div>
    """
    
    # Process the rest of the sections, if any exist.
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

    # This is the full HTML template, adapted to the ShowReady theme.
    # Note: Background colors are applied to table cells (<td>) for better email client compatibility.
    html_template = f"""
    <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          body {{
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }}
          .container {{
            font-size: 16px;
            text-align: center;
            max-width: 600px;
            margin: 0 auto;
            padding: 30px;
            border-radius: 15px;
          }}
          p {{
            font-size: 16px;
            line-height: 1.8;
            color: #d4d4d8; /* Zinc 300 */
            text-align: left;
            margin: 0;
          }}
          .footer {{
            margin-top: 30px;
            font-size: 14px;
            color: #a1a1aa; /* Zinc 400 */
          }}
          .logo-container {{
            text-align: center;
            margin-bottom: 20px;
          }}
          .logo {{
            max-width: 140px;
            margin-bottom: 10px;
          }}
          .mainHeader {{
            font-family: 'Space Mono', monospace;
            font-size: 32px;
            color: #f59e0b; /* Amber 500 */
            font-weight: bold;
            text-align: center;
            letter-spacing: 1px;
            margin-top: 10px;
          }}
          .section {{
            margin-top: 20px;
            text-align: left;
            background-color: #1F2937; /* Gray 800 */
            padding: 20px;
            border-radius: 10px;
          }}
          .section p + p {{
            margin-top: 1em; /* Add space between paragraphs within a section */
          }}
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

                <p class="footer">
                  This is a message directly from the admins at ShowReady.
                </p>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """
    return html_template

def create_feedback_email_html(feedback_type: str, feedback: str, user_profile: dict) -> str:
    """
    Generates a specific HTML email for feedback submissions.
    """
    user_name = user_profile.get('full_name', 'A user')
    user_email = user_profile.get('email', 'Not provided')
    escaped_and_formatted_feedback = escape(feedback).replace('\n', '<br>')

    # This is the full HTML template, adapted to the ShowReady theme.
    html_template = f"""
    <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          body {{
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }}
          .container {{
            font-size: 16px;
            text-align: center;
            max-width: 600px;
            margin: 0 auto;
            padding: 30px;
            border-radius: 15px;
          }}
          p {{
            font-size: 16px;
            line-height: 1.8;
            color: #d4d4d8; /* Zinc 300 */
            text-align: left;
            margin: 0;
          }}
          .footer {{
            margin-top: 30px;
            font-size: 14px;
            color: #a1a1aa; /* Zinc 400 */
          }}
          .logo-container {{
            text-align: center;
            margin-bottom: 20px;
          }}
          .logo {{
            max-width: 140px;
            margin-bottom: 10px;
          }}
          .mainHeader {{
            font-family: 'Space Mono', monospace;
            font-size: 32px;
            color: #f59e0b; /* Amber 500 */
            font-weight: bold;
            text-align: center;
            letter-spacing: 1px;
            margin-top: 10px;
          }}
          .section {{
            margin-top: 20px;
            text-align: left;
            background-color: #1F2937; /* Gray 800 */
            padding: 20px;
            border-radius: 10px;
          }}
          .section p + p {{
            margin-top: 1em; /* Add space between paragraphs within a section */
          }}
          strong {{
            color: #f59e0b;
          }}
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

                <p class="footer">
                  This feedback was submitted through the global feedback button.
                </p>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """
    return html_template

def create_general_email_html(body: str) -> str:
    """
    Creates a standardized HTML email template for users without a profile.
    """
    # This uses a similar structure to your existing template but without personalization.
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>A Message from ShowReady</title>
        <style>
            body {{ font-family: sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }}
            .container {{ max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid #dddddd; border-radius: 8px; overflow: hidden; }}
            .header {{ background-color: #1a1a1a; color: #ffffff; padding: 20px; text-align: center; }}
            .header h1 {{ margin: 0; color: #ffbf00; }}
            .content {{ padding: 30px; color: #333333; line-height: 1.6; }}
            .footer {{ background-color: #f4f4f4; color: #888888; text-align: center; padding: 20px; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>ShowReady</h1>
            </div>
            <div class="content">
                {body}
            </div>
            <div class="footer">
                <p>&copy; {datetime.now().year} ShowReady. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """
    return html_content

def send_email(recipient_email: str, subject: str, html_content: str, sender: SenderIdentity, reply_to_email: str = None):
    """
    Sends an email using the Gmail API with a service account.
    """
    try:
        # The 'sender.sender_login_email' is the user to impersonate (e.g., showready@kuiper-productions.com)
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
        
        create_message = {
            'raw': encoded_message
        }
        
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