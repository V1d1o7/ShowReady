from pydantic import BaseModel, Field
from typing import Optional, Dict, List

class PortDef(BaseModel):
    name: Optional[str] = None
    adapter_model: Optional[str] = None  # New field for adapter handling

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

import base64

class TitleBlock(BaseModel):
    show_name: Optional[str] = None
    show_pm: Optional[str] = None
    show_td: Optional[str] = None
    show_designer: Optional[str] = None
    users_full_name: Optional[str] = None
    users_production_role: Optional[str] = None
    sheet_title: Optional[str] = None
    show_logo_base64: Optional[str] = None
    company_logo_base64: Optional[str] = None
    show_branding: bool = True

class Graph(BaseModel):
    nodes: List[Node]
    edges: List[Edge]
    page_size: Optional[str] = "Letter"

class PdfExportPayload(BaseModel):
    graph: Graph
    title_block: TitleBlock