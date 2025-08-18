import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Download } from 'lucide-react';
import dagre from 'dagre';

import { api } from '../api/api';
import DeviceNode from '../components/DeviceNode';
import CustomEdge from '../components/CustomEdge';
import WireDiagramPdfModal from '../components/WireDiagramPdfModal';
import { ReactFlowProvider } from 'reactflow';
import { useShow } from '../contexts/ShowContext';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction, marginx: 20, marginy: 20 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: node.width || 384, height: node.height || 150 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? 'left' : 'top';
    node.sourcePosition = isHorizontal ? 'right' : 'bottom';
    node.position = {
      x: nodeWithPosition.x - (node.width || 384) / 2,
      y: nodeWithPosition.y - (node.height || 150) / 2,
    };
  });

  return { nodes, edges };
};

const nodeTypes = {
    device: DeviceNode,
};

const edgeTypes = {
    custom: CustomEdge,
};

const WireDiagramView = () => {
    const { showName } = useShow();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const { getNodes, getEdges } = useReactFlow();

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const racksData = await api.getRacksForShow(showName);
            let allEquipment = [];
            for (const rack of racksData) {
                const detailedRack = await api.getRackDetails(rack.id);
                const equipmentInRack = detailedRack.equipment.map(eq => ({ ...eq, rack_name: detailedRack.rack_name }));
                allEquipment = [...allEquipment, ...equipmentInRack];
            }

            const connectionsData = await api.getConnectionsForShow(showName);
            const connections = connectionsData.connections || [];

            const initialNodes = allEquipment.map((item, index) => ({
                id: item.id.toString(),
                type: 'device',
                position: { x: item.x_pos || 0, y: item.y_pos || 0 },
                data: { ...item, label: item.instance_name },
            }));
            
            setNodes(initialNodes);

            const initialEdges = connections.map(conn => ({
                id: `e-${conn.source_device_id}-${conn.source_port_id}-${conn.destination_device_id}-${conn.destination_port_id}`,
                type: 'custom',
                source: conn.source_device_id.toString(),
                target: conn.destination_device_id.toString(),
                sourceHandle: `port-out-${conn.source_port_id}`,
                targetHandle: `port-in-${conn.destination_port_id}`,
                animated: true,
                style: { strokeWidth: 2, stroke: '#f59e0b' },
                data: { label: conn.cable_type || '' },
                markerEnd: { type: 'arrowclosed', color: '#f59e0b' },
            }));
            setEdges(initialEdges);

        } catch (err) {
            console.error("Failed to fetch wire diagram data:", err);
            setError("Failed to load wire diagram data. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, [showName, setNodes, setEdges]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const onConnect = useCallback(async (params) => {
        const { source, sourceHandle, target, targetHandle } = params;
        const sourcePortId = sourceHandle.split('-').slice(2).join('-');
        const targetPortId = targetHandle.split('-').slice(2).join('-');

        if (sourceHandle.includes('in') || targetHandle.includes('out')) return;

        const allNodes = getNodes();
        const sourceNode = allNodes.find(n => n.id === source);
        const targetNode = allNodes.find(n => n.id === target);
        const sourcePort = sourceNode?.data.equipment_templates.ports.find(p => p.id === sourcePortId);
        const targetPort = targetNode?.data.equipment_templates.ports.find(p => p.id === targetPortId);

        if (sourcePort?.connector_type !== targetPort?.connector_type) {
            alert(`Cannot connect ${sourcePort?.connector_type} to ${targetPort?.connector_type}.`);
            return;
        }

        const newConnectionData = {
            source_device_id: source,
            source_port_id: sourcePortId,
            destination_device_id: target,
            destination_port_id: targetPortId,
            cable_type: sourcePort?.connector_type || 'Unknown',
        };

        try {
            const newConnection = await api.createConnection(newConnectionData);
            const newEdge = {
                id: `e-${newConnection.source_device_id}-${newConnection.source_port_id}-${newConnection.destination_device_id}-${newConnection.destination_port_id}`,
                type: 'custom',
                source: newConnection.source_device_id.toString(),
                target: newConnection.destination_device_id.toString(),
                sourceHandle: `port-out-${newConnection.source_port_id}`,
                targetHandle: `port-in-${newConnection.destination_port_id}`,
                animated: true,
                style: { strokeWidth: 2, stroke: '#f59e0b' },
                data: { label: newConnection.cable_type || '' },
                markerEnd: { type: 'arrowclosed', color: '#f59e0b' },
            };
            setEdges((eds) => eds.concat(newEdge));
        } catch (err) {
            console.error("Failed to create connection:", err);
            alert(`Error creating connection: ${err.message}`);
        }
    }, [getNodes, setEdges]);

    const onNodeDragStop = useCallback(async (event, node) => {
        try {
            await api.updateEquipmentInstance(node.id, {
                x_pos: Math.round(node.position.x),
                y_pos: Math.round(node.position.y),
            });
        } catch (err) {
            console.error("Failed to save node position:", err);
        }
    }, []);

    const onLayout = useCallback(() => {
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(getNodes(), getEdges());
        setNodes([...layoutedNodes]);
        setEdges([...layoutedEdges]);
        layoutedNodes.forEach(node => {
            api.updateEquipmentInstance(node.id, {
                x_pos: Math.round(node.position.x),
                y_pos: Math.round(node.position.y),
            });
        });
    }, [getNodes, getEdges, setNodes, setEdges]);

    const handleGeneratePdf = async ({ pageSize }) => {
        const nodes = getNodes();
        const edges = getEdges();

        const payload = {
            nodes: nodes.map(n => ({
                id: n.id,
                position: n.position,
                width: n.width,
                height: n.height,
                data: {
                    label: n.data.label,
                    ip_address: n.data.ip_address,
                    rack_name: n.data.rack_name,
                    ru_position: n.data.ru_position,
                    equipment_templates: n.data.equipment_templates,
                }
            })),
            edges: edges.map(e => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle,
                targetHandle: e.targetHandle,
                label: e.label,
            })),
            page_size: pageSize,
            show_name: showName,
        };

        try {
            const pdfBlob = await api.generateWireDiagramPdf(payload);
            const url = window.URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${showName}-wire-diagram.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (err) {
            console.error("Failed to generate PDF:", err);
            alert("Failed to generate PDF. See console for details.");
        } finally {
            setIsPdfModalOpen(false);
        }
    };

    if (isLoading) return <div className="flex items-center justify-center h-full"><div className="text-xl text-gray-400">Loading...</div></div>;
    if (error) return <div className="p-8 text-center text-red-400">Error: {error}</div>;

    return (
        <div className="h-[calc(100vh-220px)] w-full rounded-xl bg-gray-800/50 relative" data-testid="wire-diagram-view">
            <div className="absolute top-4 right-4 z-10 flex gap-2">
                <button onClick={onLayout} className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-600 hover:bg-gray-500 rounded-lg font-bold text-white shadow-lg">
                    Auto-Arrange
                </button>
                <button onClick={() => setIsPdfModalOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black shadow-lg">
                    <Download size={16} />
                    Generate PDF
                </button>
            </div>
            <WireDiagramPdfModal isOpen={isPdfModalOpen} onClose={() => setIsPdfModalOpen(false)} onGenerate={handleGeneratePdf} />
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeDragStop={onNodeDragStop}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                className="bg-gray-900"
                proOptions={{ hideAttribution: true }}
            >
                <Controls />
                <Background variant="dots" gap={12} size={1} />
            </ReactFlow>
        </div>
    );
};

const WireDiagramViewWithProvider = (props) => (
    <ReactFlowProvider>
        <WireDiagramView {...props} />
    </ReactFlowProvider>
);

export default WireDiagramViewWithProvider;