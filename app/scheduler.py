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
    
    # Colors
    bg_warning = "#feb204" # amber/golden orange
    bg_card = "#1F2937"    # Gray 800 (Card background)
    bg_footer = "#111827"  # Gray 900 (Footer background)
    accent_color = "#F59E0B" # Amber 500
    text_white = "#F9FAFB"
    text_gray = "#D1D5DB"
    text_muted = "#4B5563"

    html_template = f"""
<table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="background-color: {bg_warning};">
  <tbody>
    <tr>
      <td colspan="1" rowspan="1" align="center" style="padding: 40px 10px;">
        <table cellpadding="0" cellspacing="0" width="600" border="0" align="center" draggable="false" style="background-color: {bg_card}; border-radius: 12px; overflow: hidden; border: 1px solid #374151; font-family: Helvetica, Arial, sans-serif; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); margin: 0px auto;">
          <tbody>
            <tr><td colspan="1" rowspan="1" style="background-color: {accent_color}; height: 6px;"></td></tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 30px 40px; border-bottom: 1px solid #374151;">
                <h1 style="color: {text_white}; margin: 0px; font-size: 24px; font-weight: 700;"><strong>Inactivity Warning</strong></h1>
                <p style="color: {accent_color}; margin: 5px 0px 0px; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;"><strong>ShowReady Beta</strong></p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 40px;">
                <p style="color: {text_gray}; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hi {first_name},</p>
                <p style="color: {text_gray}; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">This is a friendly notice that your ShowReady beta account has been inactive for over 30 days. To keep your access, please log in within the next 30 days. We'd love to have you continue with us!</p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="background-color: {bg_footer}; padding: 20px; text-align: center; border-top: 1px solid #374151;">
                <p style="color: {text_muted}; font-size: 12px; margin: 0px;">Powered by ShowReady</p>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>
"""
    return html_template

def create_revoked_email_html(user_profile: dict) -> str:
    """Creates a custom HTML email for the beta access revocation."""
    first_name = user_profile.get('first_name', 'there')

    # Colors
    bg_revoked = "#450a0a" # Red 950 (Dark Red background)
    bg_card = "#1F2937"    # Gray 800
    bg_footer = "#111827"  # Gray 900
    accent_color = "#EF4444" # Red 500
    text_white = "#F9FAFB"
    text_gray = "#D1D5DB"
    text_muted = "#4B5563"

    html_template = f"""
<table cellpadding="0" cellspacing="0" width="100%" border="0" draggable="false" style="background-color: {bg_revoked};">
  <tbody>
    <tr>
      <td colspan="1" rowspan="1" align="center" style="padding: 40px 10px;">
        <table cellpadding="0" cellspacing="0" width="600" border="0" align="center" draggable="false" style="background-color: {bg_card}; border-radius: 12px; overflow: hidden; border: 1px solid #374151; font-family: Helvetica, Arial, sans-serif; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); margin: 0px auto;">
          <tbody>
            <tr><td colspan="1" rowspan="1" style="background-color: {accent_color}; height: 6px;"></td></tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 30px 40px; border-bottom: 1px solid #374151;">
                <h1 style="color: {text_white}; margin: 0px; font-size: 24px; font-weight: 700;"><strong>Access Revoked</strong></h1>
                <p style="color: {accent_color}; margin: 5px 0px 0px; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;"><strong>ShowReady Beta</strong></p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="padding: 40px;">
                <p style="color: {text_gray}; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hi {first_name},</p>
                <p style="color: {text_gray}; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">Your beta access for ShowReady has been revoked due to inactivity of over 60 days. If you wish to rejoin the beta, please contact our support team. Thank you for your participation!</p>
              </td>
            </tr>
            <tr>
              <td colspan="1" rowspan="1" style="background-color: {bg_footer}; padding: 20px; text-align: center; border-top: 1px solid #374151;">
                <p style="color: {text_muted}; font-size: 12px; margin: 0px;">Powered by ShowReady</p>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>
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
    sender_res = supabase_admin.table('sender_identities').select('*').eq('email', 'showready@kuiper-productions.com').single().execute()
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