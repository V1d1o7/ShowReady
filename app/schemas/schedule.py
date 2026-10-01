from datetime import date, datetime, time
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel


class ShiftInput(BaseModel):
    shift_date: date
    call_time: Optional[time] = None
    end_time: Optional[time] = None
    notes: Optional[str] = None


# 'completed' is deliberately not a settable value here — it's derived (scheduled + the
# shift's date has passed), never a manual choice, so it can't drift out of sync with the
# calendar the way something you have to remember to set would.
ShiftStatus = Literal['scheduled', 'no_show', 'cancelled']


class ShiftStatusUpdate(BaseModel):
    status: ShiftStatus


# --- Shift-centric scheduling (show_shifts / show_shift_positions) ---

class ShiftPositionInput(BaseModel):
    position: str
    required_count: int = 1


class ShiftCreate(BaseModel):
    shift_date: date
    call_time: Optional[time] = None
    end_time: Optional[time] = None
    label: Optional[str] = None
    notes: Optional[str] = None
    positions: List[ShiftPositionInput] = []


class ShiftEditInput(BaseModel):
    """Partial update of a shift's own fields — a naive PUT here (vs. upsert) matches
    upsert_crew_shift's old reasoning: editing a shift that doesn't exist is a 404, not a
    silent create."""
    shift_date: Optional[date] = None
    call_time: Optional[time] = None
    end_time: Optional[time] = None
    label: Optional[str] = None
    notes: Optional[str] = None


class ShiftPositionEdit(BaseModel):
    position: Optional[str] = None
    required_count: Optional[int] = None


class AssignmentOverrideUpdate(BaseModel):
    """Edits one person's override call/end time or note on a shift they're already
    assigned to — the per-assignment counterpart to a shift's own defaults. An empty/null
    field means 'stop overriding, inherit the shift's value' rather than 'no change' (matches
    the old upsert_crew_shift's full-replace semantics on the fields it accepted)."""
    call_time: Optional[time] = None
    end_time: Optional[time] = None
    notes: Optional[str] = None


class ShiftPositionsAssignRequest(BaseModel):
    """Assigns an already-identified roster member into one or more existing shift
    positions in one call — the shift-based counterpart to the old
    'shifts: List[ShiftInput]' (which used to invent a dated shift on the spot; now every
    shift must already exist, created via the Schedule tab's shift board)."""
    shift_position_ids: List[UUID]
    position: Optional[str] = None
    rate_type: Optional[str] = 'hourly'
    hourly_rate: Optional[float] = 0.0
    daily_rate: Optional[float] = 0.0
    template_id: Optional[UUID] = None
    notify: bool = True


class BoardAssignRequest(ShiftPositionsAssignRequest):
    """Used by the shift board's per-position 'assign' action, where the position is
    already known from the URL and only the person still needs picking."""
    roster_id: UUID
    shift_position_ids: List[UUID] = []  # filled in from the path by the endpoint


class DateStatus(BaseModel):
    shift_date: date
    status: Literal['pending', 'available', 'unavailable']


class RespondDateInput(BaseModel):
    shift_date: date
    available: bool


class AvailabilityRespondRequest(BaseModel):
    dates: List[RespondDateInput]


class AvailabilityCallCreate(BaseModel):
    roster_ids: List[UUID]
    shifts: List[ShiftInput] = []
    subject: str
    body: str
    name: Optional[str] = None


class AvailabilityResponseOut(BaseModel):
    id: UUID
    show_id: int
    call_id: UUID
    call_name: Optional[str] = None
    roster_id: UUID
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    preferred_first_name: Optional[str] = None
    preferred_last_name: Optional[str] = None
    email: Optional[str] = None
    position: Optional[str] = None
    status: str
    responded_at: Optional[datetime] = None
    show_crew_id: Optional[UUID] = None
    shifts: List[ShiftInput] = []
    date_statuses: List[DateStatus] = []


class PublicAvailabilityDetail(BaseModel):
    show_name: str
    call_name: Optional[str] = None
    first_name: Optional[str] = None
    shifts: List[ShiftInput] = []
    date_statuses: List[DateStatus] = []
    status: str
    responded_at: Optional[datetime] = None


class AvailabilityStatusUpdate(BaseModel):
    status: Literal['pending', 'available', 'declined']


class AvailabilityDismissRequest(BaseModel):
    ids: List[UUID]
    dismissed: bool = True


class ManualAvailabilityCreate(BaseModel):
    roster_id: UUID
    shifts: List[ShiftInput] = []


class ScheduleDateCreate(BaseModel):
    shift_date: date
    notes: Optional[str] = None


class ScheduleDateOut(BaseModel):
    shift_date: date
    notes: Optional[str] = None
