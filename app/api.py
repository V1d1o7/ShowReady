import os
import shutil
from fastapi import APIRouter, HTTPException, Body, File, UploadFile
from fastapi.responses import StreamingResponse, JSONResponse
from typing import List, Dict, Optional

from .models import ShowFile, LoomLabel, CaseLabel
from .pdf_utils import generate_loom_label_pdf, generate_case_label_pdf

router = APIRouter()

# --- Configuration ---
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
IMAGES_DIR = os.path.join(STATIC_DIR, "images")
os.makedirs(IMAGES_DIR, exist_ok=True)

# --- FIX: The database now starts empty ---
db: Dict[str, ShowFile] = {}

# --- Show Management Endpoints ---

@router.post("/shows/{show_name}", response_model=ShowFile, tags=["Shows"])
async def create_or_update_show(show_name: str, show_data: ShowFile):
    db[show_name] = show_data
    return show_data

@router.get("/shows/{show_name}", response_model=ShowFile, tags=["Shows"])
async def get_show(show_name: str):
    if show_name not in db:
        raise HTTPException(status_code=404, detail=f"Show '{show_name}' not found.")
    return db[show_name]

@router.get("/shows", response_model=List[str], tags=["Shows"])
async def list_shows():
    return list(db.keys())

@router.delete("/shows/{show_name}", status_code=204, tags=["Shows"])
async def delete_show(show_name: str):
    if show_name not in db:
        raise HTTPException(status_code=404, detail=f"Show '{show_name}' not found.")
    del db[show_name]
    return

# --- File Upload Endpoint ---

@router.post("/upload/logo", tags=["File Upload"])
async def upload_logo(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image.")
    file_path = os.path.join(IMAGES_DIR, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()
    return JSONResponse(content={"logo_path": file_path})

# --- PDF Generation Endpoints ---

@router.post("/pdf/loom-labels", tags=["PDF Generation"])
async def get_loom_labels_pdf(
    labels: List[LoomLabel],
    placement: Optional[Dict[int, int]] = Body(None)
):
    pdf_buffer = generate_loom_label_pdf(labels, placement)
    headers = {'Content-Disposition': 'inline; filename="loom_labels.pdf"'}
    return StreamingResponse(pdf_buffer, media_type="application/pdf", headers=headers)

@router.post("/pdf/case-labels", tags=["PDF Generation"])
async def get_case_labels_pdf(
    labels: List[CaseLabel],
    logo_path: Optional[str] = Body(None),
    placement: Optional[Dict[int, int]] = Body(None)
):
    pdf_buffer = generate_case_label_pdf(labels, logo_path, placement)
    headers = {'Content-Disposition': 'inline; filename="case_labels.pdf"'}
    return StreamingResponse(pdf_buffer, media_type="application/pdf", headers=headers)
