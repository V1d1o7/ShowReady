from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import Response
from pydantic import BaseModel
from supabase import Client
from app.api import get_supabase_client, get_user, feature_check
from app.models import ShowFile
from app.pdf_utils import generate_radio_label_pdf
from typing import Dict

router = APIRouter()

class RadioChannelsPayload(BaseModel):
    radio_channels: Dict[str, str]

@router.post("/shows/{show_id}/radio-labels/pdf", dependencies=[Depends(feature_check("radio_labels"))])
async def create_radio_label_pdf_for_show(
    show_id: int,
    payload: RadioChannelsPayload,
    user=Depends(get_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Generate a PDF for radio labels for a specific show.
    """
    try:
        # Verify user has access to the show and get the show name
        show_res = supabase.table('shows').select('name').eq('id', show_id).eq('user_id', str(user.id)).single().execute()
        if not show_res.data:
            raise HTTPException(status_code=404, detail="Show not found or access denied.")
        
        show_name = show_res.data['name']

        pdf_buffer = generate_radio_label_pdf(
            channels=payload.radio_channels,
            show_name=show_name
        )
        return Response(
            pdf_buffer.getvalue(),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={show_name}_radio_labels.pdf"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {e}")
