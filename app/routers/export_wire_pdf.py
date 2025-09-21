from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from app.schemas.wire_export import Graph
from app.services.wire_export_svg import build_pdf_bytes

router = APIRouter(
    prefix="/api",
    tags=["Simplified PDF Export"],
)

@router.post("/export/wire.pdf")
async def export_wire_pdf(graph: Graph):
    if not graph.nodes:
        raise HTTPException(status_code=400, detail="Cannot export an empty graph.")
    try:
        pdf_bytes = build_pdf_bytes(graph)
        if not pdf_bytes:
            raise HTTPException(status_code=500, detail="Failed to generate PDF: result was empty.")

        return Response(content=pdf_bytes, media_type="application/pdf", headers={
            "Content-Disposition": f"attachment; filename={graph.show_name}-simplified-wire-export.pdf"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")
