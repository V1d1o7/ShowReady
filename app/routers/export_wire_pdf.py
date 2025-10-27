import io
import base64
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import Response
from app.schemas.wire_export import PdfExportPayload
from app.services.wire_export_svg import build_pdf_bytes
from app.api import get_user, get_supabase_client, get_branding_visibility
from supabase import Client

router = APIRouter(
    prefix="/api",
    tags=["export"],
)

@router.post("/export/wire.pdf")
async def export_wire_pdf(
    payload: PdfExportPayload, 
    show_id: int = Query(...),
    user = Depends(get_user),
    supabase: Client = Depends(get_supabase_client),
    show_branding: bool = Depends(get_branding_visibility)
):
    """
    Exports the wire diagram as a vector PDF.
    """
    if not payload.graph.nodes:
        raise HTTPException(status_code=400, detail="Cannot export an empty graph.")

    try:
        # Fetch logos
        show_res = supabase.table('shows').select('data, name').eq('id', show_id).eq('user_id', str(user.id)).single().execute()
        if show_res.data:
            show_name = show_res.data.get('name', 'export')
            if 'data' in show_res.data and 'info' in show_res.data['data']:
                show_logo_path = show_res.data['data']['info'].get('logo_path')
            if show_logo_path:
                try:
                    show_logo_bytes = supabase.storage.from_('logos').download(show_logo_path)
                    payload.title_block.show_logo_base64 = base64.b64encode(show_logo_bytes).decode('utf-8')
                except Exception as e:
                    print(f"Could not download show logo: {e}")

        profile_res = supabase.table('profiles').select('company_logo_path').eq('id', str(user.id)).single().execute()
        if profile_res.data and profile_res.data.get('company_logo_path'):
            company_logo_path = profile_res.data['company_logo_path']
            try:
                company_logo_bytes = supabase.storage.from_('logos').download(company_logo_path)
                payload.title_block.company_logo_base64 = base64.b64encode(company_logo_bytes).decode('utf-8')
            except Exception as e:
                print(f"Could not download company logo: {e}")
        
        payload.title_block.show_branding = show_branding

        pdf_bytes = build_pdf_bytes(payload.graph, payload.graph.page_size, payload.title_block)
        if not pdf_bytes:
            raise HTTPException(status_code=500, detail="Failed to generate PDF: result was empty.")

        filename = f"{show_name}-wire-export.pdf"
        return Response(content=pdf_bytes, media_type="application/pdf", headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\""
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during PDF generation: {e}")
