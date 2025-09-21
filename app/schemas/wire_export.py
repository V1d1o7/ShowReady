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
