from pydantic import BaseModel, Field
from typing import List, Dict, Optional

# --- Show Information Models ---
# Defines the structure for the main information about a show.
class ShowInfo(BaseModel):
    show_name: Optional[str] = None
    logo_path: Optional[str] = None
    production_video: Optional[str] = None
    production_manager: Optional[str] = None
    pm_email: Optional[str] = None

# --- Loom Label Models ---
# Defines the structure for a single loom label.
class LoomLabel(BaseModel):
    loom_name: str
    color: Optional[str] = None
    source: Optional[str] = None
    destination: Optional[str] = None

# --- Case Label Models ---
# Defines the structure for a single case label.
class CaseLabel(BaseModel):
    send_to: str
    contents: Optional[str] = ""

# --- Main Show File Model ---
# This is the top-level model that represents the entire ".show" file.
# It contains the show's info and all associated label sheets.
class ShowFile(BaseModel):
    info: ShowInfo = Field(default_factory=ShowInfo)
    loom_sheets: Dict[str, List[LoomLabel]] = Field(default_factory=dict)
    case_sheets: Dict[str, List[CaseLabel]] = Field(default_factory=dict)
