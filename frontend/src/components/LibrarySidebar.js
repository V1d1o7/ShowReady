import React from 'react';

const LibrarySidebar = ({ unassignedEquipment = [], onDragStart, setDraggingItem }) => {

    if (!unassignedEquipment) {
        return <div className="p-4 text-gray-400">Loading...</div>;
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
                            onDragStart={(e) => onDragStart(e, equipment)}
                            onDragEnd={() => setDraggingItem(null)}
                            draggable
                        >
                            {equipment.instance_name}
                            <div className="text-xs text-gray-400">{equipment.equipment_templates?.model_number}</div>
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
