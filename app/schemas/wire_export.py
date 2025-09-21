from pydantic import BaseModel, Field
from typing import Optional, Dict, List

class PortDef(BaseModel):
    name: Optional[str] = None

class Node(BaseModel):
    id: str
    deviceNomenclature: str
    modelNumber: str
    rackName: str
    deviceRu: int
    ipAddress: Optional[str] = None
    ports: Dict[str, PortDef]

class Edge(BaseModel):
    source: str
    sourceHandle: Optional[str] = None
    target: str
    targetHandle: Optional[str] = None

class Graph(BaseModel):
    nodes: List[Node]
    edges: List[Edge]
    page_size: Optional[str] = "Letter"
    layout_type: Optional[str] = 'simplified' # To distinguish from the other payload
    # Add title block fields
    show_name: str
    sheet_title: Optional[str] = None
    show_pm_name: Optional[str] = None
    show_td_name: Optional[str] = None
    show_designer_name: Optional[str] = None
    date_file_generated: Optional[str] = None
    users_full_name: Optional[str] = None
    users_production_role: Optional[str] = None
    company_logo_path: Optional[str] = None
    show_logo_path: Optional[str] = None
