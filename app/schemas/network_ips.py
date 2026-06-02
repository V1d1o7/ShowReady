from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class NetworkEntityType(str, Enum):
    rack_equipment = "rack_equipment"
    wire_diagram = "wire_diagram"
    manual = "manual"
    reservation = "reservation"


class NetworkIpStatus(str, Enum):
    assigned = "assigned"
    reserved = "reserved"
    conflict = "conflict"
    offline = "offline"


IPV4_REGEX = r"^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$"


class NetworkIpEntryBase(BaseModel):
    vlan_id: Optional[UUID] = None
    entity_type: NetworkEntityType = NetworkEntityType.manual
    entity_id: Optional[UUID] = None
    ip_address: Optional[str] = Field(default=None, pattern=IPV4_REGEX)
    ip_end: Optional[str] = Field(default=None, pattern=IPV4_REGEX)
    mac_address: Optional[str] = None
    hostname: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    status: NetworkIpStatus = NetworkIpStatus.assigned
    notes: Optional[str] = None


class NetworkIpEntryCreate(NetworkIpEntryBase):
    pass


class NetworkIpEntryUpdate(BaseModel):
    vlan_id: Optional[UUID] = None
    entity_type: Optional[NetworkEntityType] = None
    entity_id: Optional[UUID] = None
    ip_address: Optional[str] = Field(default=None, pattern=IPV4_REGEX)
    ip_end: Optional[str] = Field(default=None, pattern=IPV4_REGEX)
    mac_address: Optional[str] = None
    hostname: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    status: Optional[NetworkIpStatus] = None
    notes: Optional[str] = None


class NetworkIpEntryResponse(NetworkIpEntryBase):
    id: UUID
    show_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NetworkIpSyncEntity(BaseModel):
    entity_type: NetworkEntityType
    entity_id: UUID
    ip_address: Optional[str] = Field(default=None, pattern=IPV4_REGEX)
    mac_address: Optional[str] = None
    hostname: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
