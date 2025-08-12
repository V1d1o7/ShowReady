from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import os
from .api import router as api_router

app = FastAPI(
    title="ShowReady API",
    description="API for managing production show files, loom labels, and case labels.",
    version="1.0.0",
)

# --- Configuration for Static Files ---
# This is the new section that tells FastAPI to serve files from the 'static' directory.
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

# Mount the static directory to the /static path
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# Include the API router, which contains all the endpoints
app.include_router(api_router, prefix="/api")

@app.get("/", tags=["Root"])
async def read_root():
    """
    A simple root endpoint to confirm the API is running.
    """
    return {"message": "Welcome to the ShowReady API!"}
