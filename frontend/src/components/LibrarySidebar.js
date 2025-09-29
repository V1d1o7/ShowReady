import React, { useState } from 'react';
import UserTreeView from './UserTreeView';

const LibrarySidebar = ({ 
    unassignedEquipment = [], 
    library = { folders: [], equipment: [] }, 
    onDragStart, 
    setDraggingItem 
}) => {
    const [activeTab, setActiveTab] = useState('racked'); // 'racked' or 'library'

    const TabButton = ({ tabName, label }) => (
        <button
            onClick={() => setActiveTab(tabName)}
            className={`flex-1 py-2 text-sm font-bold transition-colors ${
                activeTab === tabName
                    ? 'bg-amber-500 text-black'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
        >
            {label}
        </button>
    );

    return (
        <aside className="w-72 bg-gray-800 flex flex-col">
            <div className="flex-shrink-0 flex">
                <TabButton tabName="racked" label="Racked Gear" />
                <TabButton tabName="library" label="Equip. Library" />
            </div>
            
            <div className="overflow-y-auto p-4 space-y-2">
                {activeTab === 'racked' && (
                    <>
                        {unassignedEquipment.length > 0 ? (
                            unassignedEquipment.map(equipment => (
                                <div
                                    key={`instance-${equipment.id}`}
                                    className="p-3 bg-gray-700 rounded-md cursor-grab text-white hover:bg-gray-600 shadow"
                                    onDragStart={(e) => onDragStart(e, { ...equipment, isTemplate: false })}
                                    onDragEnd={() => setDraggingItem(null)}
                                    draggable
                                >
                                    <p className="font-bold truncate">{equipment.instance_name}</p>
                                    <p className="text-xs text-gray-400">{equipment.equipment_templates?.model_number}</p>
                                </div>
                            ))
                        ) : (
                            <div className="text-sm text-center text-gray-400 p-4 bg-gray-900/50 rounded-lg">
                                <p className="font-semibold">No Unassigned Gear</p>
                                <p className="mt-2 text-xs text-gray-500">
                                    Add equipment in the "Rack Builder" view. Items not on a diagram page will appear here.
                                </p>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'library' && (
                     <UserTreeView 
                        library={library} 
                        onDragStart={(e, item) => onDragStart(e, { ...item, isTemplate: true })} 
                        showDefaultLibrary={true}
                    />
                )}
            </div>
        </aside>
    );
};

export default LibrarySidebar;