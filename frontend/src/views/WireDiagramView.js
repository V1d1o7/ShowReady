import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../api/api';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Edit, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';

// Connection editing modal
const ConnectionEditModal = ({ isOpen, onClose, connection, onSave, onDelete }) => {
    const [label, setLabel] = useState('');
    const [cableType, setCableType] = useState('');
    const [length, setLength] = useState('');

    useEffect(() => {
        if (connection) {
            setLabel(connection.label || '');
            setCableType(connection.cable_type || '');
            setLength(connection.length_ft || '');
        }
    }, [connection]);

    const handleSave = () => {
        onSave({ label, cable_type: cableType, length_ft: parseInt(length, 10) || null });
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Edit Connection" maxWidth="max-w-md">
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300">Label</label>
                    <input
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Cable Type</label>
                    <input
                        type="text"
                        value={cableType}
                        onChange={(e) => setCableType(e.target.value)}
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Length (ft)</label>
                    <input
                        type="number"
                        value={length}
                        onChange={(e) => setLength(e.target.value)}
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md"
                    />
                </div>
            </div>
            <div className="flex justify-between items-center mt-6">
                <button
                    onClick={onDelete}
                    className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 rounded-lg font-bold"
                >
                    <Trash2 size={16} /> Delete
                </button>
                <div className="flex gap-4">
                    <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">
                        Save Changes
                    </button>
                </div>
            </div>
        </Modal>
    );
};

