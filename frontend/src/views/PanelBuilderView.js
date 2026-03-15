import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { Search, Download, FolderPlus, FilePlus, ZoomIn, ZoomOut, Maximize, HardDrive, Edit, Trash2 } from 'lucide-react';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import ConfirmationModal from '../components/ConfirmationModal';
import PdfPreviewModal from '../components/PdfPreviewModal';
import toast, { Toaster } from 'react-hot-toast';

import PeDroppableSlot from '../components/panel/PeDroppableSlot';
import PanelLabelModal from '../components/panel/PanelLabelModal';
import PanelFolderModal from '../components/panel/PanelFolderModal';
import PanelTemplateModal from '../components/panel/PanelTemplateModal';
import PanelTreeView from '../components/panel/PanelTreeView';
import ConnectorFace from '../components/panel/ConnectorFace';
import useHotkeys from '../hooks/useHotkeys';

const findInstanceById = (instances, id) => {
    for (const inst of instances) {
        if (inst.id === id) return inst;
        if (inst.children && inst.children.length > 0) {
            const child = findInstanceById(inst.children, id);
            if (child) return child;
        }
    }
    return null;
};

const PanelBuilderView = () => {
    const { showId, isLoading: isShowLoading } = useShow();
    const [racks, setRacks] = useState([]);
    const [selectedPanel, setSelectedPanel] = useState(null);
    const [peLibrary, setPeLibrary] = useState({ folders: [], templates: [] });
    const [panelInstances, setPanelInstances] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeDragItem, setActiveDragItem] = useState(null);
    const [selectedItemId, setSelectedItemId] = useState(null);
    
    const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
    const [editingInstance, setEditingInstance] = useState(null);
    const [pdfPreview, setPdfPreview] = useState({ isOpen: false, url: '' }); 
    
    const [zoomLevel, setZoomLevel] = useState(1);

    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);

    const isAnyModalOpen = isLabelModalOpen || isFolderModalOpen || isTemplateModalOpen || pdfPreview.isOpen || itemToDelete !== null;

    useHotkeys({
        'e': () => {
            if (!isAnyModalOpen) handleExport();
        },
        'backspace': () => {
            if (!isAnyModalOpen && selectedItemId) handleRemoveInstance(selectedItemId);
        },
        'delete': () => {
            if (!isAnyModalOpen && selectedItemId) handleRemoveInstance(selectedItemId);
        },
        'l': () => {
            if (!isAnyModalOpen && selectedItemId) {
                const inst = findInstanceById(panelInstances, selectedItemId);
                if (inst) handleOpenLabelModal(inst);
            }
        },
        'escape': () => {
            // Close the top-most modal, or clear selection if no modals are open
            if (itemToDelete) {
                setItemToDelete(null);
            } else if (isLabelModalOpen) {
                setIsLabelModalOpen(false);
            } else if (isTemplateModalOpen) {
                setIsTemplateModalOpen(false);
            } else if (isFolderModalOpen) {
                setIsFolderModalOpen(false);
            } else if (pdfPreview.isOpen) {
                if (pdfPreview.url) window.URL.revokeObjectURL(pdfPreview.url);
                setPdfPreview({ isOpen: false, url: '' });
            } else if (selectedItemId) {
                setSelectedItemId(null);
            }
        }
    });

    const fetchData = useCallback(async () => {
        if (!showId) return;
        setIsLoading(true);
        try {
            const [folders, templates, detailedRacks] = await Promise.all([
                api.getPanelFolders(),
                api.getPanelTemplates(),
                api.getDetailedRacksForShow(showId)
            ]);
            setPeLibrary({ folders, templates });
            setRacks(detailedRacks || []);
        } catch (error) {
            console.error("Failed to load Panel Builder data:", error);
            toast.error("Failed to load Panel Builder data.");
        } finally {
            setIsLoading(false);
        }
    }, [showId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (selectedPanel) {
            setZoomLevel(1);
            setSelectedItemId(null);
            const loadInstances = async () => {
                try {
                    const instances = await api.getPanelInstances(selectedPanel.id);
                    setPanelInstances(instances);
                } catch (error) {
                    toast.error("Failed to load panel contents.");
                }
            };
            loadInstances();
        }
    }, [selectedPanel]);

    const showPanels = useMemo(() => {
        const panels = [];
        (racks || []).forEach(rack => {
            (rack.equipment || []).forEach(instance => {
                if (instance.equipment_templates?.is_patch_panel) {
                    panels.push({
                        ...instance,
                        rack_name: rack.rack_name
                    });
                }
            });
        });
        return panels;
    }, [racks]);

    const handleCreateFolder = async (folderName) => {
        try {
            await api.createPanelFolder({ name: folderName });
            toast.success("Folder created.");
            fetchData();
            setIsFolderModalOpen(false);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleSaveTemplate = async (payload) => {
        const finalPayload = {
            ...payload,
            folder_id: payload.folder_id || null,
            width_units: parseFloat(payload.width_units) || 1.0,
            depth_in: parseFloat(payload.depth_in) || 0.0,
        };

        try {
            if (editingTemplate) {
                await api.updatePanelTemplate(editingTemplate.id, finalPayload);
                toast.success("Template updated.");
            } else {
                await api.createPanelTemplate(finalPayload);
                toast.success("Template created.");
            }
            fetchData();
            setIsTemplateModalOpen(false);
            setEditingTemplate(null);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleDeleteLibraryItem = async () => {
        if (!itemToDelete) return;
        try {
            if (itemToDelete.type === 'folder') {
                await api.deletePanelFolder(itemToDelete.id);
            } else {
                await api.deletePanelTemplate(itemToDelete.id);
            }
            toast.success("Item deleted.");
            fetchData();
            setItemToDelete(null);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleCopyTemplate = async (itemToCopy) => {
        try {
            const newTemplateData = {
                name: `${itemToCopy.name} (Copy)`,
                manufacturer: itemToCopy.manufacturer,
                model_number: itemToCopy.model_number,
                width_units: itemToCopy.width_units,
                depth_in: itemToCopy.depth_in,
                slot_type: itemToCopy.slot_type,
                visual_style: itemToCopy.visual_style || 'standard',
                panel_slots: itemToCopy.panel_slots.map(s => ({...s, id: crypto.randomUUID()})),
                folder_id: null 
            };
            await api.createPanelTemplate(newTemplateData);
            toast.success(`${itemToCopy.name} copied to your library!`);
            fetchData();
        } catch(error) {
            toast.error(error.message);
        }
    };

    const sensors = useSensors(useSensor(PointerSensor, {
        activationConstraint: { distance: 5 }
    }));

    const handleDragStart = (event) => {
        if (event.active && event.active.data.current) {
            setActiveDragItem(event.active.data.current.item);
        }
    };

    const handleDragEnd = async (event) => {
        setActiveDragItem(null);
        const { active, over } = event;
        if (!over || !selectedPanel) return;

        const template = active.data.current.item;
        const slot = over.data.current.slot;

        const requiredType = (slot.accepted_module_type || "").trim().toLowerCase();
        const providedType = (template.slot_type || "").trim().toLowerCase();

        if (requiredType && providedType && !requiredType.includes(providedType) && !providedType.includes(requiredType)) {
            const reqIsDhole = requiredType.includes('d-hole') || requiredType.includes('d_hole') || requiredType.includes('dhole') || requiredType.includes('d-series') || requiredType === 'd';
            const provIsDhole = providedType.includes('d-hole') || providedType.includes('d_hole') || providedType.includes('dhole') || providedType.includes('d-series') || providedType === 'd';
            
            if (!(reqIsDhole && provIsDhole)) {
                toast.error(`Compatibility error: This slot requires '${slot.accepted_module_type}'.`);
                return;
            }
        }

        try {
            const parentInstanceId = slot.parent_instance_id || null;

            await api.createPanelInstance({
                panel_instance_id: selectedPanel.id,
                template_id: template.id,
                parent_instance_id: parentInstanceId,
                slot_id: slot.id, 
                label: ''
            });

            const instances = await api.getPanelInstances(selectedPanel.id);
            setPanelInstances(instances);
            toast.success(`${template.name} mounted.`);
        } catch (error) {
            toast.error(`Mount failed: ${error.message}`);
        }
    };

    const handleRemoveInstance = async (instanceId) => {
        try {
            await api.deletePanelInstance(instanceId);
            const instances = await api.getPanelInstances(selectedPanel.id);
            setPanelInstances(instances);
            if (selectedItemId === instanceId) setSelectedItemId(null);
            toast.success("Removed from panel.");
        } catch (error) {
            toast.error("Failed to remove item.");
        }
    };

    const handleOpenLabelModal = (instance) => {
        setEditingInstance({ ...instance });
        setIsLabelModalOpen(true);
    };

    const handleSaveLabel = async (label) => {
        try {
            await api.updatePanelInstance(editingInstance.id, { label });
            const instances = await api.getPanelInstances(selectedPanel.id);
            setPanelInstances(instances);
            setIsLabelModalOpen(false);
            toast.success("Label updated.");
        } catch (error) {
            toast.error("Failed to update label.");
        }
    };

    const handleExport = async () => {
        if (!showId) return;
        const tid = toast.loading("Generating Panel Build Sheets...");
        try {
            const blob = await api.exportPanelsPdf(showId);
            const url = window.URL.createObjectURL(blob);
            setPdfPreview({ isOpen: true, url });
            toast.success("Export complete!", { id: tid });
        } catch (error) {
            toast.error(`Export failed: ${error.message}`, { id: tid });
        }
    };

    const checkIsDHole = (acceptedModuleType, slotName) => {
        const a = (acceptedModuleType || "").trim().toLowerCase();
        const n = (slotName || "").trim().toLowerCase();
        return a.includes('d-hole') || a.includes('d_hole') || a.includes('dhole') || a.includes('d-series') || a === 'd' ||
               n.includes('d-hole') || n.includes('d_hole') || n.includes('d hole');
    };

    const renderPEInstance = (instance, slot, labelPlacement = 'top') => {
        const template = instance.template;
        if (!template) return null;

        const isConnector = !template.panel_slots || template.panel_slots.length === 0;

        if (isConnector) {
            const isTop = labelPlacement === 'top';
            const isSelected = instance.id === selectedItemId;
            return (
                <div 
                    className={`absolute inset-0 z-10 flex items-center justify-center group pointer-events-auto cursor-pointer transition-all ${isSelected ? 'ring-2 ring-amber-500 rounded z-50' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedItemId(instance.id); }}
                >
                    <div className="relative flex items-center justify-center w-[34px] h-[41px]">
                        <ConnectorFace style={template.visual_style || 'standard'} />
                        
                        {instance.label && (
                            <div className={`absolute ${isTop ? '-top-3' : '-bottom-3'} left-1/2 -translate-x-1/2 w-[150%] flex justify-center z-20`} title={instance.label}>
                                <div className="bg-white text-black font-bold px-1 py-[1px] rounded shadow-sm text-[6px] truncate max-w-full border border-gray-400 leading-none">
                                    {instance.label}
                                </div>
                            </div>
                        )}
                        
                        <div className="absolute inset-0 w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 rounded z-[70] cursor-pointer">
                            <button onClick={(e) => { e.stopPropagation(); handleOpenLabelModal(instance); }} className="text-amber-400 hover:text-amber-300 p-1"><Edit size={14} /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleRemoveInstance(instance.id); }} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                        </div>
                    </div>
                </div>
            );
        }

        const slotCount = template.panel_slots.length;
        const isModule = !!template.slot_type || (template.model_number || "").toLowerCase().includes('ucp');
        const ruHeight = template.width_units >= 1 ? Math.round(template.width_units) : 1;

        let gridCols = 1;
        let gridRows = slotCount;

        if (!isModule) {
            gridRows = ruHeight;
            gridCols = Math.ceil(slotCount / gridRows);
        } else {
            if (slotCount <= 2) {
                gridCols = 1; 
                gridRows = slotCount;
            } else {
                gridCols = 2; 
                gridRows = Math.ceil(slotCount / 2);
            }
        }

        const templateModel = (template.model_number || "").trim().toLowerCase();
        const isSelected = instance.id === selectedItemId;

        return (
            <div 
                className={`absolute inset-0 z-10 bg-[#1e1e1e] shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] flex flex-col items-center group overflow-hidden cursor-pointer transition-all ${isSelected ? 'ring-2 ring-amber-500 border-amber-500 z-50' : 'border-x border-[#111]'}`}
                onClick={(e) => { e.stopPropagation(); setSelectedItemId(instance.id); }}
            >
                {/* Plate Screws */}
                {gridCols === 1 ? (
                    <>
                        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#0a0a0a] border border-[#333] shadow-sm"></div>
                        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#0a0a0a] border border-[#333] shadow-sm"></div>
                    </>
                ) : (
                    <>
                        <div className="absolute top-1.5 left-2 w-1.5 h-1.5 rounded-full bg-[#0a0a0a] border border-[#333] shadow-sm"></div>
                        <div className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-[#0a0a0a] border border-[#333] shadow-sm"></div>
                        <div className="absolute bottom-1.5 left-2 w-1.5 h-1.5 rounded-full bg-[#0a0a0a] border border-[#333] shadow-sm"></div>
                        <div className="absolute bottom-1.5 right-2 w-1.5 h-1.5 rounded-full bg-[#0a0a0a] border border-[#333] shadow-sm"></div>
                    </>
                )}

                {/* Upgraded Plate Label */}
                {instance.label && (
                    <div className="absolute top-1 w-full flex justify-center z-50 pointer-events-none">
                        <div className="bg-white text-black font-bold px-2 py-[2px] rounded shadow-sm text-[8px] truncate max-w-[90%] border border-gray-400 leading-none">
                            {instance.label}
                        </div>
                    </div>
                )}

                {/* Grid Pad adjusts dynamically if a plate label is present so components do not overlap */}
                <div 
                    className={`flex-grow w-full grid place-items-center gap-y-1 ${!isModule ? (instance.label ? 'px-8 pt-7 pb-4' : 'px-8 pt-2 pb-4') : (instance.label ? 'px-1 pt-7 pb-2' : 'px-1 py-1')} min-h-0`} 
                    style={{
                        gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`
                    }}
                >
                    {template.panel_slots.map((subSlot, idx) => {
                        const subSlotId = subSlot.id || subSlot.name || `${instance.id}-sub-${idx}`;
                        const normalizedSubSlot = { ...subSlot, id: subSlotId };
                        const child = (instance.children || []).find(c => c.slot_id === subSlotId);
                        
                        const isDHoleSubSlot = checkIsDHole(subSlot.accepted_module_type, subSlot.name);

                        const row = Math.floor(idx / gridCols);
                        let subLabelPlacement = 'top';

                        // Fixed collision logic: Single-hole plates ALWAYS put port labels at the bottom
                        if (slotCount === 1) {
                            subLabelPlacement = 'bottom';
                        } else if (isModule) {
                            if (slotCount === 2) {
                                subLabelPlacement = row === 0 ? 'top' : 'bottom';
                            } else if (slotCount === 3) {
                                subLabelPlacement = 'bottom';
                            } else if (slotCount >= 4) {
                                subLabelPlacement = row === 0 ? 'top' : 'bottom';
                            }
                        } else {
                            subLabelPlacement = row === 0 ? 'top' : 'bottom';
                        }

                        const isTopSub = subLabelPlacement === 'top';
                        // FIX: Corrected ternary output so top labels are at the top and bottom labels at the bottom
                        const emptyLabelPlacementClass = isTopSub ? '-top-4' : '-bottom-4';

                        return (
                            <div key={subSlotId} className="relative w-full h-full flex items-center justify-center min-h-0 min-w-0">
                                
                                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                                    {!child && (
                                        isDHoleSubSlot ? (
                                            <div className="relative flex items-center justify-center w-[34px] h-[41px]">
                                                <ConnectorFace style="empty" />
                                                <span className={`absolute ${emptyLabelPlacementClass} left-1/2 -translate-x-1/2 text-[5px] font-bold text-gray-500 px-1 text-center leading-tight truncate w-[150%]`}>
                                                    {subSlot.name || 'Empty'}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="relative flex items-center justify-center w-[34px] h-[41px] flex-shrink-0">
                                                <div className="w-[80%] h-[80%] flex flex-col justify-between items-center opacity-80 bg-[#050505] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] border border-[#333] rounded-sm py-1">
                                                    <div className="w-1 h-1 rounded-full bg-[#111] shadow-inner border border-[#222]"></div>
                                                    <div className="w-1 h-1 rounded-full bg-[#111] shadow-inner border border-[#222]"></div>
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                                
                                <div className="absolute inset-0 z-20 flex items-center justify-center">
                                    <PeDroppableSlot 
                                        slot={{ ...normalizedSubSlot, parent_instance_id: instance.id }} 
                                        isOccupied={!!child} 
                                        overlayClass={isDHoleSubSlot ? "w-[34px] h-[41px] rounded-full absolute" : "inset-0 rounded-sm absolute"}
                                        className="flex items-center justify-center w-full h-full"
                                    >
                                        {child ? renderPEInstance(child, normalizedSubSlot, subLabelPlacement) : (
                                            <div className={`opacity-0 hover:opacity-100 transition-opacity bg-white/10 flex items-center justify-center cursor-pointer ${isDHoleSubSlot ? 'w-[34px] h-[41px] rounded-full' : 'w-full h-full rounded'}`}>
                                            </div>
                                        )}
                                    </PeDroppableSlot>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {!isModule && (
                    <div className="absolute bottom-0.5 text-[7px] font-bold text-gray-400 text-center w-full truncate pointer-events-none">
                        {template.model_number || template.name}
                    </div>
                )}

                <div className="absolute top-0 right-0 p-0.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 rounded-bl z-[80]">
                    <button onClick={(e) => { e.stopPropagation(); handleOpenLabelModal(instance); }} className="text-amber-400 hover:text-amber-300 p-1"><Edit size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleRemoveInstance(instance.id); }} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                </div>
            </div>
        );
    };

    if (isShowLoading || isLoading) return <div className="p-8 text-center text-gray-400">Loading Panel Builder...</div>;

    const panelHeightPx = selectedPanel?.equipment_templates?.ru_height ? selectedPanel.equipment_templates.ru_height * 80 : 80;

    return (
        <div className="flex flex-row gap-8 h-full">
            <Toaster position="bottom-center" />
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                
                <div className="w-72 flex-shrink-0 bg-gray-800 p-3 rounded-xl flex flex-col z-20">
                    <div className="flex-shrink-0 flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-white">Show Panels</h2>
                    </div>
                    <div className="flex-grow min-h-0 overflow-y-auto pr-2 space-y-2">
                        {showPanels.length === 0 ? (
                            <p className="text-xs text-gray-500 italic text-center py-8">No panels found in racks.</p>
                        ) : (
                            showPanels.map(panel => (
                                <button
                                    key={panel.id}
                                    onClick={() => setSelectedPanel(panel)}
                                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                                        selectedPanel?.id === panel.id
                                            ? 'bg-amber-500 border-amber-400 text-black shadow-lg shadow-amber-500/20'
                                            : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-600'
                                    }`}
                                >
                                    <p className="font-bold text-sm truncate">{panel.instance_name}</p>
                                    <p className={`text-xs truncate ${selectedPanel?.id === panel.id ? 'text-black/70' : 'text-gray-400'}`}>
                                        {panel.rack_name} • {panel.equipment_templates?.model_number}
                                    </p>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                <div className="flex-grow min-w-0 flex flex-col items-center z-10">
                    {selectedPanel ? (
                        <div className="w-full h-full flex flex-col relative">
                            <div className="bg-gray-800 rounded-t-lg p-4 w-full flex justify-between items-center flex-shrink-0 shadow-lg relative z-20">
                                <div className="min-w-0 pr-4">
                                    <h3 className="text-lg font-bold text-white truncate">{selectedPanel.instance_name}</h3>
                                    <p className="text-xs text-gray-400 truncate">{selectedPanel.equipment_templates?.manufacturer} {selectedPanel.equipment_templates?.model_number} ({selectedPanel.rack_name})</p>
                                </div>
                                <div className="flex items-center gap-4 flex-shrink-0">
                                    <div className="flex items-center gap-1 bg-gray-700 rounded-lg p-1 border border-gray-600">
                                        <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.1))} className="p-1 hover:bg-gray-600 rounded text-gray-300 hover:text-white" title="Zoom Out">
                                            <ZoomOut size={16} />
                                        </button>
                                        <span className="text-xs text-gray-300 font-mono w-10 text-center select-none">{Math.round(zoomLevel * 100)}%</span>
                                        <button onClick={() => setZoomLevel(z => Math.min(3, z + 0.1))} className="p-1 hover:bg-gray-600 rounded text-gray-300 hover:text-white" title="Zoom In">
                                            <ZoomIn size={16} />
                                        </button>
                                        <button onClick={() => setZoomLevel(1)} className="p-1 hover:bg-gray-600 rounded text-gray-300 hover:text-white border-l border-gray-500 ml-1 pl-2" title="Reset Zoom">
                                            <Maximize size={16} />
                                        </button>
                                    </div>
                                    <button 
                                        onClick={handleExport}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-lg transition-colors shadow"
                                    >
                                        <Download size={16} /> Export
                                    </button>
                                </div>
                            </div>
                            
                            <div className="flex-grow relative w-full bg-gray-950/20" onClick={() => setSelectedItemId(null)}>
                                <div className="absolute inset-0 overflow-auto pt-8 pb-16 px-4">
                                    <div 
                                        style={{ 
                                            width: `${850 * zoomLevel}px`, 
                                            height: `${panelHeightPx * zoomLevel}px`,
                                            transition: 'width 0.2s ease-out, height 0.2s ease-out',
                                        }}
                                        className="relative mx-auto"
                                    >
                                        <div style={{
                                            width: '850px',
                                            height: `${panelHeightPx}px`,
                                            transform: `scale(${zoomLevel})`,
                                            transformOrigin: 'top left',
                                            position: 'absolute',
                                            top: 0,
                                            left: 0
                                        }}>
                                            <div className="relative w-full h-full rounded-sm shadow-2xl flex border border-[#1a1a1a]">
                                                <div className="w-10 flex-shrink-0 border-r border-[#1a1a1a] flex flex-col justify-around items-center bg-gradient-to-r from-[#333] to-[#2a2a2a]">
                                                    <div className="w-3.5 h-5 rounded-full bg-[#050505] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] border border-[#444]"></div>
                                                    <div className="w-3.5 h-5 rounded-full bg-[#050505] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] border border-[#444]"></div>
                                                </div>

                                                <div className="flex-grow relative flex flex-col min-w-0 bg-[#2a2a2a]">
                                                    <div className="h-3 w-full bg-gradient-to-b from-[#444] to-[#2a2a2a] border-b border-[#1a1a1a]"></div>
                                                    
                                                    <div className="flex-grow flex flex-row items-center justify-evenly px-1 w-full h-full overflow-visible">
                                                        {(selectedPanel.equipment_templates?.slots || []).map((slot, idx) => {
                                                            const slotId = slot.id || `${selectedPanel.id}-slot-${idx}`;
                                                            const normalizedSlot = { ...slot, id: slotId };
                                                            const instance = panelInstances.find(i => i.slot_id === slotId);

                                                            const isDHoleSlot = checkIsDHole(slot.accepted_module_type, slot.name);

                                                            return (
                                                                <div key={slotId} className={`flex-1 relative h-full min-w-0 flex items-center justify-center ${isDHoleSlot ? '' : 'border-x border-[#1a1a1a]'}`}>
                                                                    
                                                                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                                                                        {!instance && (
                                                                            isDHoleSlot ? (
                                                                                <div className="relative flex items-center justify-center w-[34px] h-[41px]">
                                                                                    <ConnectorFace style="empty" />
                                                                                    {/* Root panel empty labels placed at bottom so they aren't clipped */}
                                                                                    <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[5px] font-bold text-gray-500 px-1 text-center leading-tight truncate w-[150%]">{slot.name || 'Empty'}</span>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="relative flex items-center justify-center w-[34px] h-[41px] flex-shrink-0">
                                                                                    <div className="w-[80%] h-[80%] flex flex-col justify-between items-center opacity-80 bg-[#050505] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] border border-[#333] rounded-sm py-1">
                                                                                        <div className="w-1 h-1 rounded-full bg-[#111] shadow-inner border border-[#222]"></div>
                                                                                        <div className="w-1 h-1 rounded-full bg-[#111] shadow-inner border border-[#222]"></div>
                                                                                    </div>
                                                                                </div>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                    
                                                                    <div className="absolute inset-0 z-20 flex items-center justify-center">
                                                                        <PeDroppableSlot 
                                                                            slot={normalizedSlot} 
                                                                            isOccupied={!!instance} 
                                                                            overlayClass={isDHoleSlot ? "w-[34px] h-[41px] rounded-full absolute" : "inset-0 rounded-sm absolute"}
                                                                            className="flex items-center justify-center w-full h-full"
                                                                        >
                                                                            {instance ? renderPEInstance(instance, normalizedSlot, 'top') : (
                                                                                <div className={`opacity-0 hover:opacity-100 transition-opacity bg-white/10 flex items-center justify-center cursor-pointer ${isDHoleSlot ? 'w-[34px] h-[41px] rounded-full' : 'w-full h-full rounded'}`}>
                                                                                </div>
                                                                            )}
                                                                        </PeDroppableSlot>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className="h-3 w-full bg-gradient-to-t from-[#1a1a1a] to-[#2a2a2a] border-t border-[#1a1a1a]"></div>
                                                </div>

                                                <div className="w-10 flex-shrink-0 border-l border-[#1a1a1a] flex flex-col justify-around items-center bg-gradient-to-l from-[#333] to-[#2a2a2a]">
                                                    <div className="w-3.5 h-5 rounded-full bg-[#050505] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] border border-[#444]"></div>
                                                    <div className="w-3.5 h-5 rounded-full bg-[#050505] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] border border-[#444]"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center text-gray-500 w-full h-full">
                            <HardDrive size={48} className="mb-4 text-gray-600" />
                            <h3 className="text-lg font-bold">No Panel Selected</h3>
                            <p className="max-w-sm text-sm mt-2">Select a patch panel from the left sidebar to start building.</p>
                            <p className="text-xs text-gray-600 max-w-sm mt-4 border border-gray-700 p-3 rounded-lg bg-gray-900/50">
                                Hint: If you don't see your panel, make sure "Is this a Patch Panel?" is toggled ON in your Rack Equipment Library settings!
                            </p>
                        </div>
                    )}
                </div>

                <div className="w-72 flex-shrink-0 bg-gray-800 p-3 rounded-xl flex flex-col z-20">
                    <div className="flex-shrink-0 flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-white">PE Library</h2>
                        <div className="flex gap-1">
                            <button 
                                onClick={() => setIsFolderModalOpen(true)}
                                className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
                                title="New Folder"
                            >
                                <FolderPlus size={16} />
                            </button>
                            <button 
                                onClick={() => { setEditingTemplate(null); setIsTemplateModalOpen(true); }}
                                className="p-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded transition-colors"
                                title="New Template"
                            >
                                <FilePlus size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="mb-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                            <input 
                                type="text" 
                                placeholder="Search library..." 
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-1.5 pl-9 pr-4 text-xs text-white placeholder-gray-400 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex-grow min-h-0 overflow-y-auto pr-2">
                        <PanelTreeView 
                            library={peLibrary} 
                            onDragStart={(e, node) => handleDragStart({ active: { data: { current: { item: node } } } })}
                            onEditTemplate={(node) => { setEditingTemplate(node); setIsTemplateModalOpen(true); }}
                            onDeleteTemplate={(id) => setItemToDelete({ id, type: 'template' })}
                            onDeleteFolder={(id) => setItemToDelete({ id, type: 'folder' })}
                            onCopyTemplate={handleCopyTemplate}
                        />
                    </div>
                </div>

                <DragOverlay>
                    {activeDragItem ? (
                        <div className="bg-[#1e1e1e] p-2 rounded shadow-2xl border border-[#333] min-w-[120px]">
                            <p className="font-bold text-white text-xs">{activeDragItem.name}</p>
                            <p className="text-[10px] text-gray-400">{activeDragItem.model_number}</p>
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            <PanelLabelModal 
                isOpen={isLabelModalOpen} 
                onClose={() => setIsLabelModalOpen(false)} 
                instance={editingInstance}
                onSave={handleSaveLabel} 
            />

            <PanelFolderModal 
                isOpen={isFolderModalOpen} 
                onClose={() => setIsFolderModalOpen(false)} 
                onCreate={handleCreateFolder} 
            />

            <PanelTemplateModal 
                isOpen={isTemplateModalOpen} 
                onClose={() => setIsTemplateModalOpen(false)} 
                editingTemplate={editingTemplate}
                folders={peLibrary.folders}
                onSave={handleSaveTemplate} 
            />

            {itemToDelete && (
                <ConfirmationModal
                    message={`Are you sure you want to delete this ${itemToDelete.type}? This action cannot be undone.`}
                    onConfirm={handleDeleteLibraryItem}
                    onCancel={() => setItemToDelete(null)}
                />
            )}

            {pdfPreview.isOpen && (
                <PdfPreviewModal
                    isOpen={pdfPreview.isOpen}
                    url={pdfPreview.url}
                    onClose={() => {
                        window.URL.revokeObjectURL(pdfPreview.url);
                        setPdfPreview({ isOpen: false, url: '' });
                    }}
                />
            )}
        </div>
    );
};

export default PanelBuilderView;