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

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from datetime import datetime, timedelta, timezone
from .api import get_supabase_client, get_user
from .api import router as api_router
from app.routers.export_wire_pdf import router as wire_export_router
from app.routers.feedback import router as feedback_router
from app.routers.vlan import router as vlan_router
from app.routers.vlan_script import router as vlan_script_router
from app.routers.roster import router as roster_router
from app.routers.hours import router as hours_router
from app.routers.pdf import router as pdf_router
from app.routers.user_settings import router as user_settings_router
from app.routers.show_settings import router as show_settings_router
from app.routers.switch_admin import router as switch_admin_router
from app.routers.switch_config import router as switch_config_router
from app.routers.switch_agent import router as switch_agent_router
from app.routers.notes import router as notes_router
from app.routers.communications import router as communications_router
from .scheduler import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the scheduler on application startup
    scheduler.start()
    yield
    # Shutdown the scheduler on application shutdown
    scheduler.shutdown()

app = FastAPI(
    title="ShowReady API",
    description="API for managing production show files, loom labels, and case labels.",
    version="1.0.0",
    lifespan=lifespan,
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

@app.middleware("http")
async def track_user_activity(request: Request, call_next):
    """
    Middleware to track user activity on API routes.
    Updates the 'last_active_at' timestamp in the user's profile.
    """
    if request.url.path.startswith("/api/"):
        try:
            user = await get_user(request)
            if user:
                supabase = get_supabase_client()
                now = datetime.now(timezone.utc)
                
                # Fetch the last active time from the profile
                profile_res = supabase.table('profiles').select('last_active_at').eq('id', user.id).maybe_single().execute()
                
                if profile_res.data:
                    last_active_str = profile_res.data.get('last_active_at')
                    
                    should_update = True
                    if last_active_str:
                        # Convert string to offset-aware datetime
                        last_active_at = datetime.fromisoformat(last_active_str)
                        if now - last_active_at < timedelta(minutes=5):
                            should_update = False
                    
                    if should_update:
                        supabase.table('profiles').update({'last_active_at': now.isoformat()}).eq('id', user.id).execute()

        except HTTPException as e:
            # This will happen for unauthenticated routes, which is fine.
            # We just pass through without tracking activity.
            if e.status_code == 401:
                pass
            else:
                print(f"Error in activity tracking middleware: {e.detail}")
        except Exception as e:
            # Catch other potential errors during user fetching or DB update
            print(f"An unexpected error occurred in activity tracking middleware: {e}")

    response = await call_next(request)
    return response


# Include the API router BEFORE mounting the static files.
# Routers with more specific paths should be included before
# routers with more general paths.
app.include_router(vlan_router, prefix="/api/vlans")
app.include_router(vlan_script_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")
app.include_router(wire_export_router)
app.include_router(roster_router, prefix="/api")
app.include_router(hours_router, prefix="/api")
app.include_router(pdf_router, prefix="/api")
app.include_router(user_settings_router, prefix="/api")
app.include_router(show_settings_router, prefix="/api")

# Version 1 API for new features
app.include_router(switch_admin_router, prefix="/api/v1")
app.include_router(switch_config_router, prefix="/api/v1")
app.include_router(switch_agent_router, prefix="/api/v1")
app.include_router(notes_router, prefix="/api/v1")
app.include_router(communications_router, prefix="/api/communications", tags=["Communications"])

app.include_router(api_router, prefix="/api")

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