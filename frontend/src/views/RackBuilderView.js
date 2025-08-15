import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../api/api';
import TreeView from './TreeView';
import RackComponent from '../components/RackComponent';
import NewRackModal from '../components/NewRackModal';

const RackBuilderView = ({ showName }) => {
    const [racks, setRacks] = useState([]);
    const [activeRack, setActiveRack] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isNewRackModalOpen, setIsNewRackModalOpen] = useState(false);
    
    const [libraryFolders, setLibraryFolders] = useState([]);
    const [libraryEquipment, setLibraryEquipment] = useState([]);
    const [draggedItem, setDraggedItem] = useState(null);

    const fetchRackDetails = async (rackId) => {
        try {
            const detailedRack = await api.getRackDetails(rackId);
            setActiveRack(detailedRack);
        } catch (error) {
            console.error("Failed to fetch rack details:", error);
            setActiveRack(null); 
        }
    };

    useEffect(() => {
        const loadInitialData = async () => {
            setIsLoading(true);
            try {
                const [racksData, libraryData] = await Promise.all([
                    api.getRacksForShow(showName),
                    api.getLibrary()
                ]);
                
                setRacks(racksData || []);
                setLibraryFolders(libraryData?.folders || []);
                setLibraryEquipment(libraryData?.equipment || []);

                if (racksData && racksData.length > 0) {
                    await fetchRackDetails(racksData[0].id);
                }
            } catch (error) {
                console.error("Failed to load initial data:", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadInitialData();
    }, [showName]);
    
    const handleSelectRack = async (rack) => {
        setIsLoading(true);
        await fetchRackDetails(rack.id);
        setIsLoading(false);
    };
    
    const handleCreateRack = async ({ rackName, ruHeight }) => {
        try {
            const newRack = await api.createRack({ rack_name: rackName, ru_height: parseInt(ruHeight, 10), show_name: showName });
            setRacks(prev => [...prev, newRack]);
            setActiveRack({ ...newRack, equipment: [] });
        } catch (error) {
            console.error("Failed to create rack:", error);
        }
        setIsNewRackModalOpen(false);
    };
    
    const handleAddEquipment = async (item, ru_position, rack_side) => {
        if (!activeRack) return;

        // --- OPTIMISTIC UI UPDATE FOR ADDING ---

        // 1. Create a temporary client-side ID for the new item.
        const tempId = `temp-${Date.now()}`;
        
        // 2. Generate a temporary instance name based on client-side data (will be replaced by server's name).
        const parentFolder = libraryFolders.find(f => f.id === item.folder_id);
        const prefix = parentFolder?.nomenclature_prefix;
        const base_name = prefix || item.model_number;
        const existingCount = (activeRack.equipment || []).filter(eq => 
            eq.instance_name.startsWith(base_name + '-')
        ).length;
        const tempInstanceName = `${base_name}-${existingCount + 1}`;

        // 3. Create the temporary optimistic item.
        const optimisticItem = {
            id: tempId,
            rack_id: activeRack.id,
            template_id: item.id,
            ru_position: ru_position,
            rack_side: item.width === 'half' ? rack_side : null,
            instance_name: tempInstanceName,
            equipment_templates: item // The template data is already in the dragged item
        };

        // 4. Update the UI immediately.
        setActiveRack(prev => ({...prev, equipment: [...prev.equipment, optimisticItem]}));

        // 5. Call the API in the background.
        try {
            const newInstanceData = {
                template_id: item.id,
                ru_position: ru_position,
                rack_side: item.width === 'half' ? rack_side : null,
            };
            const savedEquipment = await api.addEquipmentToRack(activeRack.id, newInstanceData);
            
            // 6. Once successful, replace the temporary item with the real one from the server.
            setActiveRack(prev => ({
                ...prev,
                equipment: prev.equipment.map(eq => 
                    eq.id === tempId ? { ...savedEquipment, equipment_templates: item } : eq
                )
            }));

        } catch (error) { 
            console.error("Failed to add equipment:", error); 
            alert(`Error adding equipment: ${error.message}`);
            // 7. On error, remove the temporary item.
            setActiveRack(prev => ({
                ...prev,
                equipment: prev.equipment.filter(eq => eq.id !== tempId)
            }));
        }
    };

    const handleMoveEquipment = async (item, new_ru_position, rack_side) => {
        if (!activeRack) return;

        const originalRackState = activeRack;
        const isHalf = item.equipment_templates.width === 'half';

        setActiveRack(prevRack => ({
            ...prevRack,
            equipment: prevRack.equipment.map(eq => 
                eq.id === item.id 
                ? { ...eq, ru_position: new_ru_position, rack_side: isHalf ? rack_side : null }
                : eq
            )
        }));

        try {
            await api.moveEquipmentInRack(item.id, { 
                ru_position: new_ru_position,
                rack_side: isHalf ? rack_side : null
            });
        } catch (error) {
            console.error("Failed to move equipment:", error);
            alert(`Error moving equipment: ${error.message}. Reverting change.`);
            setActiveRack(originalRackState);
        }
    };
    
    const handleDeleteEquipment = async (instanceId) => {
        if (!activeRack || !window.confirm("Are you sure you want to remove this equipment?")) return;

        const originalRackState = activeRack;
        
        setActiveRack(prev => ({
            ...prev,
            equipment: prev.equipment.filter(eq => eq.id !== instanceId)
        }));

        try {
            await api.deleteEquipmentFromRack(instanceId);
        } catch (error) {
            console.error("Failed to delete equipment:", error);
            alert(`Error deleting equipment: ${error.message}. Reverting change.`);
            setActiveRack(originalRackState);
        }
    };

    const handleDrop = (data, ru_position, side) => {
        if (data.isNew) {
            handleAddEquipment(data.item, ru_position, side);
        } else {
            handleMoveEquipment(data.item, ru_position, side);
        }
    };

    const handleDragStart = (e, item, isNew = false) => {
        const template = isNew ? item : item.equipment_templates;
        const data = { isNew, item, template };
        e.dataTransfer.setData('application/json', JSON.stringify(data));
        setDraggedItem(data);
    };

    return (
        <>
            <div className="grid grid-cols-12 gap-6 h-[calc(100vh-220px)]">
                <div className="col-span-2 bg-gray-800/50 p-4 rounded-xl flex flex-col">
                    <h2 className="text-lg font-bold text-white mb-4">Racks</h2>
                    <div className="flex-grow overflow-y-auto">
                        {(isLoading && !activeRack) ? <p>Loading racks...</p> : (
                            <ul>
                                {racks.map(rack =>
                                    <li key={rack.id}
                                        onClick={() => handleSelectRack(rack)}
                                        className={`p-2 rounded-md cursor-pointer ${activeRack?.id === rack.id ? 'bg-amber-500 text-black' : 'hover:bg-gray-700'}`}>
                                        {rack.rack_name}
                                    </li>
                                )}
                            </ul>
                        )}
                    </div>
                    <button onClick={() => setIsNewRackModalOpen(true)} className="w-full mt-4 flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400">
                        <Plus size={16} /> New Rack
                    </button>
                </div>

                <div className="col-span-7 bg-gray-800/50 p-4 rounded-xl overflow-y-auto">
                    {isLoading && !activeRack ? <p className="text-gray-500 text-center mt-10">Loading...</p> : activeRack ? (
                        <RackComponent 
                            rack={activeRack} 
                            onDrop={handleDrop} 
                            onDelete={handleDeleteEquipment}
                            onDragStart={(e, item) => handleDragStart(e, item, false)}
                            draggedItem={draggedItem}
                        />
                    ) : (
                        <p className="text-gray-500 text-center mt-10">Select or create a rack to begin.</p>
                    )}
                </div>

                <div className="col-span-3 bg-gray-800/50 p-4 rounded-xl flex flex-col">
                    <h2 className="text-lg font-bold text-white mb-4">Equipment Library</h2>
                    <div className="flex-grow overflow-y-auto">
                        <TreeView
                            folders={libraryFolders}
                            equipment={libraryEquipment}
                            onDragStart={(e, item) => handleDragStart(e, item, true)}
                        />
                    </div>
                </div>
            </div>
            <NewRackModal isOpen={isNewRackModalOpen} onClose={() => setIsNewRackModalOpen(false)} onSubmit={handleCreateRack} />
        </>
    );
};

export default RackBuilderView;