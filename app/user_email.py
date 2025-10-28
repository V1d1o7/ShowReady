import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from pydantic import BaseModel
from .encryption import decrypt_password
from typing import List

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
