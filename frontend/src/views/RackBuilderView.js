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

    const fetchData = useCallback(async () => {
        try {
            const [fullLibrary, racksData] = await Promise.all([
                api.getLibrary(),
                api.getRacksForShow(showName)
            ]);

            setLibrary(fullLibrary || { folders: [], equipment: [] });
            setRacks(racksData);

            if (selectedRackId) {
                const detailedRack = await api.getRackDetails(selectedRackId);
                setActiveRack(detailedRack);
            } else if (racksData.length > 0) {
                const initialRackId = racksData[0].id;
                setSelectedRackId(initialRackId);
                const detailedRack = await api.getRackDetails(initialRackId);
                setActiveRack(detailedRack);
            } else {
                setActiveRack(null);
            }

        } catch (error) {
            console.error("Failed to fetch user library:", error);
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

    const handleSelectRack = (rackId) => {
        setSelectedRackId(rackId);
    };

    const handleCreateRack = async (rackData) => {
        try {
            const newRack = await api.createRack({ rack_name: rackData.rackName, ru_height: parseInt(rackData.ruHeight, 10), show_name: showName });
            await fetchData();
            setSelectedRackId(newRack.id);
        } catch (error) {
            console.error("Failed to create rack for show:", error);
            alert(`Error: ${error.message}`);
        }
        setIsNewRackModalOpen(false);
    };

    const handleDeleteRack = async (rackId) => {
        if (!window.confirm("Are you sure you want to delete this rack template?")) return;
        try {
            await api.deleteRack(rackId);
            fetchData();
        } catch (error) {
            console.error("Failed to delete rack:", error);
            alert(`Error: ${error.message}`);
        }
    };

    const handleUpdateRack = async (rackId, rackData) => {
        try {
            await api.updateRack(rackId, rackData);
            fetchData();
        } catch (error) {
            console.error("Failed to update rack:", error)
            alert(`Error: ${error.message}`);
        }
    };

    const handleCreateUserEquipment = async (equipmentData) => {
        try {
            await api.createUserEquipment(equipmentData);
            fetchData();
        } catch (error) {
            console.error("Failed to create user equipment:", error);
            alert(`Error: ${error.message}`);
        }
        setIsNewEquipModalOpen(false);
    };
    
    const handleLoadRackFromLibrary = async (templateRackId) => {
        try {
            await api.copyRackFromLibrary(templateRackId, showName);
            fetchData();
        } catch (error) {
            console.error("Failed to load rack from library:", error);
            alert(`Error: ${error.message}`);
        }
        setIsRackLibraryOpen(false);
    };

    const handleAddEquipment = async (item, ru_position, rack_side) => {
        if (!activeRack) return;
        const payload = {
            template_id: item.id,
            ru_position,
            rack_side,
        };
        try {
            await api.addEquipmentToRack(activeRack.id, payload);
            await fetchData();
        } catch (error) {
            console.error("Failed to add equipment to rack", error);
            alert(`Error: ${error.message || 'Could not add equipment.'}`);
        }
    };

    const handleMoveEquipment = async (item, new_ru_position, rack_side) => {
        if (!activeRack) return;
        const payload = {
            ru_position: new_ru_position,
            rack_side,
        };
        try {
            await api.updateEquipmentInstance(item.id, payload);
            await fetchData();
        } catch (error) {
            console.error("Failed to move equipment", error);
            alert(`Error: ${error.message || 'Could not move equipment.'}`);
        }
    };
    
    const handleDeleteEquipment = async (instanceId) => {
        if (!activeRack || !window.confirm("Are you sure you want to remove this equipment?")) return;
        try {
            await api.deleteEquipmentFromRack(instanceId);
            await fetchData();
        } catch (error) {
            console.error("Failed to delete equipment:", error);
            alert(`Error: ${error.message}`);
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
            fetchData();
            alert(`${item.model_number} copied to your library!`);
        } catch (error) {
            console.error("Failed to copy equipment:", error);
            alert(`Error: ${error.message}`);
        }
        setContextMenu(null);
    };

    const userFolders = useMemo(() => library.folders.filter(f => !f.is_default), [library.folders]);

    const userFolderTree = useMemo(() => {
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
    }, [userFolders]);

    if (isLoading) return <div className="p-8 text-center text-gray-400">Loading Rack Builder...</div>;

    return (
        <div className="flex justify-between h-[calc(100vh-250px)]">
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
                            onDragStart={(e, item) => handleDragStart(e, item, false)}
                            draggedItem={draggedItem}
                        />
                        <RackComponent
                            key={`${activeRack.id}-rear`}
                            rack={activeRack}
                            view="rear"
                            onDrop={handleDrop}
                            onDelete={handleDeleteEquipment}
                            onDragStart={(e, item) => handleDragStart(e, item, false)}
                            draggedItem={draggedItem}
                        />
                    </>
                ) : (
                    // Width is set to match two racks (350px * 2) plus the gap (32px)
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