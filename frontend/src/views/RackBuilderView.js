import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { api } from '../api/api';
import RackComponent from '../components/RackComponent';
import NewRackModal from '../components/NewRackModal';
import { Plus, Library } from 'lucide-react';
import TreeView from './TreeView';
import NewUserEquipmentModal from '../components/NewUserEquipmentModal';
import RackLibraryModal from '../components/RackLibraryModal';

const RackBuilderView = ({ showName }) => {
    const [racks, setRacks] = useState([]);
    const [library, setLibrary] = useState({ folders: [], equipment: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [activeDragItem, setActiveDragItem] = useState(null);
    const [isNewRackModalOpen, setIsNewRackModalOpen] = useState(false);
    const [isNewEquipModalOpen, setIsNewEquipModalOpen] = useState(false);
    const [isRackLibraryOpen, setIsRackLibraryOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);
    const sensors = useSensors(useSensor(PointerSensor));

    const fetchData = useCallback(async () => {
        // Don't set loading to true on refetch, just on initial load
        try {
            const [racksData, libraryData] = await Promise.all([
                api.getRacksForShow(showName),
                api.getLibrary()
            ]);
            setRacks(racksData);
            setLibrary(libraryData);
        } catch (error) {
            console.error("Failed to fetch rack builder data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [showName]);

    useEffect(() => {
        fetchData();
        const handleClickOutside = () => setContextMenu(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, [fetchData]);

    const handleCreateRack = async (rackData) => {
        try {
            await api.createRack({ ...rackData, ru_height: parseInt(rackData.ruHeight, 10), show_name: showName });
            fetchData();
        } catch (error) {
            console.error("Failed to create rack:", error);
            alert(`Error: ${error.message}`);
        }
        setIsNewRackModalOpen(false);
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
            await api.loadRackFromLibrary({ template_rack_id: templateRackId, show_name: showName });
            fetchData();
        } catch (error) {
            console.error("Failed to load rack from library:", error);
            alert(`Error: ${error.message}`);
        }
        setIsRackLibraryOpen(false);
    };
    
    const handleDragStart = (event) => {
        setActiveDragItem(event.active.data.current);
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setActiveDragItem(null);

        if (!over || !over.data.current) return;

        const draggedData = active.data.current;
        const dropData = over.data.current;

        if (draggedData.type === 'library-item') {
            try {
                await api.addEquipmentToRack(dropData.rackId, {
                    template_id: draggedData.item.id,
                    ru_position: dropData.ruPosition,
                    rack_side: dropData.side
                });
                fetchData();
            } catch (error) {
                console.error("Failed to add equipment:", error);
                alert(`Error adding equipment: ${error.message}`);
            }
        }
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

    const unifiedTree = useMemo(() => {
        const showReadyRoot = { id: 'showready-root', name: 'ShowReady Library', children: [] };
        const userRoot = { id: 'user-root', name: 'My Library', children: [] };
        const itemsById = {};

        [...library.folders, ...library.equipment].forEach(item => {
            itemsById[item.id] = { ...item, children: [] };
        });

        Object.values(itemsById).forEach(item => {
            const parentId = item.parent_id || item.folder_id;
            if (parentId && itemsById[parentId]) {
                itemsById[parentId].children.push(item);
            } else {
                if (item.is_default) {
                    showReadyRoot.children.push(item);
                } else {
                    userRoot.children.push(item);
                }
            }
        });
        return [showReadyRoot, userRoot];
    }, [library]);

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

    if (isLoading) return <div className="p-8 text-center text-gray-400">Loading Rack Builder...</div>;

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex h-[calc(100vh-220px)] gap-6">
                <div className="w-80 flex flex-col bg-gray-800/50 p-4 rounded-xl">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-white">Library</h2>
                        <button onClick={() => setIsNewEquipModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400">
                            <Plus size={16} /> New
                        </button>
                    </div>
                    <div className="flex-grow overflow-y-auto pr-2">
                        <TreeView treeData={unifiedTree} onContextMenu={handleContextMenu} />
                    </div>
                    <div className="pt-4 border-t border-gray-700">
                         <button onClick={() => setIsRackLibraryOpen(true)} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600">
                            <Library size={16} /> Load from Rack Library
                        </button>
                    </div>
                </div>

                <div className="flex-grow flex gap-6 overflow-x-auto pb-4">
                    {racks.map(rack => (
                        <RackComponent key={rack.id} rack={rack} onUpdate={fetchData} />
                    ))}
                    <div className="flex-shrink-0">
                        <button onClick={() => setIsNewRackModalOpen(true)} className="w-48 h-full flex flex-col items-center justify-center bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-600 hover:border-amber-500 hover:bg-gray-800 transition-colors">
                            <Plus size={48} className="text-gray-500 mb-2" />
                            <span className="font-bold text-white">Add New Rack</span>
                        </button>
                    </div>
                </div>
            </div>

            <DragOverlay>
                {activeDragItem && (
                    <div className="bg-gray-700 p-2 rounded-md text-sm shadow-lg pointer-events-none">
                        {activeDragItem.item.model_number || activeDragItem.item.name}
                    </div>
                )}
            </DragOverlay>

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
        </DndContext>
    );
};

export default RackBuilderView;
