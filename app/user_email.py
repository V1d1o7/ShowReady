import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from pydantic import BaseModel
from .encryption import decrypt_password
from typing import List
from .models import WeeklyTimesheet
from datetime import timedelta
from html import escape


class SMTPSettings(BaseModel):
    from_name: str
    from_email: str
    smtp_server: str
    smtp_port: int
    smtp_username: str
    encrypted_smtp_password: str # This comes from the DB

def send_email_with_user_smtp(
    smtp_settings: SMTPSettings,
    recipient_emails: List[str],
    subject: str,
    html_body: str,
    attachment_blob: bytes = None,
    attachment_filename: str = "report.pdf"
):
    """Connects to a user's SMTP server and sends an email."""
    try:
        password = decrypt_password(smtp_settings.encrypted_smtp_password)

        msg = MIMEMultipart()
        msg["From"] = f"{smtp_settings.from_name} <{smtp_settings.from_email}>"
        msg["To"] = ", ".join(recipient_emails)
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html"))

        if attachment_blob:
            part = MIMEApplication(attachment_blob, Name=attachment_filename)
            part["Content-Disposition"] = f'attachment; filename="{attachment_filename}"'
            msg.attach(part)

        server = None
        if smtp_settings.smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_settings.smtp_server, smtp_settings.smtp_port, timeout=15)
        else:
            server = smtplib.SMTP(smtp_settings.smtp_server, smtp_settings.smtp_port, timeout=15)
            server.starttls()

        with server:
            server.login(smtp_settings.smtp_username, password)
            server.send_message(msg)
            
    except smtplib.SMTPException as e:
        raise ValueError(f"Failed to send email. SMTP Error: {e}")
    except Exception as e:
        raise ValueError(f"An unexpected error occurred: {e}")

def create_styled_email_template(title: str, content_html: str, logo_url: str = None, show_branding: bool = True) -> str:
    """
    Creates a standardized, styled HTML email wrapper for user-facing emails.
    """
    logo_html = f'<img src="{escape(logo_url)}" alt="Show Logo" class="logo" />' if logo_url else f'<img src="https://showready.k-p.video/logo.png" alt="ShowReady Logo" class="logo" />'
    footer_html = '<p class="footer">Sent using ShowReady</p>' if show_branding else ''

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
            max-height: 80px;
            max-width: 240px;
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
        </style>
      </head>
      <body>
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td bgcolor="#111827" align="center" style="padding: 20px 0;">
              <div class="container" style="background-color: #111827; border: 1px solid #374151;">
                <div class="logo-container">
                  {logo_html}
                </div>
                <div class="mainHeader">{escape(title)}</div>
                
                {content_html}

                {footer_html}
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """
    return html_template

def test_user_smtp_connection(
    settings: dict
):
    """Attempts to log in to the SMTP server to validate credentials."""
    try:
        password = settings['smtp_password']
        port = int(settings['smtp_port'])
        
        server = None
        if port == 465:
            server = smtplib.SMTP_SSL(settings['smtp_server'], port, timeout=15)
        else:
            server = smtplib.SMTP(settings['smtp_server'], port, timeout=15)
            server.starttls()

        with server:
            server.login(settings['smtp_username'], password)
            
        return True
    except smtplib.SMTPException as e:
        raise ValueError(f"Connection failed: {e}")
    except Exception as e:
        raise