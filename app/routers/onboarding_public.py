import os
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Tuple

import requests
from fastapi import APIRouter, HTTPException, Request

from app.api import get_service_client, _user_has_feature
from app.schemas.onboarding import OnboardingSubmitRequest, PublicOnboardingField, PublicOnboardingForm

router = APIRouter()

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TURNSTILE_SECRET_KEY = os.environ.get("TURNSTILE_SECRET_KEY")

_STANDARD_FIELD_META = {
    'first_name': {'label': 'First Name', 'field_type': 'text'},
    'last_name': {'label': 'Last Name', 'field_type': 'text'},
    'preferred_first_name': {'label': 'Preferred First Name', 'field_type': 'text'},
    'preferred_last_name': {'label': 'Preferred Last Name', 'field_type': 'text'},
    'pronouns': {'label': 'Pronouns', 'field_type': 'text'},
    'email': {'label': 'Email', 'field_type': 'email'},
    'phone_number': {'label': 'Phone Number', 'field_type': 'tel'},
    'position': {'label': 'Position', 'field_type': 'text'},
}
_STANDARD_ROSTER_COLUMNS = {
    'first_name', 'last_name', 'preferred_first_name', 'preferred_last_name', 'pronouns',
    'email', 'phone_number', 'position',
}

# In-memory sliding-window rate limit: {(ip, slug): [timestamps]}. Same structural shape as
# main.py's _last_activity_write throttle, but rejects with 429 instead of silently skipping.
# Per-process only - resets on restart, doesn't share state across instances. Acceptable today
# since Turnstile (not this) is the real bot defense; this is a cheap backstop.
_RATE_LIMIT_WINDOW = timedelta(minutes=10)
_RATE_LIMIT_MAX_ATTEMPTS = 5
_rate_limit_buckets: Dict[Tuple[str, str], List[datetime]] = {}


def _get_client_ip(request: Request) -> str:
    """Site is behind Cloudflare - CF-Connecting-IP is authoritative when present."""
    cf_ip = request.headers.get('CF-Connecting-IP')
    if cf_ip:
        return cf_ip.strip()
    xff = request.headers.get('X-Forwarded-For')
    if xff:
        return xff.split(',')[0].strip()
    return request.client.host if request.client else 'unknown'


def _check_rate_limit(ip: str, slug: str):
    key = (ip, slug)
    now = datetime.now(timezone.utc)
    attempts = [t for t in _rate_limit_buckets.get(key, []) if now - t < _RATE_LIMIT_WINDOW]
    if len(attempts) >= _RATE_LIMIT_MAX_ATTEMPTS:
        _rate_limit_buckets[key] = attempts
        raise HTTPException(status_code=429, detail="Too many submissions. Please try again later.")
    attempts.append(now)
    _rate_limit_buckets[key] = attempts


def _verify_turnstile(token: str, client_ip: str):
    if not TURNSTILE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Server misconfiguration: Turnstile is not configured.")
    if not token:
        raise HTTPException(status_code=400, detail="Verification failed. Please reload the page and try again.")
    try:
        resp = requests.post(
            TURNSTILE_VERIFY_URL,
            data={"secret": TURNSTILE_SECRET_KEY, "response": token, "remoteip": client_ip},
            timeout=5,
        )
        result = resp.json()
    except (requests.RequestException, ValueError):
        # Fail CLOSED: if Cloudflare's endpoint itself is down/times out, reject rather than
        # silently let the submission through - the honeypot/rate-limit alone are trivial for
        # a targeted script to bypass, so an outage silently becoming an open door would defeat
        # the point of having Turnstile at all.
        raise HTTPException(status_code=503, detail="Verification service is temporarily unavailable. Please try again shortly.")
    if not result.get("success"):
        raise HTTPException(status_code=400, detail="Verification failed. Please reload the page and try again.")


def _load_enabled_link(supabase, slug: str) -> dict:
    res = supabase.table('onboarding_links').select('*').eq('slug', slug).execute()
    if not res.data or not res.data[0].get('enabled'):
        raise HTTPException(status_code=404, detail="This link is invalid or no longer active.")
    link = res.data[0]
    if not _user_has_feature(link['user_id'], 'crew_onboarding', supabase):
        # Same 404 as "missing"/"disabled" - a prober can't distinguish a lapsed
        # subscription from a bad slug, and a submitter never fills out a form that's
        # going to be silently rejected at submit time because access lapsed after the
        # link was shared.
        raise HTTPException(status_code=404, detail="This link is invalid or no longer active.")
    return link


