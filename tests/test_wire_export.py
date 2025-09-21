import pytest
import re
from app.schemas.wire_export import Graph, Node, Edge, PortDef, TitleBlock
from app.services.wire_export_svg import build_pdf_bytes

def test_port_alignment():
    """
    Tests that input, output, and IO ports are aligned correctly.
    """
    # 1. Arrange
    nodes = [
        Node(
            id="n1",
            deviceNomenclature="Test Device",
            modelNumber="TEST-1",
            rackName="R1",
            deviceRu=1,
            ports={
                "in-1": PortDef(name="Input A"),
                    "out-2": PortDef(name="Output A"),
                "in-io-1": PortDef(name="IO Port A"),
                "out-io-1": PortDef(name="IO Port A"),
            }
        )
    ]
    graph = Graph(nodes=nodes, edges=[])
    title_block_data = TitleBlock()

    # 2. Act
    svg = build_pdf_bytes(graph, title_block_data=title_block_data, return_svg=True)[0]
    print(svg)

    # 3. Assert

    # Test Input Port (left-aligned)
    assert re.search(r'<text class="t-port-aligned".*?>Input A</text>', svg)

    # Test Output Port (right-aligned)
    assert re.search(r'<text class="t-port-aligned".*?text-anchor="end">Output A</text>', svg)

    # Test IO Port (center-aligned)
    assert re.search(r'<text class="t-port".*?>IO Port A</text>', svg)

    # Check for the line on the IO port
    assert len(re.findall(r'<line class="port-line"', svg)) == 2

    # Check that input and output ports do not have the line
    # This is implicitly tested by the count above. If they had lines, the count would be higher.
