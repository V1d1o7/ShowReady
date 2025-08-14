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

    useEffect(() => {
        const loadInitialData = async () => {
            setIsLoading(true);
            try {
                const [racksData, libraryData] = await Promise.all([
                    api.getRacksForShow(showName),
                    api.getLibrary()
                ]);
                
                setRacks(racksData || []);

                if (libraryData) {
                    setLibraryFolders(libraryData.folders || []);
                    setLibraryEquipment(libraryData.equipment || []);
                }

                if (racksData && racksData.length > 0) {
                    const detailedRack = await api.getRackDetails(racksData[0].id);
                    setActiveRack(detailedRack);
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
        try {
            const detailedRack = await api.getRackDetails(rack.id);
            setActiveRack(detailedRack);
        } catch (error) {
            console.error("Failed to fetch rack details:", error);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleCreateRack = async ({ rackName, ruHeight }) => {
        try {
            const newRack = await api.createRack({ rack_name: rackName, ru_height: parseInt(ruHeight, 10), show_name: showName });
            setRacks(prev => [...prev, newRack]);
            setActiveRack(newRack);
        } catch (error) {
            console.error("Failed to create rack:", error);
        }
        setIsNewRackModalOpen(false);
    };
    
    const handleAddEquipment = async (item, ru_position) => {
        if (!activeRack) return;

        const parentFolder = libraryFolders.find(f => f.id === item.folder_id);
        let instanceName = `${item.model_number}-1`;

        if (parentFolder && parentFolder.nomenclature_prefix) {
            const prefix = parentFolder.nomenclature_prefix;
            const existingCount = (activeRack.equipment || []).filter(eq => 
                eq.instance_name.startsWith(prefix)
            ).length;
            instanceName = `${prefix}-${String(existingCount + 1).padStart(2, '0')}`;
        } else {
             const existingCount = (activeRack.equipment || []).filter(eq => 
                eq.template_id === item.id
            ).length;
            instanceName = `${item.model_number}-${existingCount + 1}`;
        }

        const newInstanceData = {
            template_id: item.id,
            ru_position: ru_position,
            instance_name: instanceName
        };

        try {
            const addedEquipment = await api.addEquipmentToRack(activeRack.id, newInstanceData);
            const template = libraryEquipment.find(t => t.id === addedEquipment.template_id);
            const completeEquipment = { ...addedEquipment, equipment_templates: template };
            setActiveRack(prev => ({ ...prev, equipment: [...(prev.equipment || []), completeEquipment] }));
        } catch (error) { console.error("Failed to add equipment:", error); }
    };

    const handleMoveEquipment = async (item, new_ru_position) => {
        if (!activeRack) return;
        try {
            await api.moveEquipmentInRack(item.id, new_ru_position);
            setActiveRack(prev => ({
                ...prev,
                equipment: prev.equipment.map(eq => eq.id === item.id ? { ...eq, ru_position: new_ru_position } : eq)
            }));
        } catch (error) { console.error("Failed to move equipment:", error); }
    };
    
    const handleDeleteEquipment = async (instanceId) => {
        if (!activeRack || !window.confirm("Are you sure you want to remove this equipment?")) return;
        try {
            await api.deleteEquipmentFromRack(instanceId);
            setActiveRack(prev => ({
                ...prev,
                equipment: prev.equipment.filter(eq => eq.id !== instanceId)
            }));
        } catch (error) { console.error("Failed to delete equipment:", error); }
    };

    const handleDrop = (data, ru_position) => {
        if (data.isNew) {
            handleAddEquipment(data.item, ru_position);
        } else {
            handleMoveEquipment(data.item, ru_position);
        }
    };

    const handleDragStartFromLibrary = (e, item) => {
        const data = { isNew: true, item: item };
        e.dataTransfer.setData('application/json', JSON.stringify(data));
        setDraggedItem(data);
    };

    return (
        <>
            <div className="grid grid-cols-12 gap-6 h-[calc(100vh-220px)]">
                <div className="col-span-2 bg-gray-800/50 p-4 rounded-xl flex flex-col">
                    <h2 className="text-lg font-bold text-white mb-4">Racks</h2>
                    <div className="flex-grow overflow-y-auto">
                        {isLoading && racks.length === 0 ? <p>Loading...</p> : (
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
                    <button onClick={() => setIsNewRackModalOpen(true)} className="w-full mt-4 flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors">
                        <Plus size={16} /> New Rack
                    </button>
                </div>

                <div className="col-span-7 bg-gray-800/50 p-4 rounded-xl overflow-y-auto">
                    {isLoading && !activeRack ? <p className="text-gray-500 text-center mt-10">Loading...</p> : activeRack ? (
                        <RackComponent 
                            rack={activeRack} 
                            onDrop={handleDrop} 
                            onDelete={handleDeleteEquipment} 
                            draggedItem={draggedItem}
                            setDraggedItem={setDraggedItem}
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
                            onDragStart={handleDragStartFromLibrary}
                        />
                    </div>
                </div>
            </div>
            <NewRackModal isOpen={isNewRackModalOpen} onClose={() => setIsNewRackModalOpen(false)} onSubmit={handleCreateRack} />
        </>
    );
};

export default RackBuilderView;