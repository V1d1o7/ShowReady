import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    useReactFlow,
    ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Download, Plus } from 'lucide-react';
import dagre from 'dagre';
import toast, { Toaster } from 'react-hot-toast';

import { api } from '../api/api';
import DeviceNode from '../components/DeviceNode';
import CustomEdge from '../components/CustomEdge';
import EditInstanceModal from '../components/EditInstanceModal';
import WireDiagramPdfModal from '../components/WireDiagramPdfModal';
import LibrarySidebar from '../components/LibrarySidebar';
import CustomDragLayer from '../components/CustomDragLayer';
import { useShow } from '../contexts/ShowContext';
import { useAuth } from '../contexts/AuthContext';

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

const flattenNodePorts = (instance, libraryMap) => {
    if (!instance || !instance.equipment_templates) return [];
    
    let allPorts = [...(instance.equipment_templates.ports || [])];
    const chassisTemplate = instance.equipment_templates;
    
    if (!instance.module_assignments || Object.keys(instance.module_assignments).length === 0) {
        return allPorts;
    }

    const processAssignments = (assignments, parentTemplate, prefixId = '', prefixName = '') => {
        if (!assignments || !parentTemplate) return;

        const slotDefs = parentTemplate.slot_definitions || parentTemplate.slots || [];
        const slotMap = {};
        slotDefs.forEach(s => { slotMap[s.id] = s.name; });

        Object.entries(assignments).forEach(([slotId, assignmentData]) => {
            if (!assignmentData) return;

            const moduleId = typeof assignmentData === 'object' ? assignmentData.id : assignmentData;
            const subAssignments = typeof assignmentData === 'object' ? assignmentData.assignments : null;

            if (!moduleId) return;

            const moduleTemplate = libraryMap.get(moduleId);
            if (!moduleTemplate) return;

            let slotName = slotMap[slotId];
            if (!slotName) {
                const foundSlot = slotDefs.find(s => s.name === slotId);
                slotName = foundSlot ? foundSlot.name : `Slot ${slotId.substring(0, 4)}`;
            }

            const currentPrefixName = prefixName ? `${prefixName} - ${slotName}` : slotName;
            const currentPrefixId = prefixId ? `${prefixId}_${slotId}` : slotId;

            let hash = 0;
            for (let i = 0; i < currentPrefixId.length; i++) {
                hash = (hash << 5) - hash + currentPrefixId.charCodeAt(i);
                hash |= 0;
            }
            const hexPrefix = Math.abs(hash).toString(16).padStart(8, '0');

            if (moduleTemplate.ports && Array.isArray(moduleTemplate.ports)) {
                const modulePorts = moduleTemplate.ports.map(p => {
                    const deterministicUUID = p.id && p.id.length >= 8 
                        ? `${hexPrefix}${p.id.substring(8)}`
                        : `${hexPrefix}-0000-0000-0000-000000000000`;

                    return {
                        ...p,
                        id: deterministicUUID, 
                        original_id: p.id,
                        label: `${currentPrefixName}: ${p.label}`, 
                        isModule: true
                    };
                });
                allPorts.push(...modulePorts);
            }

            if (subAssignments) {
                processAssignments(subAssignments, moduleTemplate, currentPrefixId, currentPrefixName);
            }
        });
    };

    processAssignments(instance.module_assignments, chassisTemplate);
    return allPorts;
};

