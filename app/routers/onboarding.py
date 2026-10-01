import secrets

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.api import get_supabase_client, get_user, feature_check
from app.schemas.onboarding import OnboardingLinkConfig, OnboardingLinkUpdate

router = APIRouter()

_SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o/1/l/i - avoids visual ambiguity
_SLUG_LENGTH = 8
_MAX_SLUG_ATTEMPTS = 10

_DEFAULT_FORM_FIELDS = [
    {'source': 'standard', 'key': 'first_name', 'required': True},
    {'source': 'standard', 'key': 'last_name', 'required': True},
    {'source': 'standard', 'key': 'email', 'required': True},
    {'source': 'standard', 'key': 'phone_number', 'required': False},
    {'source': 'standard', 'key': 'position', 'required': False},
]


def _generate_unique_slug(supabase: Client) -> str:
    """Same check-then-retry shape as roster.py's custom-field-key collision loop, adapted
    for a random candidate space instead of an enumerable one."""
    for _ in range(_MAX_SLUG_ATTEMPTS):
        candidate = ''.join(secrets.choice(_SLUG_ALPHABET) for _ in range(_SLUG_LENGTH))
        existing = supabase.table('onboarding_links').select('id').eq('slug', candidate).execute()
        if not existing.data:
            return candidate
    raise HTTPException(status_code=500, detail="Failed to generate a unique onboarding link. Please try again.")


@router.get("/onboarding-link", response_model=OnboardingLinkConfig, tags=["Onboarding"], dependencies=[Depends(feature_check("crew_onboarding"))])
async def get_or_create_onboarding_link(user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Lazily provisions the user's one onboarding link on first access."""
    existing = supabase.table('onboarding_links').select('*').eq('user_id', str(user.id)).execute()
    if existing.data:
        return existing.data[0]

    insert_data = {
        'user_id': str(user.id),
        'slug': _generate_unique_slug(supabase),
        'is_custom_slug': False,
        'enabled': False,  # off by default - owner opts in to publishing the link
        'form_fields': _DEFAULT_FORM_FIELDS,
    }
    response = supabase.table('onboarding_links').insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create onboarding link.")
    return response.data[0]


@router.put("/onboarding-link", response_model=OnboardingLinkConfig, tags=["Onboarding"], dependencies=[Depends(feature_check("crew_onboarding"))])
async def update_onboarding_link(data: OnboardingLinkUpdate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    existing = supabase.table('onboarding_links').select('id, slug').eq('user_id', str(user.id)).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Onboarding link not found.")

    update_data = data.model_dump(exclude_unset=True)
    if 'slug' in update_data and update_data['slug'] != existing.data[0]['slug']:
        collision = supabase.table('onboarding_links').select('id').eq('slug', update_data['slug']).neq('user_id', str(user.id)).execute()
        if collision.data:
            raise HTTPException(status_code=409, detail="That link is already taken. Please choose another.")
        update_data['is_custom_slug'] = True

    response = supabase.table('onboarding_links').update(update_data).eq('user_id', str(user.id)).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to update onboarding link.")
    return response.data[0]


@router.post("/onboarding-link/regenerate-slug", response_model=OnboardingLinkConfig, tags=["Onboarding"], dependencies=[Depends(feature_check("crew_onboarding"))])
async def regenerate_onboarding_slug(user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    existing = supabase.table('onboarding_links').select('id').eq('user_id', str(user.id)).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Onboarding link not found.")

    response = supabase.table('onboarding_links').update({
        'slug': _generate_unique_slug(supabase),
        'is_custom_slug': False,
    }).eq('user_id', str(user.id)).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to regenerate onboarding link.")
    return response.data[0]
