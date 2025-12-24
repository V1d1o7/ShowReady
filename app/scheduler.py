import os
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client
from app.email_utils import send_email, create_email_html
from app.models import SenderIdentity

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def create_warning_email_html(user_profile: dict) -> str:
    """Creates a custom HTML email for the inactivity warning."""
    first_name = user_profile.get('first_name', 'there')
    # This template has a yellow background for the main content area
    html_template = f"""
    <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          /* Styles adapted from your existing template */
          body {{ font-family: 'Inter', sans-serif; margin: 0; padding: 0; }}
          .container {{ max-width: 600px; margin: 0 auto; padding: 30px; border-radius: 15px; }}
          .main-content {{ background-color: #3f3f46; /* Zinc 700 - Yellowish/Warm Gray */ padding: 20px; border-radius: 10px; }}
          p {{ font-size: 16px; line-height: 1.8; color: #d4d4d8; text-align: left; }}
        </style>
      </head>
      <body>
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td bgcolor="#111827" align="center" style="padding: 20px 0;">
              <div class="container" style="background-color: #18181b; border: 1px solid #374151;">
                <div class="main-content">
                  <p>Hi {first_name},</p>
                  <p>This is a friendly notice that your ShowReady beta account has been inactive for over 30 days. To keep your access, please log in within the next 30 days. We'd love to have you continue with us!</p>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """
    return html_template

def create_revoked_email_html(user_profile: dict) -> str:
    """Creates a custom HTML email for the beta access revocation."""
    first_name = user_profile.get('first_name', 'there')
    # This template has a red background for the main content area
    html_template = f"""
    <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          /* Styles adapted from your existing template */
          body {{ font-family: 'Inter', sans-serif; margin: 0; padding: 0; }}
          .container {{ max-width: 600px; margin: 0 auto; padding: 30px; border-radius: 15px; }}
          .main-content {{ background-color: #450a0a; /* Dark Red */ padding: 20px; border-radius: 10px; }}
          p {{ font-size: 16px; line-height: 1.8; color: #d4d4d8; text-align: left; }}
        </style>
      </head>
      <body>
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td bgcolor="#111827" align="center" style="padding: 20px 0;">
              <div class="container" style="background-color: #18181b; border: 1px solid #374151;">
                <div class="main-content">
                  <p>Hi {first_name},</p>
                  <p>Your beta access for ShowReady has been revoked due to inactivity of over 60 days. If you wish to rejoin the beta, please contact our support team. Thank you for your participation!</p>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """
    return html_template

async def grim_reaper_task():
    """The daily task to manage inactive beta users."""
    print("Running Grim Reaper task...")
    now = datetime.now(timezone.utc)
    
    # --- CRITICAL FIX: Use Service Key for Admin Tasks ---
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not service_key:
        print("CRITICAL ERROR: SUPABASE_SERVICE_KEY is missing from environment. Grim Reaper task cannot run.")
        return

    # Create admin client with the service key
    supabase_admin = create_client(SUPABASE_URL, service_key)

    # Fetch the admin sender identity
    sender_res = supabase_admin.table('sender_identities').select('*').eq('email', 'admin@showready.k-p.video').single().execute()
    if not sender_res.data:
        print("Admin sender identity not found. Cannot send emails.")
        return
    admin_sender = SenderIdentity(**sender_res.data)

    # 1. Check for users inactive for 30+ days who need a warning
    thirty_days_ago = now - timedelta(days=30)
    
    # Get IDs for 'beta' and 'admin' roles
    roles_res = supabase_admin.table('roles').select('id, name').in_('name', ['beta', 'admin']).execute()
    role_map = {role['name']: role['id'] for role in roles_res.data}
    
    beta_role_id = role_map.get('beta')
    admin_role_id = role_map.get('admin')

    if not beta_role_id:
        print("Beta role not found. Exiting task.")
        return

    # Get all user IDs with the 'beta' role
    beta_user_ids_res = supabase_admin.table('user_roles').select('user_id').eq('role_id', beta_role_id).execute()
    beta_user_ids = {item['user_id'] for item in beta_user_ids_res.data}

    # Get all user IDs with the 'admin' role and exclude them
    if admin_role_id:
        admin_user_ids_res = supabase_admin.table('user_roles').select('user_id').eq('role_id', admin_role_id).execute()
        admin_user_ids = {item['user_id'] for item in admin_user_ids_res.data}
        beta_user_ids -= admin_user_ids

    beta_user_ids_list = list(beta_user_ids)

    if not beta_user_ids_list:
        print("No non-admin users with the beta role found.")
    else:
        # Find profiles that need a warning
        profiles_to_warn_res = supabase_admin.table('profiles').select('id, first_name').in_('id', beta_user_ids_list).lt('last_active_at', thirty_days_ago.isoformat()).eq('inactivity_warning_sent', False).execute()
        
        for profile in profiles_to_warn_res.data:
            user_id = profile['id']
            try:
                user_res = supabase_admin.auth.admin.get_user_by_id(user_id)
                user_email = user_res.user.email
                
                # Send warning email
                html_content = create_warning_email_html(profile)
                send_email(user_email, "ShowReady Beta Inactivity Warning", html_content, admin_sender)
                
                # Update the warning sent flag
                supabase_admin.table('profiles').update({'inactivity_warning_sent': True}).eq('id', user_id).execute()
                print(f"Warning sent to user {user_id}")
            except Exception as e:
                print(f"Error processing warning for user {user_id}: {e}")

    # 2. Check for users inactive for 60+ days to revoke access
    sixty_days_ago = now - timedelta(days=60)
    if beta_user_ids_list:
        profiles_to_revoke_res = supabase_admin.table('profiles').select('id, first_name').in_('id', beta_user_ids_list).lt('last_active_at', sixty_days_ago.isoformat()).execute()

        for profile in profiles_to_revoke_res.data:
            user_id = profile['id']
            try:
                user_res = supabase_admin.auth.admin.get_user_by_id(user_id)
                user_email = user_res.user.email
                
                # Send revocation email
                html_content = create_revoked_email_html(profile)
                send_email(user_email, "ShowReady Beta Access Revoked", html_content, admin_sender)

                # Remove beta role
                supabase_admin.table('user_roles').delete().eq('user_id', user_id).eq('role_id', beta_role_id).execute()
                print(f"Beta access revoked for user {user_id}")
            except Exception as e:
                print(f"Error revoking access for user {user_id}: {e}")

    print("Grim Reaper task finished.")


scheduler = AsyncIOScheduler()
# Schedule the task to run once a day at a specific time (e.g., 2 AM UTC)
scheduler.add_job(grim_reaper_task, CronTrigger(hour=2, minute=0, timezone="UTC"))