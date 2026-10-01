"""Shared "preferred name wins, legal name is the fallback" logic for roster members.

Preferred name/pronouns are stored exactly as entered (nullable) and never auto-copied
from first_name/last_name at write time — the fallback is computed here, at read time,
so a later legal-name edit is never masked by a stale copy. Every backend place that
displays or templates a roster member's name should go through these helpers rather than
hand-concatenating first_name/last_name. The frontend mirror of this is
frontend/src/utils/rosterName.js.
"""
from typing import Tuple


def get_display_first_last(roster: dict) -> Tuple[str, str]:
    first = (roster.get('preferred_first_name') or roster.get('first_name') or '').strip()
    last = (roster.get('preferred_last_name') or roster.get('last_name') or '').strip()
    return first, last


def get_display_name(roster: dict) -> str:
    first, last = get_display_first_last(roster)
    return f"{first} {last}".strip()


def get_legal_name(roster: dict) -> str:
    first = (roster.get('first_name') or '').strip()
    last = (roster.get('last_name') or '').strip()
    return f"{first} {last}".strip()


def has_preferred_name(roster: dict) -> bool:
    pref_first = (roster.get('preferred_first_name') or '').strip()
    pref_last = (roster.get('preferred_last_name') or '').strip()
    return bool(pref_first or pref_last)
