import os
import shutil
import json
from fastapi import APIRouter, HTTPException, Body, File, UploadFile
from fastapi.responses import StreamingResponse, JSONResponse
from typing import List, Dict, Optional

from .models import ShowFile, LoomLabel, CaseLabel
from .pdf_utils import generate_loom_label_pdf, generate_case_label_pdf

router = APIRouter()

# --- Configuration ---
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
IMAGES_DIR = os.path.join(STATIC_DIR, "images")
# --- FIX: Added a path to the app_data directory ---
APP_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "app_data")

os.makedirs(IMAGES_DIR, exist_ok=True)
# --- FIX: Ensure the app_data directory exists ---
os.makedirs(APP_DATA_DIR, exist_ok=True)

# --- Database ---
db: Dict[str, ShowFile] = {}

# --- FIX: Function to load show files from disk ---
def load_shows_from_disk():
    for filename in os.listdir(APP_DATA_DIR):
        if filename.endswith(".show"):
            show_name = filename[:-5] # Remove .show extension
            file_path = os.path.join(APP_DATA_DIR, filename)
            with open(file_path, 'r') as f:
                try:
                    # Load the JSON data from the file
                    show_data = json.load(f)
                    # Create a ShowFile model instance from the data
                    db[show_name] = ShowFile(**show_data)
                except (json.JSONDecodeError, TypeError) as e:
                    # Handle cases with invalid JSON or data structure
                    print(f"Error loading {filename}: {e}")

# --- FIX: Load existing shows at startup ---
load_shows_from_disk()

# --- Show Management Endpoints ---

@router.post("/shows/{show_name}", response_model=ShowFile, tags=["Shows"])
async def create_or_update_show(show_name: str, show_data: ShowFile):
    """
    Creates a new show or updates an existing one.
    Saves the show data to a .show file.
    """
    db[show_name] = show_data
    # --- FIX: Save the new or updated show to a file ---
    file_path = os.path.join(APP_DATA_DIR, f"{show_name}.show")
    with open(file_path, "w") as f:
        # Use Pydantic's json() method for proper serialization
        f.write(show_data.json(indent=4))
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
    # --- FIX: Also delete the show file from disk ---
    file_path = os.path.join(APP_DATA_DIR, f"{show_name}.show")
    if os.path.exists(file_path):
        os.remove(file_path)
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