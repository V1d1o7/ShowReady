import os

# The app modules initialize Supabase clients at the top level.
os.environ.setdefault("SUPABASE_URL", "https://dummy.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "dummy-key")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "dummy-service-key")

# Import all email template functions from email_utils
from app.email_utils import (
    create_warning_email_html, 
    create_revoked_email_html,
    create_downgrade_warning_email_html,
    create_storage_reminder_email_html,
    create_feedback_email_html,
    create_email_html
)

# Mock Data
mock_profile = {
    "first_name": "Justin",
    "last_name": "Case",
    "full_name": "Justin Case",
    "email": "justin@example.com"
}

def generate_previews():
    print("🎨 Generating email previews...")
    
    previews = []

    # 1. Inactivity Warning (Yellow)
    try:
        html = create_warning_email_html(mock_profile)
        previews.append(("preview_1_inactivity_warning.html", html))
    except Exception as e:
        print(f"❌ Error generating Inactivity Warning: {e}")

    # 2. Access Revoked (Red)
    try:
        html = create_revoked_email_html(mock_profile)
        previews.append(("preview_2_access_revoked.html", html))
    except Exception as e:
        print(f"❌ Error generating Access Revoked: {e}")

    # 3. Downgrade Immediate Warning (Yellow)
    try:
        html = create_downgrade_warning_email_html(mock_profile, days_remaining=30)
        previews.append(("preview_3_downgrade_warning.html", html))
    except Exception as e:
        print(f"❌ Error generating Downgrade Warning: {e}")

    # 4. Storage Reminder - 15 Days (Yellow)
    try:
        html = create_storage_reminder_email_html(mock_profile, days_remaining=15)
        previews.append(("preview_4_storage_reminder_15_days.html", html))
    except Exception as e:
        print(f"❌ Error generating Storage Reminder (15d): {e}")

    # 5. Storage Reminder - 1 Day (Red/Critical)
    try:
        html = create_storage_reminder_email_html(mock_profile, days_remaining=1)
        previews.append(("preview_5_storage_reminder_1_day.html", html))
    except Exception as e:
        print(f"❌ Error generating Storage Reminder (1d): {e}")

    # 6. Feedback Received (Admin Notification)
    try:
        html = create_feedback_email_html(
            feedback_type="Bug Report", 
            feedback="The flux capacitor is not fluxing correctly when I hit 88mph.", 
            user_profile=mock_profile
        )
        previews.append(("preview_6_feedback_received.html", html))
    except Exception as e:
        print(f"❌ Error generating Feedback Email: {e}")

    # 7. Generic Personalized Email (Standard Admin Comms)
    try:
        body_text = "Welcome to the new version of ShowReady!----We have updated the rack builder to include collision detection."
        html = create_email_html(mock_profile, body_text)
        previews.append(("preview_7_generic_personalized.html", html))
    except Exception as e:
        print(f"❌ Error generating Generic Personalized Email: {e}")

    # Write files
    for filename, content in previews:
        try:
            with open(filename, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"✅ Generated '{filename}'")
        except Exception as e:
            print(f"❌ Failed to write {filename}: {e}")

if __name__ == "__main__":
    generate_previews()