// FIX: Traverse the slot layout perfectly from left to right, inserting 'isEmpty' elements to represent unpopulated physical holes.
const processPanelSlot = (slot, parentInstanceId, rootPanelLabel, allPanelInstances) => {
    const instance = allPanelInstances.find(pi => 
        (parentInstanceId ? pi.parent_instance_id === parentInstanceId : !pi.parent_instance_id) && 
        String(pi.slot_id) === String(slot.id)
    );

    if (!instance) {
        return [{
            id: `empty-${slot.id}`,
            pei_id: `empty-${slot.id}`,
            full_label: `EMPTY`,
            connector_type: 'Blank',
            isEmpty: true
        }];
    }

    const ports = [];
    const instanceLabel = instance.label || '';

    if (instance.template?.panel_slots && Array.isArray(instance.template.panel_slots) && instance.template.panel_slots.length > 0) {
        instance.template.panel_slots.forEach((childSlot, idx) => {
            const childSlotId = childSlot.id || childSlot.name || `${instance.id}-sub-${idx}`;
            const normalizedChildSlot = { ...childSlot, id: childSlotId };
            ports.push(...processPanelSlot(normalizedChildSlot, instance.id, rootPanelLabel, allPanelInstances));
        });
    } else if (instance.template?.ports && Array.isArray(instance.template.ports) && instance.template.ports.length > 0) {
        const isSingleGenericPort = instance.template.ports.length === 1 && String(instance.template.ports[0].label).trim() === '1';

        instance.template.ports.forEach(port => {
            const pLabel = isSingleGenericPort ? '' : port.label;
            const labelParts = [rootPanelLabel, instanceLabel, pLabel]
                .filter(val => val !== null && val !== undefined && val !== '' && String(val).trim() !== '');

            ports.push({
                ...port,
                pei_id: instance.id,
                full_label: labelParts.join(' ') || 'Unlabeled Port'
            });
        });
    } else {
        ports.push({
            id: `blank-${instance.id}`,
            pei_id: instance.id,
            full_label: instanceLabel || instance.template?.name || `Blank Plate`,
            connector_type: 'Blank',
            isEmpty: true
        });
    }

    return ports;
};

const createApiGraph = (nodes, edges, pageSize) => {
    const apiNodes = nodes.map(node => {
        const portsData = node.data?.equipment_templates?.ports || [];
        const isPatchPanel = node.data?.equipment_templates?.is_patch_panel;
        const portsDict = portsData.reduce((acc, port) => {
            if (port.isEmpty) return acc; // Skip empty slots entirely in the API Export

            if (isPatchPanel) {
                const backId = `pei_${port.pei_id}_port_${port.id}_back`;
                const frontId = `pei_${port.pei_id}_port_${port.id}_front`;
                const fLabel = port.full_label ? `${port.full_label} ` : '';
                acc[backId] = { name: `${fLabel}(Back)` };
                acc[frontId] = { name: `${fLabel}(Front)` };
            } else {
                if (port.type === 'input') {
                    acc[`port-in-${port.id}`] = { name: port.label };
                } else if (port.type === 'output') {
                    acc[`port-out-${port.id}`] = { name: port.label };
                } else if (port.type === 'io') {
                    acc[`port-in-${port.id}`] = { name: port.label };
                    acc[`port-out-${port.id}`] = { name: port.label };
                }
            }
            return acc;
        }, {});

        return {
            id: node.id,
            deviceNomenclature: node.data.instance_name || 'N/A',
            modelNumber: node.data.equipment_templates?.model_number || 'N/A',
            rackName: node.data.rack_name || 'Unracked',
            deviceRu: node.data.ru_position || 0,
            ipAddress: node.data.ip_address || '',
            ports: portsDict,
        };
    });

    const apiEdges = edges.map(edge => ({
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: edge.target,
        targetHandle: edge.targetHandle,
    }));

    return {
        nodes: apiNodes,
        edges: apiEdges,
        page_size: pageSize,
    };
};

