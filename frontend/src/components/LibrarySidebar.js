import React, { useState, useMemo } from 'react';
import UserTreeView from './UserTreeView';
import { Search } from 'lucide-react';

const LibrarySidebar = ({ 
    unassignedEquipment = [], 
    library = { folders: [], equipment: [] }, 
    onDragStart, 
    setDraggingItem 
}) => {
    const [activeTab, setActiveTab] = useState('racked'); // 'racked' or 'library'
    const [searchTerm, setSearchTerm] = useState('');

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

    // Filter Unassigned Equipment
    const filteredUnassigned = useMemo(() => {
        if (!searchTerm) return unassignedEquipment;
        const term = searchTerm.toLowerCase();
        return unassignedEquipment.filter(eq => {
            const nameMatch = (eq.instance_name || '').toLowerCase().includes(term);
            const modelMatch = (eq.equipment_templates?.model_number || '').toLowerCase().includes(term);
            return nameMatch || modelMatch;
        });
    }, [unassignedEquipment, searchTerm]);

    // Filter Library Equipment
    const filteredLibrary = useMemo(() => {
        if (!searchTerm) return library;
        const term = searchTerm.toLowerCase();
        const filteredEquip = library.equipment.filter(eq => {
            const modelMatch = (eq.model_number || '').toLowerCase().includes(term);
            const mfgMatch = (eq.manufacturer || '').toLowerCase().includes(term);
            return modelMatch || mfgMatch;
        });
        
        return {
            folders: library.folders, // Keep folders, UserTreeView will handle empty ones
            equipment: filteredEquip
        };
    }, [library, searchTerm]);

    return (
        <aside className="w-72 bg-gray-800 flex flex-col border-r border-gray-700">
            <div className="flex-shrink-0 flex">
                <TabButton tabName="racked" label="Racked Gear" />
                <TabButton tabName="library" label="Equip. Library" />
            </div>

            <div className="p-3 border-b border-gray-700 bg-gray-900/30">
                <div className="flex items-center bg-gray-800 rounded-md px-3 py-1.5 border border-gray-600 focus-within:border-amber-500 transition-colors">
                    <Search size={14} className="text-gray-400 mr-2 flex-shrink-0" />
                    <input
                        type="text"
                        placeholder={`Search ${activeTab === 'racked' ? 'racked gear' : 'library'}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-transparent text-sm text-white focus:outline-none w-full"
                    />
                </div>
            </div>
            
            <div className="overflow-y-auto p-4 space-y-2 flex-grow">
                {activeTab === 'racked' && (
                    <>
                        {filteredUnassigned.length > 0 ? (
                            filteredUnassigned.map(equipment => (
                                <div
                                    key={`instance-${equipment.id}`}
                                    className="p-3 bg-gray-700 rounded-md cursor-grab text-white hover:bg-gray-600 shadow transition-colors"
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
                                {searchTerm ? (
                                    <p className="font-semibold">No matches found</p>
                                ) : (
                                    <>
                                        <p className="font-semibold">No Unassigned Gear</p>
                                        <p className="mt-2 text-xs text-gray-500">
                                            Add equipment in the "Rack Builder" view. Items not on a diagram page will appear here.
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'library' && (
                     <UserTreeView 
                        library={filteredLibrary} 
                        onDragStart={(e, item) => onDragStart(e, { ...item, isTemplate: true })} 
                        showDefaultLibrary={true}
                    />
                )}
            </div>
        </aside>
    );
};

export default LibrarySidebar;