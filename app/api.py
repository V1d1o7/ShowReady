import os
import shutil
import json
import io
import zipfile
from fastapi import APIRouter, HTTPException, Body, File, UploadFile
from fastapi.responses import StreamingResponse, JSONResponse
from typing import List, Dict, Optional

from .models import ShowFile, LoomLabel, CaseLabel
from .pdf_utils import generate_loom_label_pdf, generate_case_label_pdf

router = APIRouter()

# --- Configuration ---
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
IMAGES_DIR = os.path.join(STATIC_DIR, "images")
APP_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "app_data")

os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(APP_DATA_DIR, exist_ok=True)

# --- Database ---
db: Dict[str, ShowFile] = {}

def load_shows_from_disk():
    db.clear() # Clear the in-memory database before loading
    for filename in os.listdir(APP_DATA_DIR):
        if filename.endswith(".show"):
            show_name = filename[:-5]
            file_path = os.path.join(APP_DATA_DIR, filename)
            with open(file_path, 'r') as f:
                try:
                    show_data = json.load(f)
                    db[show_name] = ShowFile(**show_data)
                except (json.JSONDecodeError, TypeError) as e:
                    print(f"Error loading {filename}: {e}")

load_shows_from_disk()

# --- Show Management Endpoints ---

@router.post("/shows/{show_name}", response_model=ShowFile, tags=["Shows"])
async def create_or_update_show(show_name: str, show_data: ShowFile):
    db[show_name] = show_data
    file_path = os.path.join(APP_DATA_DIR, f"{show_name}.show")
    with open(file_path, "w") as f:
        f.write(show_data.model_dump_json(indent=4))
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
    file_path = os.path.join(APP_DATA_DIR, f"{show_name}.show")
    if os.path.exists(file_path):
        os.remove(file_path)
    return

# --- New Export/Import Endpoints ---

@router.get("/shows/{show_name}/export", tags=["Shows"])
async def export_show(show_name: str):
    if show_name not in db:
        raise HTTPException(status_code=404, detail="Show not found")

    show_data = db[show_name]
    show_file_path = os.path.join(APP_DATA_DIR, f"{show_name}.show")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add .show file to zip
        zf.write(show_file_path, arcname=f"{show_name}.show")
        
        # Add logo to zip if it exists
        if show_data.info.logo_path and os.path.exists(show_data.info.logo_path):
            logo_filename = os.path.basename(show_data.info.logo_path)
            zf.write(show_data.info.logo_path, arcname=logo_filename)

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={show_name}.zip"}
    )

@router.post("/shows/import", tags=["Shows"])
async def import_show(file: UploadFile = File(...)):
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a .zip file.")

    with zipfile.ZipFile(io.BytesIO(await file.read()), 'r') as zf:
        show_file_name = None
        logo_file_name = None

        for name in zf.namelist():
            if name.endswith('.show'):
                show_file_name = name
            elif name.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                logo_file_name = name
        
        if not show_file_name:
            raise HTTPException(status_code=400, detail="No .show file found in the zip archive.")

        # Extract and save .show file
        with zf.open(show_file_name) as show_file:
            show_file_content = show_file.read()
            # Ensure the show file name matches the internal show name for consistency
            show_data = json.loads(show_file_content)
            imported_show_name = show_data.get("info", {}).get("show_name")
            if not imported_show_name:
                raise HTTPException(status_code=400, detail="Show file is missing 'show_name' in info.")
            
            final_show_filename = f"{imported_show_name}.show"
            
            # Extract and save logo if it exists
            if logo_file_name:
                with zf.open(logo_file_name) as logo_file:
                    logo_path = os.path.join(IMAGES_DIR, logo_file_name)
                    with open(logo_path, 'wb') as f:
                        f.write(logo_file.read())
                    # Update logo path in the show data
                    show_data["info"]["logo_path"] = logo_path

            with open(os.path.join(APP_DATA_DIR, final_show_filename), 'w') as f:
                json.dump(show_data, f, indent=4)

    load_shows_from_disk()
    return JSONResponse(content={"message": "Show imported successfully", "shows": list(db.keys())})


# --- File Upload Endpoint ---

@router.post("/upload/logo", tags=["File Upload"])
async def upload_logo(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image.")
    
    # Sanitize filename to prevent directory traversal attacks
    filename = os.path.basename(file.filename)
    file_path = os.path.join(IMAGES_DIR, filename)

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
