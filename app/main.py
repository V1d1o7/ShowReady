import os
import uvicorn
from dotenv import load_dotenv

# --- Environment Variable Loading ---
# This must be at the top, before other application imports,
# to ensure environment variables are available globally.
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path=dotenv_path)
else:
    # Fallback for environments where .env might not be present (like some containers)
    print("Warning: .env file not found. Relying on system environment variables.")

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .api import router as api_router
from app.routers.export_wire_pdf import router as wire_export_router


app = FastAPI(
    title="ShowReady API",
    description="API for managing production show files, loom labels, and case labels.",
    version="1.0.0",
)

# --- CORS Configuration ---
# Allow requests from your frontend development server and production domain
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://showready.k-p.video", # Your production URL
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the API router BEFORE mounting the static files
app.include_router(api_router, prefix="/api")
app.include_router(wire_export_router)

# --- Static Files Configuration ---
# This will serve the index.html for any path that is not an api call
BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "build")

# This will serve the static files (js, css, etc.)
STATIC_DIR = os.path.join(BUILD_DIR, "static")

if not os.path.exists(BUILD_DIR):
    print(f"Build directory not found at {BUILD_DIR}. Frontend may not be built.")
    # Create a placeholder directory to prevent crashing
    os.makedirs(BUILD_DIR)
    with open(os.path.join(BUILD_DIR, "index.html"), "w") as f:
        f.write("Frontend not built. Run 'npm run build' in the frontend directory.")

if not os.path.exists(STATIC_DIR):
    print(f"Static directory not found at {STATIC_DIR}. Frontend may not be built.")
    os.makedirs(STATIC_DIR)


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/{full_path:path}", response_class=FileResponse)
async def catch_all(request: Request, full_path: str):
    index_path = os.path.join(BUILD_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="index.html not found")
    return FileResponse(index_path)

# This block allows the script to be run directly for development
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
