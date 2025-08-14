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
    view: str  # 'front' or 'rear'
    background_svg: str
    connectors: List[Dict] # { "connector_template_id": uuid, "x": int, "y": int, "instance_name": str }

class EquipmentTemplate(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    user_id: Optional[uuid.UUID] = None
    model_number: str
    manufacturer: str
    ru_height: int
    power_consumption_watts: Optional[int] = None
    panels: List[PanelLayout] = Field(default_factory=list)
    folder_id: Optional[uuid.UUID] = None
    is_default: bool = False

# This new model correctly represents an equipment instance with its template data nested inside.
class RackEquipmentInstanceWithTemplate(BaseModel):
    id: uuid.UUID
    rack_id: uuid.UUID
    template_id: uuid.UUID
    ru_position: int
    instance_name: str
    equipment_templates: Optional[EquipmentTemplate] = None

class RackEquipmentInstance(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    rack_id: uuid.UUID
    template_id: uuid.UUID
    ru_position: int
    instance_name: str

class RackEquipmentInstanceCreate(BaseModel):
    template_id: uuid.UUID
    ru_position: int
    instance_name: str

class RackEquipmentInstanceUpdate(BaseModel):
    ru_position: int

# This new model ensures the full equipment data is sent to the frontend.
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

# --- Library Models ---
class Folder(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    parent_id: Optional[uuid.UUID] = None
    name: str
    is_default: bool = False

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[uuid.UUID] = None

class EquipmentTemplateCreate(BaseModel):
    model_number: str
    manufacturer: str
    ru_height: int
    folder_id: Optional[uuid.UUID] = None
