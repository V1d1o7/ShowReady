"""Shared shift/assignment flattening logic used by app/routers/schedule.py,
app/routers/roster.py, and app/routers/hours.py.

A "shift" (show_shifts) carries the default date/call/end time/notes for everyone filling
it; a person's assignment (show_crew_shifts) can override call_time/end_time/notes for just
themselves (e.g. an early call). Everywhere a flat, single "shift" object is expected
(CrewStatusBadge.js's helpers, email templates' {{schedule}} merge var, the hours-tracker
autofill), the override wins and the shift's own value is the fallback.
"""
from typing import Optional


def effective_assignment_fields(assignment: dict, shift: dict) -> dict:
    """Flattens one show_crew_shifts row + its parent show_shifts row into the shape
    existing consumers already expect: {id, shift_date, call_time, end_time, notes, status},
    plus shift_id/shift_position_id/label for the newer shift-aware consumers."""
    return {
        'id': assignment['id'],
        'shift_id': assignment['shift_id'],
        'shift_position_id': assignment['shift_position_id'],
        'shift_date': shift['shift_date'],
        'call_time': assignment.get('call_time') or shift.get('call_time'),
        'end_time': assignment.get('end_time') or shift.get('end_time'),
        'notes': assignment.get('notes') or shift.get('notes'),
        'status': assignment.get('status') or 'scheduled',
        'label': shift.get('label'),
    }


def flatten_nested_assignment(scs_row: dict) -> dict:
    """Same as effective_assignment_fields, but for a show_crew_shifts row fetched with a
    nested `shift:show_shifts(...)` select (i.e. {..., 'shift': {...}}) rather than the
    shift passed separately."""
    shift = scs_row.get('shift') or {}
    assignment = {k: v for k, v in scs_row.items() if k != 'shift'}
    return effective_assignment_fields(assignment, shift)
