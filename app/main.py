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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .api import router as api_router


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

# --- Static Files Configuration ---
# This will serve the index.html for any path that is not an api call
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "build")

if not os.path.exists(STATIC_DIR):
    print(f"Static directory not found at {STATIC_DIR}. Frontend may not be built.")
    # Create a placeholder directory to prevent crashing
    os.makedirs(STATIC_DIR)
    with open(os.path.join(STATIC_DIR, "index.html"), "w") as f:
        f.write("Frontend not built. Run 'npm run build' in the frontend directory.")

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

# This block allows the script to be run directly for development
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
