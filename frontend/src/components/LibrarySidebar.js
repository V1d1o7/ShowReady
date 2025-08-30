import React, { useState, useEffect } from 'react';
import { useShow } from '../contexts/ShowContext';
import { api } from '../api/api';

const LibrarySidebar = () => {
    const { showName } = useShow();
    const [unassignedEquipment, setUnassignedEquipment] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!showName) return;

        const fetchUnassignedEquipment = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const data = await api.getUnassignedEquipment(showName);
                setUnassignedEquipment(data);
            } catch (err) {
                console.error("Failed to fetch unassigned equipment:", err);
                setError("Could not load library items.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchUnassignedEquipment();
    }, [showName]);

    const onDragStart = (event, equipment) => {
        event.dataTransfer.setData('application/reactflow', JSON.stringify(equipment));
        event.dataTransfer.effectAllowed = 'move';
    };

    if (isLoading) {
        return <div className="p-4 text-gray-400">Loading...</div>;
    }

    if (error) {
        return <div className="p-4 text-red-400">{error}</div>;
    }

    return (
        <aside className="w-64 bg-gray-800 p-4 overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-4">Equipment Library</h3>
            <div className="space-y-2">
                {unassignedEquipment.length > 0 ? (
                    unassignedEquipment.map(equipment => (
                        <div
                            key={equipment.id}
                            className="p-2 bg-gray-700 rounded-md cursor-grab text-white hover:bg-gray-600"
                            onDragStart={(event) => onDragStart(event, equipment)}
                            draggable
                        >
                            {equipment.instance_name}
                            <div className="text-xs text-gray-400">{equipment.equipment_templates.model_number}</div>
                        </div>
                    ))
                ) : (
                    <div className="text-sm text-gray-400 p-2 bg-gray-900/50 rounded-lg">
                        <p className="font-semibold">Library is empty.</p>
                        <p className="mt-2 text-xs text-gray-500">
                            Add equipment to racks in the "Rack Builder" view. Any item not already on a diagram page will appear here.
                        </p>
                    </div>
                )}
            </div>
        </aside>
    );
};

export default LibrarySidebar;
