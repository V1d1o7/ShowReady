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
from starlette.background import BackgroundTask
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
from app.routers.collaboration import router as collaboration_router
from app.routers.label_engine import router as label_engine_router
from app.routers.panels import router as panels_router
from app.routers.network_ips import router as network_ips_router
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

# In-process throttle: {user_id: last_write_time}. Keeps the common request path
# free of any DB call; a stale/missing entry just means one extra write.
_ACTIVITY_WRITE_INTERVAL = timedelta(minutes=5)
_last_activity_write = {}


@app.middleware("http")
async def track_user_activity(request: Request, call_next):
    """
    Middleware to track user activity on API routes. Updates 'last_active_at' at most
    once per user per interval, and only as a background task after the response so it
    never adds latency to the request.
    """
    user = None
    should_record = False

    if request.url.path.startswith("/api/"):
        try:
            # Local JWT verification; result is memoized on request.state and reused by
            # the endpoint's own Depends(get_user).
            user = await get_user(request)
        except HTTPException:
            user = None
        except Exception as e:
            print(f"An unexpected error occurred in activity tracking middleware: {e}")
            user = None

        if user:
            now = datetime.now(timezone.utc)
            last = _last_activity_write.get(str(user.id))
            if last is None or now - last >= _ACTIVITY_WRITE_INTERVAL:
                should_record = True
                _last_activity_write[str(user.id)] = now

    response = await call_next(request)

    if should_record and user:
        supabase_client = get_supabase_client(request)
        user_id = str(user.id)

        def _write_last_active():
            try:
                supabase_client.table('profiles').update(
                    {'last_active_at': datetime.now(timezone.utc).isoformat()}
                ).eq('id', user_id).execute()
            except Exception as e:
                print(f"Activity tracking write failed: {e}")

        response.background = BackgroundTask(_write_last_active)

    return response


# Include the API router BEFORE mounting the static files.
# Routers with more specific paths should be included before
# routers with more general paths.
app.include_router(collaboration_router, prefix="/api") 
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
app.include_router(label_engine_router, prefix="/api/v1", tags=["Label Engine"])
app.include_router(network_ips_router, prefix="/api/v1")
app.include_router(communications_router, prefix="/api/communications", tags=["Communications"])
app.include_router(panels_router)

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

@app.middleware("http")
async def log_requests(request: Request, call_next):
    response = await call_next(request)
    return response

# This block allows the script to be run directly for development
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)