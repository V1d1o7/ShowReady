from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..email_utils import send_email, create_feedback_email_html
from ..models import SenderIdentity
from ..api import get_user
from supabase import Client
import os
from html import escape

router = APIRouter()

class FeedbackPayload(BaseModel):
    feedback_type: str
    feedback: str

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

def get_supabase_client():
    return Client(SUPABASE_URL, SUPABASE_KEY)

@router.post("/feedback", tags=["Feedback"])
async def submit_feedback(payload: FeedbackPayload, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Accepts user feedback, formats it into a themed HTML email, and sends it to a designated address.
    """
    try:
        # Fetch user profile for personalization
        profile_res = supabase.table('profiles').select('first_name, last_name').eq('id', str(user.id)).single().execute()
        
        user_profile_data = {
            "full_name": "A user",
            "email": user.email
        }
        if profile_res.data:
            first_name = profile_res.data.get('first_name', '')
            last_name = profile_res.data.get('last_name', '')
            user_profile_data['full_name'] = f"{first_name} {last_name}".strip()

        recipient_email = "showready@kuiper-productions.com"
        subject = f"SRFB: {payload.feedback_type}"

        # Use the new, dedicated feedback email template
        html_content = create_feedback_email_html(
            feedback_type=payload.feedback_type,
            feedback=payload.feedback,
            user_profile=user_profile_data
        )
        
        # Define the sender identity for the system
        sender = SenderIdentity(
            name="ShowReady Feedback",
            email="noreply@kuiper-productions.com",
            sender_login_email="showready@kuiper-productions.com"
        )
        
        send_email(recipient_email, subject, html_content, sender, reply_to_email=user.email)
        
        return {"message": "Feedback submitted successfully."}
    except Exception as e:
        print(f"An error occurred while sending feedback email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send feedback.")