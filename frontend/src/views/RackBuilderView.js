import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api/api';
import { Plus, Library, HardDrive } from 'lucide-react';
import UserTreeView from '../components/UserTreeView';
import RackList from '../components/RackList';
import NewRackModal from '../components/NewRackModal';
import NewUserEquipmentModal from '../components/NewUserEquipmentModal';
import RackLibraryModal from '../components/RackLibraryModal';
import RackComponent from '../components/RackComponent';
import toast, { Toaster } from 'react-hot-toast';
import { useShow } from '../contexts/ShowContext';

const RackBuilderView = () => {
    const { showName } = useShow();
    const [racks, setRacks] = useState([]);
    const [library, setLibrary] = useState({ folders: [], equipment: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isNewRackModalOpen, setIsNewRackModalOpen] = useState(false);
    const [isNewEquipModalOpen, setIsNewEquipModalOpen] = useState(false);
    const [isRackLibraryOpen, setIsRackLibraryOpen] = useState(false);
    const [selectedRackId, setSelectedRackId] = useState(null);
    const [activeRack, setActiveRack] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);
    const [dragOverData, setDragOverData] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [fullLibrary, racksData] = await Promise.all([
                api.getLibrary(),
                api.getRacksForShow(showName)
            ]);

            setLibrary(fullLibrary || { folders: [], equipment: [] });
            setRacks(racksData);

            const currentRackId = selectedRackId || (racksData.length > 0 ? racksData[0].id : null);

            if (currentRackId) {
                if (!selectedRackId) setSelectedRackId(currentRackId);
                const detailedRack = await api.getRackDetails(currentRackId);
                setActiveRack(detailedRack);
            } else {
                setActiveRack(null);
                setSelectedRackId(null);
            }
        } catch (error) {
            console.error("Failed to fetch data:", error);
            toast.error("Failed to load data.");
        } finally {
            setIsLoading(false);
        }
    }, [selectedRackId, showName]);

    useEffect(() => {
        fetchData();
        const handleClickOutside = () => setContextMenu(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, [fetchData]);

    const handleSelectRack = (rackId) => setSelectedRackId(rackId);

    const handleCreateRack = async (rackData) => {
        try {
            const newRack = await api.createRack({ rack_name: rackData.rackName, ru_height: parseInt(rackData.ruHeight, 10), show_name: showName });
            await fetchData();
            setSelectedRackId(newRack.id);
        } catch (error) {
            console.error("Failed to create rack:", error);
            toast.error(`Error: ${error.message}`);
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
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleUpdateRack = async (rackId, rackData) => {
        try {
            await api.updateRack(rackId, rackData);
            fetchData();
        } catch (error) {
            console.error("Failed to update rack:", error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleCreateUserEquipment = async (equipmentData) => {
        try {
            await api.createUserEquipment(equipmentData);
            fetchData();
        } catch (error) {
            console.error("Failed to create user equipment:", error);
            toast.error(`Error: ${error.message}`);
        }
        setIsNewEquipModalOpen(false);
    };

    const handleLoadRackFromLibrary = async (templateRackId) => {
        try {
            const newRack = await api.copyRackFromLibrary(templateRackId, showName);
            setRacks(prevRacks => [...prevRacks, newRack]);
            setSelectedRackId(newRack.id);
            setActiveRack(newRack);
            toast.success("Rack loaded successfully!");
        } catch (error) {
            console.error("Failed to load rack from library:", error);
            toast.error(`Error: ${error.message}`);
        }
        setIsRackLibraryOpen(false);
    };
    
    const handleDeleteEquipment = async (instanceId) => {
        if (!activeRack || !window.confirm("Are you sure you want to remove this equipment?")) return;
        try {
            await api.deleteEquipmentFromRack(instanceId);
            setActiveRack(currentRack => ({
                ...currentRack,
                equipment: currentRack.equipment.filter(item => item.id !== instanceId)
            }));
        } catch (error) {
            console.error("Failed to delete equipment:", error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const checkCollision = useCallback((rackData, itemToPlace, targetRu, targetSide) => {
        if (!rackData || !itemToPlace) return true;
    
        const itemTemplate = itemToPlace.isNew ? itemToPlace.item : itemToPlace.item.equipment_templates;
        if (!itemTemplate) return true;
    
        const start_new = targetRu;
        const end_new = targetRu + itemTemplate.ru_height - 1;
    
        if (start_new < 1 || end_new > rackData.ru_height) {
            return true;
        }
    
        const isNewFullWidth = itemTemplate.width !== 'half';
        const newFace = targetSide.split('-')[0];
    
        for (const existingItem of rackData.equipment) {
            if (!itemToPlace.isNew && itemToPlace.item.id === existingItem.id) {
                continue;
            }
    
            const existingTemplate = existingItem.equipment_templates;
            if (!existingTemplate) continue;

            if (!existingItem.rack_side || typeof existingItem.rack_side !== 'string') {
                continue;
            }

            const existingFace = existingItem.rack_side.trim().split('-')[0];

            if (newFace !== existingFace) {
                continue;
            }

            const start_existing = existingItem.ru_position;
            const end_existing = start_existing + existingTemplate.ru_height - 1;
            const ruOverlap = start_new <= end_existing && end_new >= start_existing;

            if (!ruOverlap) {
                continue;
            }

            const isExistingFullWidth = existingTemplate.width !== 'half';

            if (isNewFullWidth) {
                return true;
            }

            if (isExistingFullWidth) {
                return true;
            }

            if (existingItem.rack_side === targetSide) {
                return true;
            }
        }
    
        return false;
    }, []);

    const handleDragStart = (e, item, isNew = false) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ isNew, item }));
        setDraggedItem({ isNew, item });
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const cleanup = () => {
            setDraggedItem(null);
            setDragOverData(null);
        };

        if (!draggedItem || !dragOverData || !activeRack || dragOverData.rackId !== activeRack.id) {
            cleanup();
            return;
        }

        const { ru, side } = dragOverData;

        if (checkCollision(activeRack, draggedItem, ru, side)) {
            toast.error("Placement overlaps with existing equipment or is out of bounds.");
            cleanup();
            return;
        }

        const itemTemplate = draggedItem.isNew ? draggedItem.item : draggedItem.item.equipment_templates;
        if (!itemTemplate) {
            cleanup();
            return;
        }
        const isFullWidth = itemTemplate.width !== 'half';
        const finalSide = isFullWidth ? side.replace(/-left|-right/g, '') : side;
        
        if (draggedItem.isNew) {
            const optimisticId = `optimistic-${Date.now()}`;
            const optimisticItem = {
                id: optimisticId,
                rack_id: activeRack.id,
                ru_position: ru,
                rack_side: finalSide,
                instance_name: `${draggedItem.item.model_number}`,
                equipment_templates: { ...itemTemplate },
            };

            setActiveRack(currentRack => ({
                ...currentRack,
                equipment: [...currentRack.equipment, optimisticItem]
            }));
            
            const payload = { template_id: draggedItem.item.id, ru_position: ru, rack_side: finalSide };
            api.addEquipmentToRack(activeRack.id, payload)
               .then(newlyAddedItem => {
                    const finalNewItem = { ...newlyAddedItem };
                    if (finalNewItem.equipment_templates) {
                        if (!finalNewItem.equipment_templates.width && itemTemplate.width) {
                            finalNewItem.equipment_templates.width = itemTemplate.width;
                        }
                    } else {
                        finalNewItem.equipment_templates = itemTemplate;
                    }

                    setActiveRack(currentRack => ({
                        ...currentRack,
                        equipment: currentRack.equipment.map(item => 
                            item.id === optimisticId ? finalNewItem : item
                        )
                    }));
               })
               .catch(err => {
                    toast.error(`Error adding equipment: ${err.message}`);
                    setActiveRack(currentRack => ({
                        ...currentRack,
                        equipment: currentRack.equipment.filter(item => item.id !== optimisticId)
                    }));
               });
        } else {
            const originalEquipmentState = activeRack.equipment;
            const movedItemId = draggedItem.item.id;
            const originalItem = originalEquipmentState.find(i => i.id === movedItemId);

            const updatedEquipment = originalEquipmentState.map(equip =>
                equip.id === movedItemId ? { ...equip, ru_position: ru, rack_side: finalSide } : equip
            );
            
            setActiveRack({ ...activeRack, equipment: updatedEquipment });

            const payload = { ru_position: ru, rack_side: finalSide };
            api.updateEquipmentInstance(movedItemId, payload)
                .then(updatedInstanceFromServer => {
                    const finalInstance = {
                        ...originalItem,
                        ...updatedInstanceFromServer 
                    };

                    setActiveRack(currentRack => ({
                        ...currentRack,
                        equipment: currentRack.equipment.map(item => 
                            item.id === movedItemId ? finalInstance : item
                        )
                    }));
                })
                .catch(err => {
                    toast.error(`Failed to save move: ${err.message}`);
                    setActiveRack({ ...activeRack, equipment: originalEquipmentState });
                });
        }
        
        cleanup();
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDragOverData(null);
    };

    const handleContextMenu = (e, item) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, item: item });
    };

    const handleCopyToLibrary = async () => {
        if (!contextMenu) return;
        try {
            await api.copyEquipmentToLibrary({ template_id: contextMenu.item.id, folder_id: null });
            fetchData();
            toast.success(`${contextMenu.item.model_number} copied to your library!`);
        } catch (error) {
            console.error("Failed to copy equipment:", error);
            toast.error(`Error: ${error.message}`);
        }
        setContextMenu(null);
    };
    
    const userFolderTree = useMemo(() => {
        if (!library.folders) return [];
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

    if (isLoading) return <div className="p-8 text-center text-gray-400">Loading Rack Builder...</div>;

    return (
        <div className="flex justify-between h-[calc(100vh-250px)]" onDragEnd={handleDragEnd}>
            <Toaster position="bottom-center" />
            <RackList
                racks={racks}
                onSelectRack={handleSelectRack}
                onNewRack={() => setIsNewRackModalOpen(true)}
                onDeleteRack={handleDeleteRack}
                onUpdateRack={handleUpdateRack}
                selectedRackId={selectedRackId}
                showName={showName}
            />
            <div className="overflow-x-auto pb-4 flex justify-center gap-8">
                {activeRack ? (
                    <>
                        <RackComponent
                            key={`${activeRack.id}-front`}
                            rack={activeRack}
                            view="front"
                            onDrop={handleDrop}
                            onDelete={handleDeleteEquipment}
                            onDragStart={handleDragStart}
                            draggedItem={draggedItem}
                            dragOverData={dragOverData}
                            onDragOverRack={setDragOverData}
                        />
                        <RackComponent
                            key={`${activeRack.id}-rear`}
                            rack={activeRack}
                            view="rear"
                            onDrop={handleDrop}
                            onDelete={handleDeleteEquipment}
                            onDragStart={handleDragStart}
                            draggedItem={draggedItem}
                            dragOverData={dragOverData}
                            onDragOverRack={setDragOverData}
                        />
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center text-center text-gray-500 w-[732px]">
                        <HardDrive size={48} className="mb-4" />
                        <h3 className="text-lg font-bold">No Rack Selected</h3>
                        <p>Select a rack from the left panel to begin, or create a new one.</p>
                    </div>
                )}
            </div>
            <div className="w-72 flex-shrink-0 bg-gray-800 p-3 rounded-xl flex flex-col">
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