const WireDiagramView = () => {
    const { showId, showData } = useShow();
    const showName = showData?.info?.show_name;
    const { profile } = useAuth();
    const reactFlowWrapper = useRef(null);
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const { getNodes, getEdges, screenToFlowPosition, getViewport, fitView } = useReactFlow();
    const [activeTab, setActiveTab] = useState(1);
    const [numTabs, setNumTabs] = useState(1);
    const [unassignedEquipment, setUnassignedEquipment] = useState([]);
    const [libraryData, setLibraryData] = useState({ folders: [], equipment: [] });
    const [justDroppedNode, setJustDroppedNode] = useState(null);
    const [draggingItem, setDraggingItem] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingNode, setEditingNode] = useState(null);

    const onDragStart = (event, equipment) => {
        const { zoom } = getViewport();
        const equipmentWithZoom = { ...equipment, zoom };
        event.dataTransfer.setData('application/reactflow', JSON.stringify(equipment));
        event.dataTransfer.effectAllowed = 'move';
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        event.dataTransfer.setDragImage(img, 0, 0);
        setDraggingItem(equipmentWithZoom);
    };

    const fetchData = useCallback(async () => {
        if (!showId) return;
        setIsLoading(true);
        setError(null);
        try {
            const [detailedRacks, connectionsData, libData, allPanelInstances] = await Promise.all([
                api.getDetailedRacksForShow(showId),
                api.getConnectionsForShow(showId),
                api.getLibrary(),
                api.getAllPanelInstancesForShow(showId)
            ]);

            setLibraryData(libData || { folders: [], equipment: [] });

            const templateMap = new Map();
            if (libData && libData.equipment) {
                libData.equipment.forEach(eq => templateMap.set(eq.id, eq));
            }

            const allEquipment = detailedRacks.flatMap(rack => 
                rack.equipment.map(eq => ({ ...eq, rack_name: rack.rack_name }))
            );

            const connections = connectionsData.connections || [];
            const maxPage = allEquipment.reduce((max, eq) => Math.max(max, eq.page_number || 1), 1);
            setNumTabs(prev => Math.max(prev, maxPage));

            const placedEquipment = allEquipment.filter(eq => eq.page_number);

            const initialNodes = placedEquipment.map((item) => {
                let enrichedItem = { ...item };

                if (item.equipment_templates?.is_patch_panel) {
                    const panelInstances = allPanelInstances.filter(pi => pi.panel_instance_id === item.id);
                    const rootPanelLabel = item.instance_name || '';
                    const panelPorts = [];
                    
                    if (item.equipment_templates.panel_slots && Array.isArray(item.equipment_templates.panel_slots)) {
                        item.equipment_templates.panel_slots.forEach((slot, idx) => {
                            const slotId = slot.id || `${item.id}-slot-${idx}`;
                            const normalizedSlot = { ...slot, id: slotId };
                            panelPorts.push(...processPanelSlot(normalizedSlot, null, rootPanelLabel, panelInstances));
                        });
                    }

                    // Failsafe for highly corrupted/orphaned items in the DB
                    const validSlotIds = new Set(item.equipment_templates.panel_slots?.map((s, idx) => String(s.id || `${item.id}-slot-${idx}`)) || []);
                    const topLevelPanelInstances = panelInstances.filter(pi => !pi.parent_instance_id);
                    topLevelPanelInstances.filter(tpi => !tpi.slot_id || !validSlotIds.has(String(tpi.slot_id))).forEach(tpi => {
                        panelPorts.push({
                            id: `orphan-${tpi.id}`, pei_id: tpi.id, full_label: `[Orphan] ${tpi.template?.name || ''}`, connector_type: 'Error', isEmpty: true
                        });
                    });

                    enrichedItem.equipment_templates = {
                        ...item.equipment_templates,
                        ports: panelPorts,
                        is_patch_panel: true
                    };
                } else {
                    const flattenedPorts = flattenNodePorts(item, templateMap);
                    enrichedItem.equipment_templates = {
                        ...item.equipment_templates,
                        ports: flattenedPorts
                    };
                }

                return {
                    id: item.id.toString(),
                    type: 'device',
                    position: { x: item.x_pos || 0, y: item.y_pos || 0 },
                    data: { ...enrichedItem, label: item.instance_name },
                };
            });
            
            setNodes(initialNodes);

            const nodePageMap = new Map(placedEquipment.map(eq => [eq.id.toString(), eq.page_number]));

            const initialEdges = connections.map(conn => {
                const sourcePage = nodePageMap.get(conn.source_device_id.toString());
                const targetPage = nodePageMap.get(conn.destination_device_id.toString());
                const isCrossPage = sourcePage !== targetPage;

                return {
                    id: `e-${conn.source_device_id}-${conn.source_port_id}-${conn.destination_device_id}-${conn.destination_port_id}`,
                    type: 'custom',
                    source: conn.source_device_id.toString(),
                    target: conn.destination_device_id.toString(),
                    sourceHandle: conn.source_port_id.startsWith('pei_') ? conn.source_port_id : `port-out-${conn.source_port_id}`,
                    targetHandle: conn.destination_port_id.startsWith('pei_') ? conn.destination_port_id : `port-in-${conn.destination_port_id}`,
                    animated: true,
                    style: { strokeWidth: 2, stroke: isCrossPage ? '#888' : '#f59e0b' },
                    data: { 
                        db_id: conn.id,
                        label: conn.cable_type || '',
                        isCrossPage,
                        sourcePage,
                        targetPage,
                    },
                    markerEnd: { type: 'arrowclosed', color: '#f59e0b' },
                };
            });
            setEdges(initialEdges);

        } catch (err) {
            console.error("Failed to fetch wire diagram data:", err);
            setError("Failed to load wire diagram data. Please try again.");
        } finally {
            setIsLoading(false);
        }

        setTimeout(() => {
            if (fitView) fitView({ padding: 0.1 });
        }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showId, setNodes, setEdges]); 

    const fetchUnassignedEquipment = useCallback(async () => {
        if (!showId) return;
        try {
            const data = await api.getUnassignedEquipment(showId);
            setUnassignedEquipment(data);
        } catch (err) {
            console.error("Failed to fetch unassigned equipment:", err);
        }
    }, [showId]);

    useEffect(() => {
        if (showId) {
            fetchData();
            fetchUnassignedEquipment();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showId]);

    useEffect(() => {
        setNodes(nds =>
            nds.map(n => ({
                ...n,
                hidden: n.data.page_number !== activeTab,
            }))
        );
        setEdges(eds =>
            eds.map(e => ({
                ...e,
                hidden: e.data.sourcePage !== activeTab,
            }))
        );
    }, [activeTab, setNodes, setEdges]);

    useEffect(() => {
        if (!justDroppedNode) return;

        const finalizeDroppedNode = async () => {
            try {
                let enrichedNode = { ...justDroppedNode };

                if (justDroppedNode.data.equipment_templates?.is_patch_panel) {
                    const allPanelInstances = await api.getAllPanelInstancesForShow(showId);
                    const relevantInstances = allPanelInstances.filter(pi => pi.panel_instance_id === justDroppedNode.id);
                    const rootPanelLabel = justDroppedNode.data.instance_name || '';
                    
                    const panelPorts = [];
                    if (justDroppedNode.data.equipment_templates.panel_slots && Array.isArray(justDroppedNode.data.equipment_templates.panel_slots)) {
                        justDroppedNode.data.equipment_templates.panel_slots.forEach((slot, idx) => {
                            const slotId = slot.id || `${justDroppedNode.id}-slot-${idx}`;
                            const normalizedSlot = { ...slot, id: slotId };
                            panelPorts.push(...processPanelSlot(normalizedSlot, null, rootPanelLabel, relevantInstances));
                        });
                    }

                    enrichedNode.data.equipment_templates.ports = panelPorts;
                    setNodes(nds => nds.map(n => n.id === enrichedNode.id ? enrichedNode : n));
                }

                const connections = await api.getConnectionsForDevice(justDroppedNode.id);

                if (connections && connections.length > 0) {
                    const allNodes = getNodes();
                    const nodePageMap = new Map(allNodes.map(n => [n.id, n.data.page_number]));
                    nodePageMap.set(justDroppedNode.id, justDroppedNode.data.page_number);
                    
                    const newEdges = connections.map(conn => {
                        const sourcePage = nodePageMap.get(conn.source_device_id.toString());
                        const targetPage = nodePageMap.get(conn.destination_device_id.toString());
                        
                        if (sourcePage === undefined || targetPage === undefined) {
                            return null;
                        }

                        const isCrossPage = sourcePage !== targetPage;

                        return {
                            id: `e-${conn.source_device_id}-${conn.source_port_id}-${conn.destination_device_id}-${conn.destination_port_id}`,
                            type: 'custom',
                            source: conn.source_device_id.toString(),
                            target: conn.destination_device_id.toString(),
                            sourceHandle: conn.source_port_id.startsWith('pei_') ? conn.source_port_id : `port-out-${conn.source_port_id}`,
                            targetHandle: conn.destination_port_id.startsWith('pei_') ? conn.destination_port_id : `port-in-${conn.destination_port_id}`,
                            animated: true,
                            style: { strokeWidth: 2, stroke: isCrossPage ? '#888' : '#f59e0b' },
                            data: {
                                db_id: conn.id,
                                label: conn.cable_type || '',
                                isCrossPage,
                                sourcePage,
                                targetPage,
                            },
                            markerEnd: { type: 'arrowclosed', color: '#f59e0b' },
                            hidden: sourcePage !== activeTab,
                        };
                    }).filter(Boolean); 

                    setEdges(eds => {
                        const existingEdgeIds = new Set(eds.map(e => e.id));
                        const uniqueNewEdges = newEdges.filter(ne => !existingEdgeIds.has(ne.id));
                        return eds.concat(uniqueNewEdges);
                    });
                }
            } catch (err) {
                console.error("Failed to finalize dropped node:", err);
            } finally {
                setJustDroppedNode(null); 
            }
        };

        finalizeDroppedNode();
    }, [justDroppedNode, getNodes, setEdges, setNodes, activeTab, showId]);

    const onConnect = useCallback(async (params) => {
        const { source, sourceHandle, target, targetHandle } = params;
        
        if (!sourceHandle || !targetHandle) {
            console.warn("⚠️ Missing handle IDs. Cannot connect.");
            return;
        }

        const getPortIdFromHandle = (handleId) => {
            if (handleId.startsWith('pei_')) {
                return handleId;
            }
            return handleId.split('-').slice(2).join('-');
        };

        const sourcePortId = getPortIdFromHandle(sourceHandle);
        const targetPortId = getPortIdFromHandle(targetHandle);

        const allNodes = getNodes();
        const sourceNode = allNodes.find(n => n.id === source);
        const targetNode = allNodes.find(n => n.id === target);

        const findPort = (node, portId) => {
            const ports = node?.data?.equipment_templates?.ports;
            if (!ports || !Array.isArray(ports)) return null;

            if (portId.startsWith('pei_')) {
                const parts = portId.split('_port_');
                if (parts.length < 2) return null;
                const innerPortIdWithSide = parts[1];
                const lastUnderscoreIndex = innerPortIdWithSide.lastIndexOf('_');
                const innerPortId = innerPortIdWithSide.substring(0, lastUnderscoreIndex);
                
                return ports.find(p => String(p.id) === String(innerPortId));
            }
            return ports.find(p => String(p.id) === String(portId));
        };

        const sourcePort = findPort(sourceNode, sourcePortId);
        const targetPort = findPort(targetNode, targetPortId);

        if (!sourcePort || !targetPort) {
            const missing = !sourcePort ? 'Source' : 'Target';
            toast.error(`Error: Could not locate ${missing} port data. Check console.`);
            return;
        }

        if (sourcePort.connector_type !== targetPort.connector_type) {
            toast.error(`Cannot connect ${sourcePort.connector_type || 'Unknown'} to ${targetPort.connector_type || 'Unknown'}.`);
            return;
        }

        const newConnectionData = {
            source_device_id: source,
            source_port_id: sourcePortId,
            destination_device_id: target,
            destination_port_id: targetPortId,
            cable_type: sourcePort.connector_type || 'Unknown',
        };

        try {
            const newConnection = await api.createConnection(newConnectionData);

            const sourcePage = sourceNode?.data?.page_number;
            const targetPage = targetNode?.data?.page_number;
            const isCrossPage = sourcePage !== targetPage;

            const newEdge = {
                id: `e-${newConnection.source_device_id}-${newConnection.source_port_id}-${newConnection.destination_device_id}-${newConnection.destination_port_id}`,
                type: 'custom',
                source: newConnection.source_device_id.toString(),
                target: newConnection.destination_device_id.toString(),
                sourceHandle: sourceHandle,
                targetHandle: targetHandle,
                animated: true,
                style: { strokeWidth: 2, stroke: isCrossPage ? '#888' : '#f59e0b' },
                data: { 
                    db_id: newConnection.id,
                    label: newConnection.cable_type || '',
                    isCrossPage,
                    sourcePage,
                    targetPage,
                },
                markerEnd: { type: 'arrowclosed', color: '#f59e0b' },
            };
            
            setEdges((eds) => eds.concat(newEdge));
        } catch (err) {
            toast.error(`Error creating connection: ${err.message}`);
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

    const handleNodeDoubleClick = useCallback((event, node) => {
        setEditingNode(node);
        setIsEditModalOpen(true);
    }, []);

    const handleCloseEditModal = () => {
        setIsEditModalOpen(false);
        setEditingNode(null);
    };

    const handleUpdateNode = async (updatedData) => {
        if (!editingNode) return;
        
        try {
            const updatedInstance = await api.updateEquipmentInstance(editingNode.id, updatedData);
            
            const templateMap = new Map();
            if (libraryData && libraryData.equipment) {
                libraryData.equipment.forEach(eq => templateMap.set(eq.id, eq));
            }

            const flattenedPorts = flattenNodePorts(updatedInstance, templateMap);
            
            const enrichedItem = {
                ...updatedInstance,
                equipment_templates: {
                    ...updatedInstance.equipment_templates,
                    ports: flattenedPorts
                }
            };

            setNodes((nds) =>
                nds.map((n) => {
                    if (n.id === editingNode.id) {
                        const newLabel = enrichedItem.instance_name || n.data.label;
                        return {
                            ...n,
                            data: {
                                ...enrichedItem,
                                label: newLabel,
                            },
                        };
                    }
                    return n;
                })
            );
            handleCloseEditModal();
        } catch (err) {
            toast.error(`Error: ${err.message}`);
        }
    };

    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(async (event) => {
        setDraggingItem(null);
        event.preventDefault();

        const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
        const equipmentData = JSON.parse(event.dataTransfer.getData('application/reactflow'));

        if (typeof equipmentData === 'undefined' || !equipmentData) return;

        const position = screenToFlowPosition({
            x: event.clientX - reactFlowBounds.left,
            y: event.clientY - reactFlowBounds.top,
        });

        if (equipmentData.isTemplate) {
            try {
                const newInstanceData = {
                    show_id: showId,
                    equipment_template_id: equipmentData.id,
                    instance_name: equipmentData.model_number,
                    x_pos: Math.round(position.x),
                    y_pos: Math.round(position.y),
                    page_number: activeTab,
                };
                const newInstance = await api.createEquipmentInstance(newInstanceData);
                
                const newNode = {
                    id: newInstance.id.toString(),
                    type: 'device',
                    position,
                    data: { ...newInstance, label: newInstance.instance_name, page_number: activeTab },
                    hidden: false,
                };
                
                setNodes((nds) => nds.concat(newNode));
                setJustDroppedNode(newNode);
            } catch (err) {
                toast.error("Failed to create and place new equipment.");
            }
        } else {
            const newNode = {
                id: equipmentData.id.toString(),
                type: 'device',
                position,
                data: { ...equipmentData, label: equipmentData.instance_name, page_number: activeTab },
                hidden: false,
            };

            setNodes((nds) => nds.concat(newNode));
            setUnassignedEquipment(current => current.filter(eq => eq.id !== equipmentData.id));
            setJustDroppedNode(newNode);

            api.updateEquipmentInstance(equipmentData.id, {
                x_pos: Math.round(position.x),
                y_pos: Math.round(position.y),
                page_number: activeTab,
            }).catch(err => {
                setNodes((nds) => nds.filter(n => n.id !== newNode.id));
                setUnassignedEquipment(current => [...current, equipmentData]);
                toast.error("Failed to save equipment position. It has been returned to the library.");
            });
        }
    }, [activeTab, screenToFlowPosition, showId, setNodes, setUnassignedEquipment, setJustDroppedNode, setDraggingItem]);

    const onEdgesChangeCustom = useCallback((changes) => {
        for (const change of changes) {
            if (change.type === 'remove') {
                const edgeToRemove = getEdges().find(edge => edge.id === change.id);
                if (edgeToRemove && edgeToRemove.data.db_id) {
                    api.deleteConnection(edgeToRemove.data.db_id).catch(err => {
                        console.error("Failed to delete connection:", err);
                    });
                }
            }
        }
        onEdgesChange(changes);
    }, [onEdgesChange, getEdges]);

    const onNodesChangeCustom = useCallback((changes) => {
        const currentEdges = getEdges();
        const currentNodes = getNodes();

        for (const change of changes) {
            if (change.type === 'remove') {
                const nodeId = change.id;
                const connectedEdges = currentEdges.filter(e => e.source === nodeId || e.target === nodeId);
                if (connectedEdges.length > 0) {
                    const deletionPromises = connectedEdges.map(edge => api.deleteConnection(edge.data.db_id));
                    Promise.all(deletionPromises).catch(err => {
                        console.error("Failed to delete one or more connections for node:", nodeId, err);
                    });
                }
                api.updateEquipmentInstance(nodeId, {
                    page_number: null,
                    x_pos: null,
                    y_pos: null
                }).catch(err => {
                    console.error("Failed to unassign equipment:", nodeId, err);
                });
                const nodeToRemove = currentNodes.find(n => n.id === nodeId);
                if (nodeToRemove) {
                    setUnassignedEquipment(current => [...current, nodeToRemove.data]);
                }
            }
        }
        onNodesChange(changes);
    }, [onNodesChange, getEdges, getNodes, setUnassignedEquipment]);

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
        try {
            const nodes = getNodes();
            const edges = getEdges();
            const apiGraph = createApiGraph(nodes, edges, pageSize);

            const titleBlockData = {
                show_name: showName,
                show_pm: showData.info.show_pm_name,
                show_td: showData.info.show_td_name,
                show_designer: showData.info.show_designer_name,
                users_full_name: profile ? `${profile.first_name} ${profile.last_name}` : '',
                users_production_role: profile ? profile.production_role : '',
                sheet_title: 'Wire Diagram',
            };

            const blob = await api.exportWirePdf(apiGraph, showId, titleBlockData);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${showName}-simplified-wire-export.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            toast.success("PDF exported successfully!");
        } catch (err) {
            toast.error("Failed to generate simplified PDF. See console for details.");
        } finally {
            setIsPdfModalOpen(false);
        }
    };

    if (isLoading) return <div className="flex items-center justify-center h-full"><div className="text-xl text-gray-400">Loading...</div></div>;
    if (error) return <div className="p-8 text-center text-red-400">Error: {error}</div>;

    return (
        <div className="h-full w-full flex flex-row rounded-xl bg-gray-800/50" data-testid="wire-diagram-view">
            <Toaster position="bottom-center" />
            <CustomDragLayer draggingItem={draggingItem} />
            <LibrarySidebar
                unassignedEquipment={unassignedEquipment}
                library={libraryData}
                onDragStart={onDragStart}
                setDraggingItem={setDraggingItem}
            />
            <div className="flex-grow flex flex-col">
                <div className="flex-shrink-0 flex items-center justify-between p-2 border-b border-gray-700">
                    <div className="flex items-center gap-1">
                        {Array.from({ length: numTabs }, (_, i) => i + 1).map(page => (
                            <button
                                key={page}
                                onClick={() => setActiveTab(page)}
                                className={`px-4 py-2 text-sm rounded-md font-semibold transition-colors ${
                                    activeTab === page
                                        ? 'bg-amber-500 text-black'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                            >
                                Page {page}
                            </button>
                        ))}
                        <button
                            onClick={() => setNumTabs(n => n + 1)}
                            className="p-2 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded-md"
                            title="Add new page"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onLayout} className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-600 hover:bg-gray-500 rounded-lg font-bold text-white shadow-lg">
                            Auto-Arrange
                        </button>
                        <button onClick={() => setIsPdfModalOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black shadow-lg">
                            <Download size={16} />
                            Export PDF
                        </button>
                    </div>
                </div>
                <WireDiagramPdfModal isOpen={isPdfModalOpen} onClose={() => setIsPdfModalOpen(false)} onGenerate={handleGeneratePdf} />
                <EditInstanceModal
                    isOpen={isEditModalOpen}
                    onClose={handleCloseEditModal}
                    onSubmit={handleUpdateNode}
                    item={editingNode?.data}
                />
                <div className="flex-grow relative" ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChangeCustom}
                        onEdgesChange={onEdgesChangeCustom}
                        onConnect={onConnect}
                        isValidConnection={() => true}
                        onNodeDragStop={onNodeDragStop}
                        onNodeDoubleClick={handleNodeDoubleClick}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        deleteKeyCode={['Backspace', 'Delete']}
                        className="bg-gray-900"
                        proOptions={{ hideAttribution: true }}
                    >
                        <Controls />
                        <Background variant="dots" gap={12} size={1} />
                    </ReactFlow>
                </div>
            </div>
        </div>
    );
};

const WireDiagramViewWithProvider = (props) => (
    <ReactFlowProvider>
        <WireDiagramView {...props} />
    </ReactFlowProvider>
);

export default WireDiagramViewWithProvider;