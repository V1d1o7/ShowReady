import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api/api';
import { Plus, HardDrive, PanelLeftOpen } from 'lucide-react';
import UserTreeView from '../components/UserTreeView';
import RackList from '../components/RackList';
import NewRackModal from '../components/NewRackModal';
import ContextualNotesDrawer from '../components/ContextualNotesDrawer';
import NewUserEquipmentModal from '../components/NewUserEquipmentModal';
import RackLibraryModal from '../components/RackLibraryModal';
import NamePromptModal from '../components/NamePromptModal';
import RackComponent from '../components/RackComponent';
import RackPdfModal from '../components/RackPdfModal';
import PdfPreviewModal from '../components/PdfPreviewModal';
import toast, { Toaster } from 'react-hot-toast';
import { useShow } from '../contexts/ShowContext';
import ConfirmationModal from '../components/ConfirmationModal';
import { useAuth } from '../contexts/AuthContext';

const RackBuilderView = () => {
    const { showId, showData, showOwnerId } = useShow();
    const { user, profile } = useAuth();
    const showName = showData?.info?.show_name;
    const [racks, setRacks] = useState([]);
    const [library, setLibrary] = useState({ folders: [], equipment: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isNewRackModalOpen, setIsNewRackModalOpen] = useState(false);
    const [isNewEquipModalOpen, setIsNewEquipModalOpen] = useState(false);
    const [isRackLibraryOpen, setIsRackLibraryOpen] = useState(false);
    const [isRackPdfModalOpen, setIsRackPdfModalOpen] = useState(false);
    const [isNamePromptOpen, setIsNamePromptOpen] = useState(false);
    const [rackToCopy, setRackToCopy] = useState(null);
    const [selectedRackId, setSelectedRackId] = useState(null);
    const [activeRack, setActiveRack] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);
    const [dragOverData, setDragOverData] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [confirmationModal, setConfirmationModal] = useState({ isOpen: false, message: '', onConfirm: () => {} });
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [pdfPreview, setPdfPreview] = useState({ isOpen: false, url: '' });
    const [isNotesDrawerOpen, setIsNotesDrawerOpen] = useState(false);
    const [notesContext, setNotesContext] = useState({ entityType: null, entityId: null });

    const openNotesDrawer = (entityType, entityId) => {
        setNotesContext({ entityType, entityId });
        setIsNotesDrawerOpen(true);
    };

    const handleExportListPdf = async () => {
        if (!showId) return;
        toast.loading('Generating Equipment List PDF...');
        try {
            const pdfBlob = await api.exportRacksListPdf(showId);
            const url = window.URL.createObjectURL(pdfBlob);
            setPdfPreview({ isOpen: true, url: url });
            toast.dismiss();
        } catch (error) {
            console.error("Failed to generate equipment list PDF:", error);
            toast.dismiss();
            toast.error(`Failed to generate PDF: ${error.message}`);
        }
    };

    // Fetch initial library and rack list on mount
    useEffect(() => {
        const fetchInitialData = async () => {
            if (!showId) return;
            setIsLoading(true);
            try {
                const [fullLibrary, racksData] = await Promise.all([
                    api.getLibrary(),
                    api.getRacksForShow(showId)
                ]);
                setLibrary(fullLibrary || { folders: [], equipment: [] });
                setRacks(racksData);
                if (racksData.length > 0 && !selectedRackId) {
                    setSelectedRackId(racksData[0].id);
                }
            } catch (error) {
                console.error("Failed to fetch initial data:", error);
                toast.error("Failed to load initial data.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchInitialData();
    }, [showId]);

    // Fetch details for the selected rack when it changes
    useEffect(() => {
        const fetchActiveRack = async () => {
            if (selectedRackId) {
                try {
                    // Do not set loading for rack switches, it's jarring
                    // setIsLoading(true); 
                    const detailedRack = await api.getRackDetails(selectedRackId);
                    setActiveRack(detailedRack);
                } catch (error) {
                    console.error("Failed to fetch active rack:", error);
                    toast.error("Failed to load selected rack.");
                    // If the selected rack is not found, clear it
                    if (error.message.includes("Not Found")) {
                        setActiveRack(null);
                        setSelectedRackId(null);
                    }
                } finally {
                    // setIsLoading(false);
                }
            } else {
                setActiveRack(null);
            }
        };
        fetchActiveRack();
    }, [selectedRackId]);

    const fetchData = useCallback(async () => {
        if (!showId) return;
        try {
            const racksData = await api.getRacksForShow(showId);
            setRacks(racksData);
            if (!selectedRackId && racksData.length > 0) {
                setSelectedRackId(racksData[0].id);
            }
        } catch (error) {
            console.error("Failed to refresh racks:", error);
        }
    }, [showId, selectedRackId]);
	
    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const handleSelectRack = (rackId) => setSelectedRackId(rackId);

    const handleCreateRack = async (rackData) => {
        try {
            const newRack = await api.createRack({ rack_name: rackData.rackName, ru_height: parseInt(rackData.ruHeight, 10), show_id: showId });
            await fetchData();
            setSelectedRackId(newRack.id);
        } catch (error) {
            console.error("Failed to create rack:", error);
            toast.error(`Error: ${error.message}`);
        }
        setIsNewRackModalOpen(false);
    };
    
    const handleDeleteRack = (rackId) => {
        setConfirmationModal({
            isOpen: true,
            message: "Are you sure you want to delete this rack? This action cannot be undone.",
            onConfirm: async () => {
                try {
                    await api.deleteRack(rackId);
                    
                    const newRacks = racks.filter(r => r.id !== rackId);
                    setRacks(newRacks);

                    if (selectedRackId === rackId) {
                        const newSelectedId = newRacks.length > 0 ? newRacks[0].id : null;
                        setSelectedRackId(newSelectedId);
                        if (newSelectedId) {
                            const detailedRack = await api.getRackDetails(newSelectedId);
                            setActiveRack(detailedRack);
                        } else {
                            setActiveRack(null);
                        }
                    }
                    
                    toast.success("Rack deleted successfully.");
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                } catch (error) {
                    console.error("Failed to delete rack:", error);
                    toast.error(`Error: ${error.message}`);
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                }
            }
        });
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

    const handleUpdateEquipmentInstance = async (instanceId, updatedData) => {
        try {
            const updatedInstance = await api.updateEquipmentInstance(instanceId, updatedData);
            setActiveRack(currentRack => ({
                ...currentRack,
                equipment: currentRack.equipment.map(item =>
                    item.id === instanceId ? { ...item, ...updatedInstance } : item
                )
            }));
            toast.success("Equipment updated successfully!");
        } catch (error) {
            console.error("Failed to update equipment:", error);
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

    const handleLoadRackFromLibrary = (templateRack) => {
        setIsRackLibraryOpen(false);
        setRackToCopy(templateRack);
        setIsNamePromptOpen(true);
    };

    const handleConfirmCopyRack = async (newName) => {
        if (!rackToCopy) return;
        try {
            const newRack = await api.copyRackFromLibrary(rackToCopy.id, showId, newName);
            setRacks(prevRacks => [...prevRacks, newRack]);
            setSelectedRackId(newRack.id);
            setActiveRack(newRack);
            toast.success("Rack loaded successfully!");
        } catch (error) {
            console.error("Failed to load rack from library:", error);
            toast.error(`Error: ${error.message}`);
        }
        setIsNamePromptOpen(false);
        setRackToCopy(null);
    };

    const handleGenerateRackPdf = async ({ pageSize }) => {
        toast.loading('Generating PDF...');
        try {
            const detailedRacks = await api.getDetailedRacksForShow(showId);
            
            const payload = {
                racks: detailedRacks,
                show_name: showName,
                page_size: pageSize,
            };

            const pdfBlob = await api.generateRacksPdf(payload);
            const url = window.URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${showName}-racks.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            toast.dismiss();
            toast.success('PDF generated successfully!');
        } catch (err) {
            console.error("Failed to generate PDF:", err);
            toast.dismiss();
            toast.error(`Failed to generate PDF: ${err.message}`);
        } finally {
            setIsRackPdfModalOpen(false);
        }
    };
    
    const handleDeleteEquipment = (instanceId) => {
        setConfirmationModal({
            isOpen: true,
            message: "Are you sure you want to remove this equipment from the rack?",
            onConfirm: async () => {
                try {
                    await api.deleteEquipmentFromRack(instanceId);
                    setActiveRack(currentRack => ({
                        ...currentRack,
                        equipment: currentRack.equipment.filter(item => item.id !== instanceId)
                    }));
                    toast.success("Equipment removed successfully.");
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                } catch (error) {
                    console.error("Failed to delete equipment:", error);
                    toast.error(`Error: ${error.message}`);
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                }
            }
        });
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
        <div className="flex flex-row gap-8 h-full" onDragEnd={handleDragEnd}>
            <Toaster position="bottom-center" />
            
            {isSidebarCollapsed ? (
                <div className="p-2">
                    <button onClick={() => setIsSidebarCollapsed(false)} className="p-2 text-gray-400 hover:text-amber-400">
                        <PanelLeftOpen size={20} />
                    </button>
                </div>
            ) : (
                <RackList
                    racks={racks}
                    onSelectRack={handleSelectRack}
                    onNewRack={() => setIsNewRackModalOpen(true)}
                    onDeleteRack={handleDeleteRack}
                    onUpdateRack={handleUpdateRack}
                    selectedRackId={selectedRackId}
                    onLoadFromRackLibrary={() => setIsRackLibraryOpen(true)}
                    onExportPdf={() => setIsRackPdfModalOpen(true)}
                    onExportEquipmentList={handleExportListPdf}
                    title="Show Racks"
                    onCollapse={() => setIsSidebarCollapsed(true)}
                    onOpenNotes={profile?.permitted_features?.includes('contextual_notes') ? (rackId) => openNotesDrawer('rack', rackId) : undefined}
                />
            )}

            <div className="flex-grow overflow-auto pb-4">
                <div className="flex justify-center gap-8">
                    {activeRack ? (
                        <>
                            <RackComponent
                                key={`${activeRack.id}-front`}
                                rack={activeRack}
                                view="front"
                                onDrop={handleDrop}
                                onDelete={handleDeleteEquipment}
                                onUpdate={handleUpdateEquipmentInstance}
                                onDragStart={handleDragStart}
                                draggedItem={draggedItem}
                                dragOverData={dragOverData}
                                onDragOverRack={setDragOverData}
                                onOpenNotes={profile?.permitted_features?.includes('contextual_notes') ? openNotesDrawer : undefined}
                            />
                            <RackComponent
                                key={`${activeRack.id}-rear`}
                                rack={activeRack}
                                view="rear"
                                onDrop={handleDrop}
                                onDelete={handleDeleteEquipment}
                                onUpdate={handleUpdateEquipmentInstance}
                                onDragStart={handleDragStart}
                                draggedItem={draggedItem}
                                dragOverData={dragOverData}
                                onDragOverRack={setDragOverData}
                                onOpenNotes={profile?.permitted_features?.includes('contextual_notes') ? openNotesDrawer : undefined}
                            />
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center text-gray-500 w-full h-full">
                            <HardDrive size={48} className="mb-4" />
                            <h3 className="text-lg font-bold">No Rack Selected</h3>
                            <p>Select a rack from the left panel to begin, or create a new one.</p>
                        </div>
                    )}
                </div>
            </div>
            <div className="w-72 flex-shrink-0 bg-gray-800 p-3 rounded-xl flex flex-col">
                <div className="flex-shrink-0 flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Library</h2>
                    <button onClick={() => setIsNewEquipModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400">
                        <Plus size={16} /> New
                    </button>
                </div>
                <div className="flex-grow min-h-0 overflow-y-auto pr-2">
                    <UserTreeView library={library} onDragStart={(e, item) => handleDragStart(e, item, true)} />
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
            <RackPdfModal isOpen={isRackPdfModalOpen} onClose={() => setIsRackPdfModalOpen(false)} onGenerate={handleGenerateRackPdf} />
            <NamePromptModal
                isOpen={isNamePromptOpen}
                onClose={() => {
                    setIsNamePromptOpen(false);
                    setRackToCopy(null);
                }}
                onSubmit={handleConfirmCopyRack}
                title="Name New Rack"
                initialValue={rackToCopy ? `${rackToCopy.rack_name} (Copy)` : ''}
            />
            {confirmationModal.isOpen && (
                <ConfirmationModal
                    message={confirmationModal.message}
                    onConfirm={confirmationModal.onConfirm}
                    onCancel={() => setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} })}
                />
            )}
            {pdfPreview.isOpen && (
                <PdfPreviewModal
                    url={pdfPreview.url}
                    onClose={() => {
                        window.URL.revokeObjectURL(pdfPreview.url);
                        setPdfPreview({ isOpen: false, url: '' });
                    }}
                />
            )}
            <ContextualNotesDrawer
                entityType={notesContext.entityType}
                entityId={notesContext.entityId}
                showId={showId}
                isOpen={isNotesDrawerOpen}
                onClose={() => setIsNotesDrawerOpen(false)}
                isOwner={showOwnerId === user?.id}
            />
        </div>
    );
};

export default RackBuilderView;

