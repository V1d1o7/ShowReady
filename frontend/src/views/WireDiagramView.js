import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api/api';
import { Trash2 } from 'lucide-react';
import Modal from '../components/Modal';
import DeviceNode from '../components/DeviceNode'; // Import the new component

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
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 hover:bg-red-500 rounded-lg font-bold"
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

// Modal for editing device properties
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

            const newPositions = {};
            allEquipment.forEach((item, index) => {
                newPositions[item.id] = { 
                    x: item.x_pos || 50 + (index % 4 * 400), 
                    y: item.y_pos || 50 + (Math.floor(index / 4) * 250)
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
        e.stopPropagation();
        const portElement = e.target;
        const canvasRect = canvasRef.current.getBoundingClientRect();

        setDrawingConnection({
            sourceDeviceId: portElement.dataset.deviceId,
            sourcePortId: portElement.dataset.portId,
            connectorType: portElement.dataset.connectorType,
            startPos: {
                x: portElement.getBoundingClientRect().left - canvasRect.left + (portElement.clientWidth / 2),
                y: portElement.getBoundingClientRect().top - canvasRect.top + (portElement.clientHeight / 2),
            },
            endPos: {
                x: e.clientX - canvasRect.left,
                y: e.clientY - canvasRect.top,
            }
        });
    };

    const handleMouseMove = (e) => {
        if (!drawingConnection) return;
        const canvasRect = canvasRef.current.getBoundingClientRect();
        setDrawingConnection(prev => ({
            ...prev,
            endPos: { x: e.clientX - canvasRect.left, y: e.clientY - canvasRect.top }
        }));
    };

    const handlePortMouseUp = async (e) => {
        e.stopPropagation();
        if (!drawingConnection) return;

        const destPortElement = e.target;
        const destinationPortId = destPortElement.dataset.portId;
        const destinationDeviceId = destPortElement.dataset.deviceId;
        const destinationPortType = destPortElement.dataset.portType;
        const destinationConnectorType = destPortElement.dataset.connectorType;

        if (!destinationDeviceId || !destinationPortId) {
            setDrawingConnection(null);
            return;
        }

        if (drawingConnection.sourceDeviceId === destinationDeviceId || 'output' === destinationPortType) {
            setDrawingConnection(null);
            return;
        }

        if (drawingConnection.connectorType !== destinationConnectorType) {
            alert(`Cannot connect a ${drawingConnection.connectorType} port to a ${destinationConnectorType} port.`);
            setDrawingConnection(null);
            return;
        }

        const newConnectionData = {
            source_device_id: drawingConnection.sourceDeviceId,
            source_port_id: drawingConnection.sourcePortId,
            destination_device_id: destinationDeviceId,
            destination_port_id: destinationPortId,
            cable_type: drawingConnection.connectorType
        };

        try {
            await api.createConnection(newConnectionData);
            await fetchData();
        } catch (err) {
            console.error("Failed to create connection:", err);
            alert(`Error creating connection: ${err.message}`);
        } finally {
            setDrawingConnection(null);
        }
    };

    const getPathForConnection = (connection) => {
        if (!canvasRef.current) return null;
        
        const startEl = document.getElementById(`port-${connection.source_device_id}-${connection.source_port_id}`);
        const endEl = document.getElementById(`port-${connection.destination_device_id}-${connection.destination_port_id}`);

        if (!startEl || !endEl) return null;
        
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const startRect = startEl.getBoundingClientRect();
        const endRect = endEl.getBoundingClientRect();
        
        const startX = startRect.left - canvasRect.left + (startRect.width / 2);
        const startY = startRect.top - canvasRect.top + (startRect.height / 2);
        const endX = endRect.left - canvasRect.left + (endRect.width / 2);
        const endY = endRect.top - canvasRect.top + (endRect.height / 2);

        const handleOffset = Math.max(60, Math.abs(startX - endX) * 0.4);
        
        return `M ${startX} ${startY} C ${startX + handleOffset} ${startY}, ${endX - handleOffset} ${endY}, ${endX} ${endY}`;
    };
    
    const getPathForDrawing = () => {
        if (!drawingConnection) return null;
        const { startPos, endPos } = drawingConnection;
        const handleOffset = Math.max(60, Math.abs(startPos.x - endPos.x) * 0.4);
        return `M ${startPos.x} ${startPos.y} C ${startPos.x + handleOffset} ${startPos.y}, ${endPos.x - handleOffset} ${endPos.y}, ${endPos.x} ${endPos.y}`;
    }

    const handleEditConnection = (conn) => {
        setEditingConnection(conn);
        setIsEditModalOpen(true);
    };

    const handleSaveConnection = async (updatedData) => {
        if (!editingConnection) return;
        try {
            await api.updateConnection(editingConnection.id, updatedData);
            await fetchData();
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
            await fetchData();
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
            <div 
                className="flex-grow overflow-auto rounded-xl bg-gray-800/50"
                onMouseMove={handleMouseMove}
                onMouseUp={() => setDrawingConnection(null)}
            >
                <div 
                    ref={canvasRef}
                    className="p-4 relative"
                    style={{ width: 4000, height: 4000 }}
                >
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                        {connections.map(conn => {
                            const pathData = getPathForConnection(conn);
                            return pathData ? <path key={conn.id} d={pathData} stroke="#9ca3af" fill="none" strokeWidth="2" /> : null;
                        })}
                        {drawingConnection && (
                            <path d={getPathForDrawing()} stroke="#f59e0b" fill="none" strokeWidth="2" strokeDasharray="6,4" />
                        )}
                    </svg>

                    {equipment.length > 0 ? (
                        equipment.map(item => (
                            <DeviceNode 
                                key={item.id} 
                                device={item} 
                                onPortMouseDown={handlePortMouseDown} 
                                onPortMouseUp={handlePortMouseUp}
                                position={equipmentPositions[item.id] || {x: 50, y: 50}}
                                setPosition={setPosition}
                                onNodeClick={handleEditDevice}
                            />
                        ))
                    ) : (
                        <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-500">
                            No equipment found. Add some in the Rack Builder to get started.
                        </p>
                    )}
                </div>
            </div>

            <div className="w-80 ml-6 p-4 bg-gray-800/50 rounded-xl overflow-y-auto flex flex-col">
                <h2 className="text-xl font-bold mb-4 text-white">Connections</h2>
                <ul className="space-y-2 flex-grow">
                    {connections.length > 0 ? (
                        connections.map(conn => (
                            <li 
                                key={conn.id} 
                                className="bg-gray-800 p-3 rounded-lg text-sm border border-gray-700 hover:bg-gray-700 cursor-pointer transition-colors"
                                onClick={() => handleEditConnection(conn)}
                            >
                                <p className="font-bold">{conn.label || 'Unnamed Cable'}</p>
                                <p className="text-gray-400 text-xs">
                                    {(equipment.find(e => e.id === conn.source_device_id) || {}).instance_name} → {(equipment.find(e => e.id === conn.destination_device_id) || {}).instance_name}
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