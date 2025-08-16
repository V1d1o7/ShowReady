import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api/api';
import { Plus, Library, HardDrive } from 'lucide-react';
import UserTreeView from '../components/UserTreeView';
import RackList from '../components/RackList';
import NewRackModal from '../components/NewRackModal';
import NewUserEquipmentModal from '../components/NewUserEquipmentModal';
import RackLibraryModal from '../components/RackLibraryModal';
import RackComponent from '../components/RackComponent';

const RackBuilderView = ({ showName }) => {
    const [racks, setRacks] = useState([]);
    const [library, setLibrary] = useState({ folders: [], equipment: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isNewRackModalOpen, setIsNewRackModalOpen] = useState(false);
    const [isNewEquipModalOpen, setIsNewEquipModalOpen] = useState(false);
    const [isRackLibraryOpen, setIsRackLibraryOpen] = useState(false);
    const [selectedRackId, setSelectedRackId] = useState(null);
    const [activeRack, setActiveRack] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);

    const fetchData = useCallback(async (rackToSelectId = null) => {
        setIsLoading(true);
        try {
            const [racksData, fullLibrary] = await Promise.all([
                api.getRacksForShow(showName),
                api.getLibrary()
            ]);

            setRacks(racksData || []);
            setLibrary(fullLibrary || { folders: [], equipment: [] });

            let nextRackId = rackToSelectId;

            if (!nextRackId && racksData && racksData.length > 0) {
                const currentRackExists = selectedRackId && racksData.some(r => r.id === selectedRackId);
                nextRackId = currentRackExists ? selectedRackId : racksData[0].id;
            }
            
            if (nextRackId) {
                const detailedRack = await api.getRackDetails(nextRackId);
                setActiveRack(detailedRack);
                setSelectedRackId(nextRackId);
            } else {
                setActiveRack(null);
                setSelectedRackId(null);
            }

        } catch (error) {
            console.error("Failed to fetch initial data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [showName, selectedRackId]);

    useEffect(() => {
        fetchData();
        const handleClickOutside = () => setContextMenu(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, [showName]);

    const handleSelectRack = async (rackId) => {
        if (selectedRackId === rackId) return;
        setSelectedRackId(rackId);
        setIsLoading(true);
        try {
            const detailedRack = await api.getRackDetails(rackId);
            setActiveRack(detailedRack);
        } catch (error) {
            console.error("Failed to fetch rack details:", error);
            setActiveRack(null);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleCreateRack = async ({ rackName, ruHeight }) => {
        try {
            const newRack = await api.createRack({ rack_name: rackName, ru_height: parseInt(ruHeight, 10), show_name: showName });
            await fetchData(newRack.id);
        } catch (error) {
            console.error("Failed to create rack:", error);
            alert(`Error creating rack: ${error.message}`);
        }
        setIsNewRackModalOpen(false);
    };

    const handleDeleteRack = async (rackId) => {
        if (!window.confirm("Are you sure you want to delete this rack?")) return;
        try {
            await api.deleteRack(rackId);
            setSelectedRackId(null); 
            await fetchData();
        } catch (error) {
            console.error("Failed to delete rack:", error);
            alert(`Error: ${error.message}`);
        }
    };

    const handleUpdateRack = async (rackId, rackData) => {
        try {
            await api.updateRack(rackId, rackData);
            await fetchData(rackId);
        } catch (error) {
            console.error("Failed to update rack:", error)
            alert(`Error: ${error.message}`);
        }
    };
    
    const handleCreateUserEquipment = async (equipmentData) => {
        try {
            await api.createUserEquipment(equipmentData);
            await fetchData(selectedRackId);
        } catch (error) {
            console.error("Failed to create user equipment:", error);
            alert(`Error: ${error.message}`);
        }
        setIsNewEquipModalOpen(false);
    };
    
    const handleLoadRackFromLibrary = async (templateRackId) => {
        try {
            const newRack = await api.copyRackFromLibrary(templateRackId, showName);
            await fetchData(newRack.id);
        } catch (error) {
            console.error("Failed to load rack from library:", error);
            alert(`Error: ${error.message}`);
        }
        setIsRackLibraryOpen(false);
    };

    const handleAddEquipment = async (item, ru_position, rack_side_view) => {
        if (!activeRack) return;

        const tempId = `temp-${Date.now()}`;
        const parentFolder = library.folders.find(f => f.id === item.folder_id);
        const prefix = parentFolder?.nomenclature_prefix;
        const base_name = prefix || item.model_number;
        const existingCount = (activeRack.equipment || []).filter(eq => eq.instance_name.startsWith(base_name + '-')).length;
        const tempInstanceName = `${base_name}-${existingCount + 1}`;

        const optimisticItem = {
            id: tempId,
            rack_id: activeRack.id,
            template_id: item.id,
            ru_position: ru_position,
            rack_side: rack_side_view,
            instance_name: tempInstanceName,
            equipment_templates: item
        };
        setActiveRack(prev => ({...prev, equipment: [...prev.equipment, optimisticItem]}));

        try {
            const newInstanceData = { template_id: item.id, ru_position, rack_side: rack_side_view };
            const savedEquipment = await api.addEquipmentToRack(activeRack.id, newInstanceData);
            setActiveRack(prev => ({
                ...prev,
                equipment: prev.equipment.map(eq => eq.id === tempId ? savedEquipment : eq)
            }));
        } catch (error) { 
            console.error("Failed to add equipment:", error); 
            alert(`Error adding equipment: ${error.message}`);
            setActiveRack(prev => ({ ...prev, equipment: prev.equipment.filter(eq => eq.id !== tempId) }));
        }
    };

    const handleMoveEquipment = async (item, new_ru_position, rack_side_view) => {
        if (!activeRack) return;
        const originalRackState = activeRack;
        
        setActiveRack(prevRack => ({
            ...prevRack,
            equipment: prevRack.equipment.map(eq => eq.id === item.id ? { ...eq, ru_position: new_ru_position, rack_side: rack_side_view } : eq)
        }));
        try {
            await api.updateEquipmentInstance(item.id, { ru_position: new_ru_position, rack_side: rack_side_view });
        } catch (error) {
            console.error("Failed to move equipment:", error);
            alert(`Error moving equipment: ${error.message}. Reverting change.`);
            setActiveRack(originalRackState);
        }
    };
    
    const handleDeleteEquipmentOnRack = async (instanceId) => {
        if (!activeRack || !window.confirm("Are you sure you want to remove this equipment?")) return;
        const originalRackState = activeRack;
        setActiveRack(prev => ({ ...prev, equipment: prev.equipment.filter(eq => eq.id !== instanceId) }));
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
    
    const handleContextMenu = (e, item) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, item: item });
    };

    const handleCopyToLibrary = async () => {
        if (!contextMenu) return;
        const { item } = contextMenu;
        try {
            await api.copyEquipmentToLibrary({ template_id: item.id, folder_id: null });
            await fetchData(selectedRackId);
            alert(`${item.model_number} copied to your library!`);
        } catch (error) {
            console.error("Failed to copy equipment:", error);
            alert(`Error: ${error.message}`);
        }
        setContextMenu(null);
    };

    const userFolderTree = useMemo(() => {
        const userFolders = library.folders.filter(f => !f.is_default);
        const itemsById = {};
        userFolders.forEach(item => { itemsById[item.id] = { ...item, children: [] }; });
        const roots = [];
        Object.values(itemsById).forEach(item => {
            if (item.parent_id && itemsById[item.parent_id]) {
                itemsById[item.parent_id].children.push(item);
            } else {
                roots.push(item);
            }
        });
        return roots;
    }, [library.folders]);

    if (isLoading && !activeRack) return <div className="p-8 text-center text-gray-400">Loading Rack Builder...</div>;

    return (
        <div className="flex gap-6 h-[calc(100vh-250px)]">
            <RackList
                racks={racks}
                onSelectRack={handleSelectRack}
                onNewRack={() => setIsNewRackModalOpen(true)}
                onDeleteRack={handleDeleteRack}
                onUpdateRack={handleUpdateRack}
                selectedRackId={selectedRackId}
            />
            <div className="flex-grow overflow-x-auto pb-4 flex justify-center gap-8">
                {activeRack ? (
                    <>
                        <RackComponent
                            key={`${activeRack.id}-front`}
                            rack={activeRack}
                            view="front"
                            onDrop={handleDrop}
                            onDelete={handleDeleteEquipmentOnRack}
                            onDragStart={(e, item) => handleDragStart(e, item, false)}
                            draggedItem={draggedItem}
                        />
                        <RackComponent
                            key={`${activeRack.id}-rear`}
                            rack={activeRack}
                            view="rear"
                            onDrop={handleDrop}
                            onDelete={handleDeleteEquipmentOnRack}
                            onDragStart={(e, item) => handleDragStart(e, item, false)}
                            draggedItem={draggedItem}
                        />
                    </>
                ) : (
                    <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-500">
                        <HardDrive size={48} className="mb-4" />
                        <h3 className="text-lg font-bold">No Racks in Show</h3>
                        <p>Create a new rack to begin building your show.</p>
                    </div>
                )}
            </div>
            <div className="w-80 flex-shrink-0 bg-gray-800 p-3 rounded-xl flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Library</h2>
                    <button onClick={() => setIsNewEquipModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400">
                        <Plus size={16} /> New
                    </button>
                </div>
                <div className="flex-grow overflow-y-auto pr-2">
                    <UserTreeView library={library} onContextMenu={handleContextMenu} onDragStart={(e, item) => handleDragStart(e, item, true)} />
                </div>
                <div className="pt-4 border-t border-gray-700">
                    <button onClick={() => setIsRackLibraryOpen(true)} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600">
                        <Library size={16} /> Load from Rack Library
                    </button>
                </div>
            </div>
            
            {contextMenu && (
                <div className="absolute z-50 bg-gray-800 border border-gray-700 rounded-md shadow-lg p-2 text-white" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    {contextMenu.item.is_default && (
                        <button onClick={handleCopyToLibrary} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700 rounded">
                             Copy to My Library
                        </button>
                    )}
                </div>
            )}
            
            <NewRackModal isOpen={isNewRackModalOpen} onClose={() => setIsNewRackModalOpen(false)} onSubmit={handleCreateRack} />
            <NewUserEquipmentModal isOpen={isNewEquipModalOpen} onClose={() => setIsNewEquipModalOpen(false)} onSubmit={handleCreateUserEquipment} userFolderTree={userFolderTree} />
            <RackLibraryModal isOpen={isRackLibraryOpen} onClose={() => setIsRackLibraryOpen(false)} onRackLoad={handleLoadRackFromLibrary} />
        </div>
    );
};

export default RackBuilderView;