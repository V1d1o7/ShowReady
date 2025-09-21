import pytest
from app.schemas.wire_export import Graph, Node, Edge, PortDef
from app.services.wire_export_svg import build_pdf_bytes

def test_build_pdf_bytes_smoke_test():
    """
    A simple smoke test to ensure the PDF generation runs without errors
    and produces a valid, non-empty PDF file for a minimal graph.
    """
    # 1. Arrange: Create a minimal graph object
    sample_graph = Graph(
        nodes=[
            Node(
                id="n1",
                deviceNomenclature="ATEM 1 M/E",
                modelNumber="SWATEMMINI",
                rackName="R1",
                deviceRu=12,
                ipAddress="10.0.0.10",
                ports={
                    "out-1": PortDef(name="PGM")
                }
            ),
            Node(
                id="n2",
                deviceNomenclature="Hyperdeck",
                modelNumber="HYPERD",
                rackName="R1",
                deviceRu=13,
                ipAddress="10.0.0.11",
                ports={
                    "in-1": PortDef(name="SDI In")
                }
            )
        ],
        edges=[
            Edge(
                source="n1",
                sourceHandle="out-1",
                target="n2",
                targetHandle="in-1"
            )
        ]
    )

    # 2. Act: Generate the PDF
    pdf_bytes = build_pdf_bytes(sample_graph)

    # 3. Assert: Check the output
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 0
    assert pdf_bytes.startswith(b'%PDF-'), "The output should be a valid PDF file."

def test_build_pdf_with_no_edges():
    """
    Tests that generating a PDF for a graph with nodes but no edges
    still succeeds.
    """
    sample_graph = Graph(
        nodes=[
            Node(
                id="n1",
                deviceNomenclature="Orphan Device",
                modelNumber="ORPH-1",
                rackName="R1",
                deviceRu=1,
                ipAddress="10.0.0.12",
                ports={}
            )
        ],
        edges=[]
    )
    pdf_bytes = build_pdf_bytes(sample_graph)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 0
    assert pdf_bytes.startswith(b'%PDF-')

def test_build_pdf_with_empty_graph():
    """
    Tests that an empty graph results in an empty byte string without errors.
    """
    empty_graph = Graph(nodes=[], edges=[])
    pdf_bytes = build_pdf_bytes(empty_graph)
    assert pdf_bytes == b""