def _resolve_public_fields(supabase, link: dict) -> List[PublicOnboardingField]:
    form_fields = link.get('form_fields') or []
    custom_keys = [f['key'] for f in form_fields if f.get('source') == 'custom']
    defs_by_key = {}
    if custom_keys:
        defs_res = supabase.table('roster_custom_field_definitions').select('*') \
            .eq('user_id', link['user_id']).in_('key', custom_keys).execute()
        defs_by_key = {d['key']: d for d in (defs_res.data or [])}

    resolved = []
    for entry in form_fields:
        source, key, required = entry.get('source'), entry.get('key'), bool(entry.get('required'))
        if source == 'standard':
            meta = _STANDARD_FIELD_META.get(key)
            if meta:
                resolved.append(PublicOnboardingField(field_id=f"standard:{key}", required=required, **meta))
        elif source == 'custom':
            definition = defs_by_key.get(key)
            if definition:  # silently drop if the custom field was deleted since configuring
                resolved.append(PublicOnboardingField(
                    field_id=f"custom:{key}", label=definition['label'],
                    field_type=definition['field_type'], options=definition.get('options') or [],
                    required=required,
                ))
    return resolved


def _validate_required(fields: List[PublicOnboardingField], values: Dict[str, Any]):
    missing = []
    for f in fields:
        if not f.required:
            continue
        val = values.get(f.field_id)
        if val is None or (isinstance(val, str) and not val.strip()):
            missing.append(f.label)
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required field(s): {', '.join(missing)}")


def _coerce_field_value(field: PublicOnboardingField, raw: Any) -> Any:
    if field.field_type == 'yesno':
        return raw if isinstance(raw, bool) else str(raw).strip().lower() in ('true', 'yes', '1', 'on')
    if field.field_type == 'number':
        try:
            num = float(raw)
            return int(num) if num.is_integer() else num
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"'{field.label}' must be a number.")
    if field.field_type == 'date':
        text = str(raw).strip()
        try:
            date.fromisoformat(text)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"'{field.label}' must be a valid date.")
        return text
    if field.field_type == 'dropdown':
        text = str(raw).strip()
        if field.options and text not in field.options:
            raise HTTPException(status_code=400, detail=f"'{field.label}' must be one of the listed options.")
        return text
    text = str(raw).strip()
    if len(text) > 500:
        raise HTTPException(status_code=400, detail=f"'{field.label}' is too long.")
    return text


def _build_roster_insert(user_id: str, fields: List[PublicOnboardingField], values: Dict[str, Any]) -> dict:
    standard_data, custom_data = {}, {}
    for f in fields:
        raw = values.get(f.field_id)
        if raw is None or raw == '':
            continue
        source, _, key = f.field_id.partition(':')
        coerced = _coerce_field_value(f, raw)
        if source == 'standard' and key in _STANDARD_ROSTER_COLUMNS:
            standard_data[key] = coerced
        elif source == 'custom':
            custom_data[key] = coerced
    return {
        'user_id': user_id,
        'tags': ['New-Member'],
        'status': 'active',
        'custom_fields': custom_data,
        **standard_data,
    }


@router.get("/join/{slug}", response_model=PublicOnboardingForm, tags=["Onboarding (Public)"])
def get_public_onboarding_form(slug: str):
    supabase = get_service_client()
    link = _load_enabled_link(supabase, slug)
    return PublicOnboardingForm(intro_text=link.get('intro_text'), fields=_resolve_public_fields(supabase, link))


@router.post("/join/{slug}/submit", tags=["Onboarding (Public)"])
def submit_onboarding_form(slug: str, data: OnboardingSubmitRequest, request: Request):
    client_ip = _get_client_ip(request)
    _check_rate_limit(client_ip, slug)

    if (data.honeypot or "").strip():
        # Silent fake-success: never tip off a bot that it was caught.
        return {"success": True}

    supabase = get_service_client()
    link = _load_enabled_link(supabase, slug)

    _verify_turnstile(data.turnstile_token, client_ip)

    fields = _resolve_public_fields(supabase, link)
    _validate_required(fields, data.values)
    roster_insert = _build_roster_insert(link['user_id'], fields, data.values)

    response = supabase.table('roster').insert(roster_insert).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to submit the form. Please try again.")
    return {"success": True}