// New modal for editing device properties
const EditDeviceModal = ({ isOpen, onClose, device, onSave }) => {
    const [ipAddress, setIpAddress] = useState('');

    useEffect(() => {
        if (device) {
            setIpAddress(device.ip_address || '');
        }
    }, [device]);

    const handleSave = () => {
        onSave(device.id, { ip_address: ipAddress });
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${device?.instance_name}`} maxWidth="max-w-md">
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300">IP Address</label>
                    <input
                        type="text"
                        value={ipAddress}
                        onChange={(e) => setIpAddress(e.target.value)}
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md"
                    />
                </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
                <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">
                    Cancel
                </button>
                <button onClick={handleSave} className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">
                    Save Changes
                </button>
            </div>
        </Modal>
    );
};


const Port = ({ port, type, onMouseDown, onMouseUp, positionIndex }) => {
    const isInput = type === 'input';
    const portColor = { 'HDMI': 'bg-blue-500', 'SDI': 'bg-green-500', 'XLR': 'bg-red-500', 'CAT6': 'bg-yellow-500', 'RJ45': 'bg-yellow-500' }[port.connector_type] || 'bg-gray-500';

    const portStyle = {
        top: `${(positionIndex + 0.5) * 25}px`,
    };

    return (
        <div
            className={`absolute w-3 h-3 rounded-full border border-white cursor-pointer z-10 ${isInput ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2'} ${portColor}`}
            data-port-id={port.id}
            data-port-label={port.label}
            data-connector-type={port.connector_type}
            data-port-type={port.type}
            onMouseDown={isInput ? null : onMouseDown}
            onMouseUp={isInput ? onMouseUp : null}
            title={`${port.label} (${port.connector_type})`}
            style={portStyle}
        />
    );
};


const DeviceNode = ({ device, onPortMouseDown, onPortMouseUp, position, setPosition, onNodeClick }) => {
    const nodeRef = useRef(null);

    const handleMouseDown = (e) => {
        if (!nodeRef.current) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = nodeRef.current.offsetLeft;
        const startTop = nodeRef.current.offsetTop;

        const handleMouseMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            setPosition(device.id, startLeft + dx, startTop + dy);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            // Save the new position to the database
            const newPos = {
                x_pos: nodeRef.current.offsetLeft,
                y_pos: nodeRef.current.offsetTop,
            };
            api.updateEquipmentInstance(device.id, newPos).catch(error => {
                console.error("Failed to save node position:", error);
            });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const ports = useMemo(() => {
        // Sort ports by label to ensure a consistent order
        return device.equipment_templates.ports.sort((a, b) => a.label.localeCompare(b.label));
    }, [device.equipment_templates.ports]);
    
    const inputs = ports.filter(p => p.type === 'input');
    const outputs = ports.filter(p => p.type === 'output');

    return (
        <div
            ref={nodeRef}
            className="absolute bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-4 w-64 cursor-grab active:cursor-grabbing"
            style={{ left: position.x, top: position.y }}
            onMouseDown={handleMouseDown}
            onDoubleClick={() => onNodeClick(device)}
            data-device-id={device.id}
        >
            <h3 className="font-bold text-lg text-white mb-1">{device.instance_name}</h3>
            <p className="text-sm text-gray-400">{device.equipment_templates.model_number}</p>
            {device.ip_address && (
                <p className="text-xs text-gray-500">IP: {device.ip_address}</p>
            )}

            {/* Ports Section */}
            <div className="absolute left-0 top-0 bottom-0 w-1/2 flex flex-col justify-around">
                {inputs.map((port, index) => <Port key={port.id} port={port} type="input" onMouseUp={onPortMouseUp} positionIndex={index} />)}
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-1/2 flex flex-col justify-around">
                {outputs.map((port, index) => <Port key={port.id} port={port} type="output" onMouseDown={onPortMouseDown} positionIndex={index} />)}
            </div>
        </div>
    );
};


const WireDiagramView = ({ showName }) => {
    const [equipment, setEquipment] = useState([]);
    const [connections, setConnections] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [equipmentPositions, setEquipmentPositions] = useState({});
    const [drawingConnection, setDrawingConnection] = useState(null);
    const [editingConnection, setEditingConnection] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingDevice, setEditingDevice] = useState(null);
    const [isEditDeviceModalOpen, setIsEditDeviceModalOpen] = useState(false);
    const canvasRef = useRef(null);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const racksData = await api.getRacksForShow(showName);
            let allEquipment = [];
            for (const rack of racksData) {
                const detailedRack = await api.getRackDetails(rack.id);
                allEquipment = [...allEquipment, ...detailedRack.equipment];
            }
            setEquipment(allEquipment);
            
            const connectionsData = await api.getConnectionsForShow(showName);
            setConnections(connectionsData.connections || []);

            // Initialize positions if they don't exist yet, otherwise use saved positions
            const newPositions = {};
            allEquipment.forEach((item, index) => {
                newPositions[item.id] = { 
                    x: item.x_pos || 50, 
                    y: item.y_pos || 50 + index * 100 
                };
            });
            setEquipmentPositions(newPositions);

        } catch (err) {
            console.error("Failed to fetch wire diagram data:", err);
            setError("Failed to load wire diagram data. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [showName]);

    const setPosition = (id, x, y) => {
        setEquipmentPositions(prev => ({
            ...prev,
            [id]: { x, y }
        }));
    };

    const handlePortMouseDown = (e) => {
        const portId = e.target.dataset.portId;
        const deviceId = e.target.closest('[data-device-id]').dataset.deviceId;
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const startPosition = {
            x: e.target.getBoundingClientRect().left - canvasRect.left,
            y: e.target.getBoundingClientRect().top - canvasRect.top
        };

        setDrawingConnection({
            start: startPosition,
            end: startPosition,
            sourceDeviceId: deviceId,
            sourcePortId: portId,
            connectorType: e.target.dataset.connectorType,
            label: e.target.dataset.portLabel,
            type: e.target.dataset.portType
        });
    };

    const handleMouseMove = (e) => {
        if (!drawingConnection) return;
        const canvasRect = canvasRef.current.getBoundingClientRect();
        setDrawingConnection(prev => ({
            ...prev,
            end: { x: e.clientX - canvasRect.left, y: e.clientY - canvasRect.top }
        }));
    };

    const handlePortMouseUp = async (e) => {
        if (!drawingConnection) return;
        const destinationPortId = e.target.dataset.portId;
        const destinationDeviceId = e.target.closest('[data-device-id]').dataset.deviceId;
        const destinationPortType = e.target.dataset.portType;
        const destinationConnectorType = e.target.dataset.connectorType;

        // Validation checks
        if (drawingConnection.sourceDeviceId === destinationDeviceId) {
            alert("Cannot connect a port to the same device.");
            setDrawingConnection(null);
            return;
        }
        if (drawingConnection.type === destinationPortType) {
            alert("Cannot connect an input to an input or an output to an output.");
            setDrawingConnection(null);
            return;
        }
        if (drawingConnection.connectorType !== destinationConnectorType) {
            alert(`Cannot connect a ${drawingConnection.connectorType} port to a ${destinationConnectorType} port.`);
            setDrawingConnection(null);
            return;
        }

        const newConnectionData = {
            show_id: showName,
            source_device_id: drawingConnection.sourceDeviceId,
            source_port_id: drawingConnection.sourcePortId,
            destination_device_id: destinationDeviceId,
            destination_port_id: destinationPortId,
            cable_type: drawingConnection.connectorType,
            label: `Cable from ${drawingConnection.label}`
        };

        try {
            await api.createConnection(newConnectionData);
            fetchData(); // Refresh connections list
        } catch (err) {
            console.error("Failed to create connection:", err);
            alert(`Error creating connection: ${err.message}`);
        } finally {
            setDrawingConnection(null);
        }
    };
    
    const getPathData = (connection) => {
        const startDevice = equipment.find(e => e.id === connection.source_device_id);
        const endDevice = equipment.find(e => e.id === connection.destination_device_id);
        
        if (!startDevice || !endDevice || !equipmentPositions[startDevice.id] || !equipmentPositions[endDevice.id]) return null;
        
        const sortedStartPorts = startDevice.equipment_templates.ports.sort((a, b) => a.label.localeCompare(b.label));
        const startPortIndex = sortedStartPorts.findIndex(p => p.id === connection.source_port_id);
        
        const sortedEndPorts = endDevice.equipment_templates.ports.sort((a, b) => a.label.localeCompare(b.label));
        const endPortIndex = sortedEndPorts.findIndex(p => p.id === connection.destination_port_id);

        const startX = equipmentPositions[startDevice.id].x + 256; 
        const startY = equipmentPositions[startDevice.id].y + (startPortIndex + 0.5) * 25 + 40;
        const endX = equipmentPositions[endDevice.id].x;
        const endY = equipmentPositions[endDevice.id].y + (endPortIndex + 0.5) * 25 + 40;

        return `M${startX},${startY} L${endX},${endY}`;
    };

    const handleEditConnection = (conn) => {
        setEditingConnection(conn);
        setIsEditModalOpen(true);
    };

    const handleSaveConnection = async (updatedData) => {
        if (!editingConnection) return;
        try {
            await api.updateConnection(editingConnection.id, updatedData);
            fetchData();
        } catch (err) {
            console.error("Failed to update connection:", err);
            alert(`Error updating connection: ${err.message}`);
        }
        setEditingConnection(null);
    };

    const handleDeleteConnection = async () => {
        if (!editingConnection) return;
        if (!window.confirm("Are you sure you want to delete this connection?")) return;
        try {
            await api.deleteConnection(editingConnection.id);
            fetchData();
        } catch (err) {
            console.error("Failed to delete connection:", err);
            alert(`Error deleting connection: ${err.message}`);
        }
        setEditingConnection(null);
        setIsEditModalOpen(false);
    };

    const handleEditDevice = (device) => {
        setEditingDevice(device);
        setIsEditDeviceModalOpen(true);
    };

    const handleSaveDevice = async (deviceId, updatedData) => {
        try {
            await api.updateEquipmentInstance(deviceId, updatedData);
            // Optimistically update the UI
            setEquipment(prev => prev.map(item => item.id === deviceId ? { ...item, ...updatedData } : item));
        } catch (err) {
            console.error("Failed to update device:", err);
            alert(`Error updating device: ${err.message}`);
        }
        setEditingDevice(null);
        setIsEditDeviceModalOpen(false);
    };


    if (isLoading) {
        return <div className="p-8 text-center text-gray-400">Loading wire diagram...</div>;
    }

    if (error) {
        return <div className="p-8 text-center text-red-400">Error: {error}</div>;
    }

    return (
        <div className="flex h-[calc(100vh-220px)]">
            {/* Main Diagram Canvas */}
            <div 
                ref={canvasRef}
                className="flex-grow bg-gray-900/50 rounded-xl p-4 overflow-auto relative"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setDrawingConnection(null)}
                onMouseUp={() => setDrawingConnection(null)}
            >
                <h2 className="text-xl font-bold mb-4 text-white">Wire Diagram for {showName}</h2>
                
                {/* SVG for drawing connections */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {connections.map(conn => {
                        const pathData = getPathData(conn);
                        return pathData ? <path key={conn.id} d={pathData} stroke="white" fill="none" strokeWidth="2" /> : null;
                    })}
                    {drawingConnection && (
                        <line
                            x1={drawingConnection.start.x}
                            y1={drawingConnection.start.y}
                            x2={drawingConnection.end.x}
                            y2={drawingConnection.end.y}
                            stroke="rgba(251, 191, 36, 0.8)"
                            strokeWidth="2"
                            strokeDasharray="5,5"
                        />
                    )}
                </svg>

                {/* Equipment Nodes */}
                {equipment.length > 0 ? (
                    equipment.map(item => (
                        <DeviceNode 
                            key={item.id} 
                            device={item} 
                            onPortMouseDown={handlePortMouseDown} 
                            onPortMouseUp={handlePortMouseUp}
                            position={equipmentPositions[item.id] || {x: 0, y: 0}}
                            setPosition={setPosition}
                            onNodeClick={handleEditDevice}
                        />
                    ))
                ) : (
                    <p className="text-center text-gray-500">No equipment found. Add some in the Rack Builder to get started.</p>
                )}
            </div>

            {/* Connection List Sidebar */}
            <div className="w-80 ml-6 p-4 bg-gray-900/50 rounded-xl overflow-y-auto">
                <h2 className="text-xl font-bold mb-4 text-white">Connections</h2>
                <ul className="space-y-2">
                    {connections.length > 0 ? (
                        connections.map(conn => (
                            <li 
                                key={conn.id} 
                                className="bg-gray-800 p-3 rounded-lg text-sm border border-gray-700 hover:bg-gray-700 cursor-pointer transition-colors"
                                onClick={() => handleEditConnection(conn)}
                            >
                                <p className="font-bold">{conn.label || 'Unnamed Cable'}</p>
                                <p className="text-gray-400 text-xs">
                                    From {conn.source_device_id.split('-')[0]} to {conn.destination_device_id.split('-')[0]}
                                </p>
                                <p className="text-gray-500 text-xs mt-1">
                                    Type: {conn.cable_type}
                                </p>
                            </li>
                        ))
                    ) : (
                        <p className="text-gray-500 text-sm">No connections yet.</p>
                    )}
                </ul>
            </div>
            {editingConnection && (
                <ConnectionEditModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    connection={editingConnection}
                    onSave={handleSaveConnection}
                    onDelete={handleDeleteConnection}
                />
            )}
            {editingDevice && (
                <EditDeviceModal
                    isOpen={isEditDeviceModalOpen}
                    onClose={() => setIsEditDeviceModalOpen(false)}
                    device={editingDevice}
                    onSave={handleSaveDevice}
                />
            )}
        </div>
    );
};

export default WireDiagramView;
