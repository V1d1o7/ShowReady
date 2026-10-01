from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

SLUG_PATTERN = r'^[a-z0-9]+(-[a-z0-9]+)*$'


class OnboardingFormFieldConfig(BaseModel):
    """One entry in the owner's ordered field-selection list. List order is the display
    order on the public form; 'key' is either a standard field name (first_name|last_name|
    preferred_first_name|preferred_last_name|pronouns|email|phone_number|position) or a
    roster_custom_field_definitions.key."""
    source: Literal['standard', 'custom']
    key: str
    required: bool = False


class OnboardingLinkConfig(BaseModel):
    id: UUID
    user_id: UUID
    slug: str
    is_custom_slug: bool
    enabled: bool
    intro_text: Optional[str] = None
    form_fields: List[OnboardingFormFieldConfig] = []
    created_at: datetime
    updated_at: datetime


class OnboardingLinkUpdate(BaseModel):
    slug: Optional[str] = Field(default=None, min_length=3, max_length=32, pattern=SLUG_PATTERN)
    enabled: Optional[bool] = None
    intro_text: Optional[str] = None
    form_fields: Optional[List[OnboardingFormFieldConfig]] = None


class PublicOnboardingField(BaseModel):
    """Public-facing render info only — deliberately doesn't expose the internal
    roster_custom_field_definitions.id/sort_order/user_id. field_id is namespaced
    ('standard:<name>' / 'custom:<key>') so the submit payload can round-trip it without a
    standard-vs-custom key collision (e.g. a custom field labeled 'First Name')."""
    field_id: str
    label: str
    field_type: Literal['text', 'email', 'tel', 'number', 'date', 'yesno', 'dropdown']
    options: List[str] = []
    required: bool = False


class PublicOnboardingForm(BaseModel):
    intro_text: Optional[str] = None
    fields: List[PublicOnboardingField] = []


class OnboardingSubmitRequest(BaseModel):
    turnstile_token: str
    honeypot: str = ""
    values: Dict[str, Any] = {}
