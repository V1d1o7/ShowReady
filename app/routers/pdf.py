from fastapi import APIRouter, Depends
from app.api import get_user
from app.pdf_generation import generate_hours_pdf
from fastapi.responses import Response
from app.models import HoursPDFPayload

router = APIRouter()

@router.post("/pdf/hours-labels", tags=["PDF Generation"])
async def generate_hours_pdf_endpoint(payload: HoursPDFPayload, user=Depends(get_user)):
    pdf_buffer = generate_hours_pdf(payload.model_dump())
    return Response(content=pdf_buffer.getvalue(), media_type='application/pdf')