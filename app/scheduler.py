import os
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client
# Updated imports: templates now come from email_utils
from app.email_utils import (
    send_email, 
    create_warning_email_html, 
    create_revoked_email_html,
    create_storage_reminder_email_html
)
from app.models import SenderIdentity

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

async def check_storage_limits(supabase_admin: Client, admin_sender: SenderIdentity):
    """
    Checks users who have been downgraded and are in the grace period for storage limits.
    Sends reminders at 15 days and 1 day remaining.
    Deletes excess archived shows after 30 days.
    """
    print("Running Storage Limit Check...")
    now = datetime.now(timezone.utc)
    
    # 1. Fetch profiles currently in grace period
    grace_profiles_res = supabase_admin.table('profiles').select('*, tiers(max_archived_shows)').not_.is_('downgraded_at', 'null').execute()
    
    for profile in grace_profiles_res.data:
        user_id = profile['id']
        downgraded_at_str = profile.get('downgraded_at')
        if not downgraded_at_str: continue
        
        downgraded_at = datetime.fromisoformat(downgraded_at_str)
        days_elapsed = (now - downgraded_at).days
        days_remaining = 30 - days_elapsed
        
        # Get limits
        max_archived = profile.get('tiers', {}).get('max_archived_shows')
        if max_archived is None:
            # If limit was removed (upgraded to unlimited), clear grace period
            supabase_admin.table('profiles').update({'downgraded_at': None}).eq('id', user_id).execute()
            continue

        # Get current count
        archived_shows_res = supabase_admin.table('shows').select('id, created_at').eq('user_id', user_id).eq('status', 'archived').order('created_at').execute()
        archived_shows = archived_shows_res.data
        current_count = len(archived_shows)
        
        # If user fixed it themselves, clear grace period
        if current_count <= max_archived:
            supabase_admin.table('profiles').update({'downgraded_at': None}).eq('id', user_id).execute()
            print(f"User {user_id} resolved storage limit. Grace period cleared.")
            continue

        try:
            user_auth = supabase_admin.auth.admin.get_user_by_id(user_id)
            user_email = user_auth.user.email
            
            # --- ACTION: DELETE (Day 30+) ---
            if days_elapsed >= 30:
                excess_count = current_count - max_archived
                if excess_count > 0:
                    # Identify oldest excess shows to delete
                    shows_to_delete = archived_shows[:excess_count]
                    delete_ids = [s['id'] for s in shows_to_delete]
                    
                    # Delete them
                    supabase_admin.table('shows').delete().in_('id', delete_ids).execute()
                    print(f"Deleted {len(delete_ids)} excess archived shows for user {user_id}.")
                    
                    # Clear grace period as they are now compliant
                    supabase_admin.table('profiles').update({'downgraded_at': None}).eq('id', user_id).execute()
            
            # --- ACTION: 1 Day Reminder (Day 29) ---
            elif days_elapsed >= 29 and not profile.get('storage_reminder_1_sent'):
                html = create_storage_reminder_email_html(profile, days_remaining)
                send_email(user_email, "Final Warning: Shows will be deleted tomorrow", html, admin_sender)
                supabase_admin.table('profiles').update({'storage_reminder_1_sent': True}).eq('id', user_id).execute()
                print(f"Sent 1-day storage reminder to {user_id}")

            # --- ACTION: 15 Day Reminder (Day 15) ---
            elif days_elapsed >= 15 and not profile.get('storage_reminder_15_sent'):
                html = create_storage_reminder_email_html(profile, days_remaining)
                send_email(user_email, "Reminder: Storage Limit Exceeded", html, admin_sender)
                supabase_admin.table('profiles').update({'storage_reminder_15_sent': True}).eq('id', user_id).execute()
                print(f"Sent 15-day storage reminder to {user_id}")

        except Exception as e:
            print(f"Error processing storage check for user {user_id}: {e}")


async def grim_reaper_task():
    """The daily task to manage inactive beta users AND storage limits."""
    print("Running Grim Reaper task...")
    now = datetime.now(timezone.utc)
    
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not service_key:
        print("CRITICAL ERROR: SUPABASE_SERVICE_KEY is missing from environment. Grim Reaper task cannot run.")
        return

    supabase_admin = create_client(SUPABASE_URL, service_key)

    sender_res = supabase_admin.table('sender_identities').select('*').eq('email', 'showready@kuiper-productions.com').single().execute()
    if not sender_res.data:
        print("Admin sender identity not found. Cannot send emails.")
        return
    admin_sender = SenderIdentity(**sender_res.data)

    # --- Run Inactivity Checks ---
    thirty_days_ago = now - timedelta(days=30)
    
    roles_res = supabase_admin.table('roles').select('id, name').in_('name', ['beta', 'admin']).execute()
    role_map = {role['name']: role['id'] for role in roles_res.data}
    
    beta_role_id = role_map.get('beta')
    admin_role_id = role_map.get('admin')

    if beta_role_id:
        # Get all user IDs with the 'beta' role
        beta_user_ids_res = supabase_admin.table('user_roles').select('user_id').eq('role_id', beta_role_id).execute()
        beta_user_ids = {item['user_id'] for item in beta_user_ids_res.data}

        # Exclude admins
        if admin_role_id:
            admin_user_ids_res = supabase_admin.table('user_roles').select('user_id').eq('role_id', admin_role_id).execute()
            admin_user_ids = {item['user_id'] for item in admin_user_ids_res.data}
            beta_user_ids -= admin_user_ids

        beta_user_ids_list = list(beta_user_ids)

        if beta_user_ids_list:
            # Warn
            profiles_to_warn_res = supabase_admin.table('profiles').select('id, first_name').in_('id', beta_user_ids_list).lt('last_active_at', thirty_days_ago.isoformat()).eq('inactivity_warning_sent', False).execute()
            for profile in profiles_to_warn_res.data:
                try:
                    user_res = supabase_admin.auth.admin.get_user_by_id(profile['id'])
                    html_content = create_warning_email_html(profile)
                    send_email(user_res.user.email, "ShowReady Beta Inactivity Warning", html_content, admin_sender)
                    supabase_admin.table('profiles').update({'inactivity_warning_sent': True}).eq('id', profile['id']).execute()
                except Exception as e:
                    print(f"Error sending inactivity warning: {e}")

            # Revoke
            sixty_days_ago = now - timedelta(days=60)
            profiles_to_revoke_res = supabase_admin.table('profiles').select('id, first_name').in_('id', beta_user_ids_list).lt('last_active_at', sixty_days_ago.isoformat()).execute()
            for profile in profiles_to_revoke_res.data:
                try:
                    user_res = supabase_admin.auth.admin.get_user_by_id(profile['id'])
                    html_content = create_revoked_email_html(profile)
                    send_email(user_res.user.email, "ShowReady Beta Access Revoked", html_content, admin_sender)
                    supabase_admin.table('user_roles').delete().eq('user_id', profile['id']).eq('role_id', beta_role_id).execute()
                except Exception as e:
                    print(f"Error revoking access: {e}")

    # --- Run Storage Limit Checks ---
    await check_storage_limits(supabase_admin, admin_sender)

    print("Grim Reaper task finished.")


scheduler = AsyncIOScheduler()
# Schedule the task to run once a day at 2 AM UTC
scheduler.add_job(grim_reaper_task, CronTrigger(hour=2, minute=0, timezone="UTC"))