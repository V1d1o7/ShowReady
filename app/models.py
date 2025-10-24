from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Union
import uuid
from datetime import datetime

# --- Sender Identity Model ---
class SenderIdentity(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    name: str
    email: str
    sender_login_email: str

class SenderIdentityPublic(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    sender_login_email: str

class SenderIdentityCreate(BaseModel):
    name: str
    email: str
    sender_login_email: str


# --- Role Models ---
class Role(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None

class UserRole(BaseModel):
    user_id: uuid.UUID
    role_id: uuid.UUID

# --- User Profile Model ---
class UserProfile(BaseModel):
    id: uuid.UUID
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    production_role: Optional[str] = None
    production_role_other: Optional[str] = None
    company_logo_path: Optional[str] = None
    roles: List[str] = []
    permitted_features: List[str] = []
    feedback_button_text: Optional[str] = None

class UserProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    production_role: Optional[str] = None
    production_role_other: Optional[str] = None
    company_logo_path: Optional[str] = None

# --- SSO Configuration Model ---
class SSOConfig(BaseModel):
    id: uuid.UUID
    provider: str = 'authentik'
    config: Dict[str, str]

# --- Show Information Models ---
class ShowInfo(BaseModel):
    show_name: Optional[str] = None
    logo_path: Optional[str] = None
    production_video: Optional[str] = None
    show_pm_name: Optional[str] = None
    show_pm_email: Optional[str] = None
    show_td_name: Optional[str] = None
    show_td_email: Optional[str] = None
    show_designer_name: Optional[str] = None
    show_designer_email: Optional[str] = None
    ot_daily_threshold: Optional[float] = 10.0
    ot_weekly_threshold: Optional[float] = 40.0

# --- Loom Label Models ---
class LoomLabel(BaseModel):
    loom_name: str
    color: Optional[str] = None
    source: Optional[str] = None
    destination: Optional[str] = None

# --- Case Label Models ---
class CaseLabel(BaseModel):
    send_to: str
    contents: Optional[str] = ""

# --- Main Show File Model ---
class ShowFile(BaseModel):
    info: ShowInfo = Field(default_factory=ShowInfo)
    loom_sheets: Dict[str, List[LoomLabel]] = Field(default_factory=dict)
    case_sheets: Dict[str, List[CaseLabel]] = Field(default_factory=dict)

# --- Loom Builder Models ---
# A Cable is an individual cable within a Loom.
class CableLocation(BaseModel):
    type: str
    value: str
    end: str

class CableBase(BaseModel):
    label_content: str
    cable_type: str
    length_ft: Optional[float] = None
    origin: CableLocation
    destination: CableLocation
    origin_color: str
    destination_color: str
    is_rcvd: bool = False
    is_complete: bool = False

class CableCreate(CableBase):
    loom_id: uuid.UUID

class CableUpdate(BaseModel):
    label_content: Optional[str] = None
    cable_type: Optional[str] = None
    length_ft: Optional[float] = None
    origin: Optional[CableLocation] = None
    destination: Optional[CableLocation] = None
    origin_color: Optional[str] = None
    destination_color: Optional[str] = None
    is_rcvd: Optional[bool] = None
    is_complete: Optional[bool] = None

class Cable(CableBase):
    id: uuid.UUID
    loom_id: uuid.UUID
    created_at: datetime

class BulkCableUpdate(BaseModel):
    cable_ids: List[uuid.UUID]
    updates: CableUpdate

# A Loom is a container for multiple cables.
class LoomBase(BaseModel):
    name: str
    show_name: str

class LoomCreate(LoomBase):
    pass

class LoomUpdate(BaseModel):
    name: Optional[str] = None

class Loom(LoomBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime

# --- Roster Models ---
class RosterMemberBase(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    position: Optional[str] = None

class RosterMemberCreate(RosterMemberBase):
    pass

class RosterMember(RosterMemberBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime

class RosterMemberAndShowCrewCreate(RosterMemberCreate):
    show_id: int

class ShowCrewMember(BaseModel):
    id: uuid.UUID
    show_id: int
    roster_id: uuid.UUID
    role: Optional[str] = None
    hourly_rate: Optional[float] = None
    daily_rate: Optional[float] = None
    rate_type: Optional[str] = None
    roster: RosterMember

class ShowCrewMemberUpdate(BaseModel):
    role: Optional[str] = None
    hourly_rate: Optional[float] = None
    daily_rate: Optional[float] = None
    rate_type: Optional[str] = None

# --- Hours Tracking Models ---
from datetime import date

class TimesheetEntryBase(BaseModel):
    show_crew_id: uuid.UUID
    date: str
    hours: float

class TimesheetEntryCreate(TimesheetEntryBase):
    pass

class TimesheetEntry(TimesheetEntryBase):
    id: uuid.UUID
    created_at: datetime

class BulkTimesheetUpdate(BaseModel):
    entries: List[TimesheetEntryCreate]

# Model for a single crew member's week
class CrewMemberHours(BaseModel):
    show_crew_id: uuid.UUID
    first_name: str
    last_name: str
    rate_type: Optional[str] = None
    hourly_rate: Optional[float] = 0.0
    daily_rate: Optional[float] = 0.0
    # Store hours as a simple dict: {"2025-10-20": 8.0}
    hours_by_date: Dict[date, float] = Field(default_factory=dict)

# Model that represents the entire grid
class WeeklyTimesheet(BaseModel):
    show_id: int
    show_name: str
    logo_path: Optional[str] = None
    week_start_date: date
    week_end_date: date
    ot_weekly_threshold: float
    crew_hours: List[CrewMemberHours]

# Model for the email endpoint payload
class TimesheetEmailPayload(BaseModel):
    recipient_email: str
    subject: str
    body: str
    show_branding: bool = True

# --- VLAN Models ---
class VLANBase(BaseModel):
    name: str
    tag: int

class VLANCreate(VLANBase):
    pass

class VLANUpdate(BaseModel):
    name: Optional[str] = None
    tag: Optional[int] = None

class VLAN(VLANBase):
    id: uuid.UUID
    show_id: int
    created_at: datetime

# --- AV Rack Builder Models ---

class ConnectorTemplate(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    user_id: Optional[uuid.UUID] = None
    name: str
    connector_svg: str
    default_type: str
    default_signal: str

class PanelLayout(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    view: str
    background_svg: str
    connectors: List[Dict]

# New model for defining a port on an equipment template
class PortTemplate(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    label: str
    type: str  # 'input' or 'output'
    connector_type: str # 'HDMI', 'SDI', 'XLR', 'CAT6', 'RJ45' etc.

class EquipmentTemplate(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    user_id: Optional[uuid.UUID] = None
    model_number: str
    manufacturer: str
    ru_height: int
    width: str = 'full'
    power_consumption_watts: Optional[int] = None
    panels: List[PanelLayout] = Field(default_factory=list)
    ports: List[PortTemplate] = Field(default_factory=list) # Updated field
    folder_id: Optional[uuid.UUID] = None
    is_default: bool = False
    has_ip_address: bool = False

# Updated create model to include ports
class EquipmentTemplateCreate(BaseModel):
    model_number: str
    manufacturer: str
    ru_height: int
    width: str = 'full'
    ports: List[PortTemplate] = Field(default_factory=list) # Updated field
    folder_id: Optional[uuid.UUID] = None
    has_ip_address: bool = False

class RackEquipmentInstance(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    rack_id: uuid.UUID
    template_id: uuid.UUID
    ru_position: int
    instance_name: str
    rack_side: Optional[str] = None
    ip_address: Optional[str] = None
    x_pos: Optional[int] = None
    y_pos: Optional[int] = None
    page_number: Optional[int] = None

class RackEquipmentInstanceCreate(BaseModel):
    template_id: uuid.UUID
    ru_position: int
    instance_name: Optional[str] = None
    rack_side: Optional[str] = None

class EquipmentInstanceCreate(BaseModel):
    equipment_template_id: uuid.UUID
    instance_name: str
    show_id: int
    x_pos: Optional[int] = None
    y_pos: Optional[int] = None
    page_number: Optional[int] = None

class RackEquipmentInstanceUpdate(BaseModel):
    instance_name: Optional[str] = None
    ru_position: Optional[int] = None
    rack_side: Optional[str] = None
    ip_address: Optional[str] = None
    x_pos: Optional[int] = None
    y_pos: Optional[int] = None
    page_number: Optional[int] = None

class RackEquipmentInstanceWithTemplate(BaseModel):
    id: uuid.UUID
    rack_id: uuid.UUID
    template_id: uuid.UUID
    ru_position: int
    instance_name: str
    rack_side: Optional[str] = None
    ip_address: Optional[str] = None
    x_pos: Optional[int] = None
    y_pos: Optional[int] = None
    page_number: Optional[int] = 1
    equipment_templates: Optional[EquipmentTemplate] = None

class Rack(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    show_name: Optional[str] = None
    user_id: uuid.UUID
    rack_name: str
    ru_height: int
    saved_to_library: bool = False
    equipment: List[RackEquipmentInstanceWithTemplate] = Field(default_factory=list)

class RackCreate(BaseModel):
    rack_name: str
    ru_height: int
    show_name: Optional[str] = None

class RackUpdate(BaseModel):
    rack_name: Optional[str] = None
    ru_height: Optional[int] = None
    saved_to_library: Optional[bool] = None

# New models for connections
class Connection(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    show_id: uuid.UUID
    source_device_id: uuid.UUID
    source_port_id: uuid.UUID
    destination_device_id: uuid.UUID
    destination_port_id: uuid.UUID
    cable_type: str
    label: Optional[str] = None
    length_ft: Optional[int] = None

class ConnectionCreate(BaseModel):
    source_device_id: uuid.UUID
    source_port_id: uuid.UUID
    destination_device_id: uuid.UUID
    destination_port_id: uuid.UUID
    cable_type: str
    label: Optional[str] = None
    length_ft: Optional[int] = None

class ConnectionUpdate(BaseModel):
    source_device_id: Optional[uuid.UUID] = None
    source_port_id: Optional[uuid.UUID] = None
    destination_device_id: Optional[uuid.UUID] = None
    destination_port_id: Optional[uuid.UUID] = None
    cable_type: Optional[str] = None
    label: Optional[str] = None
    length_ft: Optional[int] = None

# --- Library Models ---
class Folder(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    parent_id: Optional[uuid.UUID] = None
    name: str
    is_default: bool = False
    nomenclature_prefix: Optional[str] = None

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[uuid.UUID] = None
    nomenclature_prefix: Optional[str] = None

class FolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    nomenclature_prefix: Optional[str] = None

class UserFolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    nomenclature_prefix: Optional[str] = None


class EquipmentTemplateUpdate(BaseModel):
    model_number: Optional[str] = None
    manufacturer: Optional[str] = None
    ru_height: Optional[int] = None
    width: Optional[str] = None
    ports: Optional[List[PortTemplate]] = None
    folder_id: Optional[uuid.UUID] = None
    has_ip_address: Optional[bool] = None
    
class UserEquipmentTemplateUpdate(BaseModel):
    model_number: Optional[str] = None
    manufacturer: Optional[str] = None
    ru_height: Optional[int] = None
    width: Optional[str] = None
    ports: Optional[List[PortTemplate]] = None
    folder_id: Optional[uuid.UUID] = None
    has_ip_address: Optional[bool] = None

class EquipmentCopy(BaseModel):
    template_id: uuid.UUID
    folder_id: Optional[uuid.UUID] = None

class RackLoad(BaseModel):
    template_rack_id: uuid.UUID
    show_name: str
    new_rack_name: str

# --- PDF Generation Models ---

class PDFNodePosition(BaseModel):
    x: float
    y: float

class PDFNodeData(BaseModel):
    label: str
    ip_address: Optional[str] = None
    rack_name: Optional[str] = None
    ru_position: Optional[int] = None
    equipment_templates: EquipmentTemplate

class PDFNode(BaseModel):
    id: str
    position: PDFNodePosition
    data: PDFNodeData
    width: float
    height: float

class PDFEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: str
    targetHandle: str
    label: Optional[str] = None
    data: Optional[Dict] = None

class PDFPage(BaseModel):
    page_number: int
    nodes: List[PDFNode]
    edges: List[PDFEdge]

class WireDiagramPDFPayload(BaseModel):
    pages: List[PDFPage]
    page_size: str = "letter"
    show_name: str
    sheet_title: Optional[str] = None

# --- Rack PDF Generation Models ---

class RackPDFPayload(BaseModel):
    racks: List[Rack]
    show_name: str
    page_size: str = "letter"

class LoomWithCables(Loom):
    cables: List[Cable] = []

class LoomBuilderPDFPayload(BaseModel):
    looms: List[LoomWithCables]
    show_name: str

class HoursPDFPayload(BaseModel):
    show_name: str
    dates: List[str]
    crew: List[ShowCrewMember]
    hoursByDate: Dict[str, Dict[str, Dict[str, float]]]

# --- Impersonation Models ---
class ImpersonateRequest(BaseModel):
    user_id: uuid.UUID

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

# --- User SMTP Settings Models ---
class UserSMTPSettingsCreate(BaseModel):
    from_name: str
    from_email: str
    smtp_server: str
    smtp_port: int
    smtp_username: str
    smtp_password: str

class UserSMTPSettingsUpdate(BaseModel):
    from_name: Optional[str] = None
    from_email: Optional[str] = None
    smtp_server: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None # Plain text, will be encrypted in the router

class UserSMTPSettingsResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    from_name: str
    from_email: str
    smtp_server: str
    smtp_port: int
    smtp_username: str
    created_at: datetime
