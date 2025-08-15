from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import uuid

# --- User Profile Model ---
class UserProfile(BaseModel):
    id: uuid.UUID
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    production_role: Optional[str] = None
    production_role_other: Optional[str] = None
    role: Optional[str] = 'user'

class UserProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    production_role: Optional[str] = None
    production_role_other: Optional[str] = None
    role: Optional[str] = None

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
    production_manager: Optional[str] = None
    pm_email: Optional[str] = None

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

# Updated create model to include ports
class EquipmentTemplateCreate(BaseModel):
    model_number: str
    manufacturer: str
    ru_height: int
    width: str = 'full'
    ports: List[PortTemplate] = Field(default_factory=list) # Updated field
    folder_id: Optional[uuid.UUID] = None

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

class RackEquipmentInstanceCreate(BaseModel):
    template_id: uuid.UUID
    ru_position: int
    instance_name: Optional[str] = None 
    rack_side: Optional[str] = None

class RackEquipmentInstanceUpdate(BaseModel):
    ru_position: Optional[int] = None
    rack_side: Optional[str] = None
    ip_address: Optional[str] = None
    x_pos: Optional[int] = None 
    y_pos: Optional[int] = None

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
    equipment_templates: Optional[EquipmentTemplate] = None

class Rack(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    show_name: str
    user_id: uuid.UUID
    rack_name: str
    ru_height: int
    saved_to_library: bool = False
    equipment: List[RackEquipmentInstanceWithTemplate] = Field(default_factory=list)

class RackCreate(BaseModel):
    rack_name: str
    ru_height: int
    show_name: str

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

class EquipmentTemplateUpdate(BaseModel):
    model_number: Optional[str] = None
    manufacturer: Optional[str] = None
    ru_height: Optional[int] = None
    width: Optional[str] = None
    ports: Optional[List[PortTemplate]] = None
    folder_id: Optional[uuid.UUID] = None