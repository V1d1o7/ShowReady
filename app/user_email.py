import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from pydantic import BaseModel
from .encryption import decrypt_password

class SMTPSettings(BaseModel):
    from_name: str
    from_email: str
    smtp_server: str
    smtp_port: int
    smtp_username: str
    encrypted_smtp_password: str # This comes from the DB

def send_email_with_user_smtp(
    smtp_settings: SMTPSettings,
    recipient_email: str,
    subject: str,
    html_body: str,
    attachment_blob: bytes = None,
    attachment_filename: str = "report.pdf"
):
    """Connects to a user's SMTP server and sends an email."""
    
    try:
        # Decrypt the password right before use
        password = decrypt_password(smtp_settings.encrypted_smtp_password)

        msg = MIMEMultipart()
        msg["From"] = f"{smtp_settings.from_name} <{smtp_settings.from_email}>"
        msg["To"] = recipient_email
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html"))

        if attachment_blob:
            part = MIMEApplication(attachment_blob, Name=attachment_filename)
            part["Content-Disposition"] = f'attachment; filename="{attachment_filename}"'
            msg.attach(part)

        # Connect to the server
        with smtplib.SMTP(smtp_settings.smtp_server, smtp_settings.smtp_port) as server:
            server.starttls() # Secure the connection
            server.login(smtp_settings.smtp_username, password)
            server.send_message(msg)
            
    except smtplib.SMTPException as e:
        print(f"SMTP Error: {e}")
        raise ValueError(f"Failed to send email. SMTP Error: {e}")
    except Exception as e:
        print(f"General email error: {e}")
        raise ValueError(f"An unexpected error occurred: {e}")

def test_user_smtp_connection(
    settings: dict
):
    """Attempts to log in to the SMTP server to validate credentials."""
    try:
        password = settings['smtp_password'] # Plain text from user
        with smtplib.SMTP(settings['smtp_server'], int(settings['smtp_port'])) as server:
            server.starttls()
            server.login(settings['smtp_username'], password)
        return True
    except smtplib.SMTPException as e:
        print(f"SMTP Test Error: {e}")
        raise ValueError(f"Connection failed: {e}")
