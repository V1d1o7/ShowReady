import os

# --- CRITICAL FIX: Set env vars BEFORE importing app.scheduler ---
# app/scheduler.py initializes the Supabase client at the top level.
# If these aren't set, the import itself will crash.
os.environ.setdefault("SUPABASE_URL", "https://dummy.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "dummy-key")
# We also set the service key just in case logic checks for it later
os.environ.setdefault("SUPABASE_SERVICE_KEY", "dummy-service-key")

# Now it is safe to import
from app.scheduler import create_warning_email_html, create_revoked_email_html

# Mock user profile for the preview
mock_profile = {
    "first_name": "Justin",
    "last_name": "Case",
    "email": "justin@example.com"
}

def generate_previews():
    print("Generating email previews...")
    
    # 1. Generate Warning Email (Yellow Theme)
    try:
        warning_html = create_warning_email_html(mock_profile)
        with open("preview_warning.html", "w") as f:
            f.write(warning_html)
        print("✅ Generated 'preview_warning.html' (Inactivity Warning)")
    except Exception as e:
        print(f"❌ Error generating warning email: {e}")

    # 2. Generate Revoked Email (Red Theme)
    try:
        revoked_html = create_revoked_email_html(mock_profile)
        with open("preview_revoked.html", "w") as f:
            f.write(revoked_html)
        print("✅ Generated 'preview_revoked.html' (Access Revoked)")
    except Exception as e:
        print(f"❌ Error generating revoked email: {e}")

if __name__ == "__main__":
    generate_previews()