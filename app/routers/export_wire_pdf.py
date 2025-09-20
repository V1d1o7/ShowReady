import io
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.schemas.wire_export import Graph
from app.services.wire_export_svg import build_pdf_bytes

router = APIRouter(
    prefix="/api",
    tags=["export"],
)

@router.post("/export/wire.pdf")
async def export_wire_pdf(graph: Graph):
    """
    Exports the wire diagram as a vector PDF.
    """
    if not graph.nodes:
        raise HTTPException(status_code=400, detail="Cannot export an empty graph.")

    try:
        pdf_bytes = build_pdf_bytes(graph)
        if not pdf_bytes:
            # This case can happen if the graph has nodes but generation still results in empty bytes.
            # It's better to return a 500 than a potentially corrupted file.
            raise HTTPException(status_code=500, detail="Failed to generate PDF: result was empty.")

        return Response(content=pdf_bytes, media_type="application/pdf", headers={
            "Content-Disposition": "attachment; filename=wire-export.pdf"
        })
    except Exception as e:
        # It's good practice to log the exception here in a real application
        # import logging
        # logging.exception("PDF generation failed")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during PDF generation: {e}")
