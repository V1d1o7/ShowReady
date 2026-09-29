from datetime import date, datetime, time
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel


class ShiftInput(BaseModel):
    shift_date: date
    call_time: Optional[time] = None
    end_time: Optional[time] = None
    notes: Optional[str] = None


class ShiftUpdate(BaseModel):
    call_time: Optional[time] = None
    end_time: Optional[time] = None
    notes: Optional[str] = None


# 'completed' is deliberately not a settable value here — it's derived (scheduled + the
# shift's date has passed), never a manual choice, so it can't drift out of sync with the
# calendar the way something you have to remember to set would.
ShiftStatus = Literal['scheduled', 'no_show', 'cancelled']


class ShiftStatusUpdate(BaseModel):
    status: ShiftStatus


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
    email: Optional[str] = None
    position: Optional[str] = None
    status: str
    responded_at: Optional[datetime] = None
    show_crew_id: Optional[UUID] = None
    shifts: List[ShiftInput] = []
    date_statuses: List[DateStatus] = []


class AssignFromPoolRequest(BaseModel):
    shifts: List[ShiftInput]
    position: Optional[str] = None
    rate_type: Optional[str] = 'hourly'
    hourly_rate: Optional[float] = 0.0
    daily_rate: Optional[float] = 0.0
    template_id: Optional[UUID] = None


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
