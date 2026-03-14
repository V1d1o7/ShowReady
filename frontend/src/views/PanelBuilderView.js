import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Plus, Folder as FolderIcon, ChevronRight, ChevronDown, Search, Edit, Trash2, Download, FolderPlus, FilePlus, Copy, ZoomIn, ZoomOut, Maximize, HardDrive } from 'lucide-react';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import Modal from '../components/Modal';
import InputField from '../components/InputField';
import ConfirmationModal from '../components/ConfirmationModal';
import PdfPreviewModal from '../components/PdfPreviewModal';
import toast, { Toaster } from 'react-hot-toast';

const PeDraggableItem = ({ item, type, children }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `pe-${type}-${item.id}`,
        data: { type, item }
    });
    const style = { opacity: isDragging ? 0.5 : 1 };
    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab">
            {children}
        </div>
    );
};

const PeDroppableSlot = ({ slot, onDrop, children, isOccupied, className = "", overlayClass = "inset-0 rounded-sm" }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `slot-${slot.id}`,
        data: { slot }
    });

    const highlightColor = isOccupied ? 'bg-red-500/50' : 'bg-green-500/50';

    return (
        <div ref={setNodeRef} className={`w-full h-full relative ${className}`}>
            {isOver && (
                <div className={`absolute z-30 pointer-events-none transition-colors ${highlightColor} ${overlayClass}`}></div>
            )}
            {children}
        </div>
    );
};

const PeTemplateForm = ({ formData, setFormData, folders }) => {
    const isPlate = formData.panel_slots && formData.panel_slots.length > 0;

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleTypeToggle = (type) => {
        if (type === 'connector') {
            setFormData(prev => ({ ...prev, panel_slots: [], visual_style: prev.visual_style || 'standard' }));
        } else {
            setFormData(prev => ({ ...prev, visual_style: 'blank' }));
        }
    };

    const handleSlotChange = (index, field, value) => {
        const newSlots = [...(formData.panel_slots || [])];
        newSlots[index][field] = value;
        setFormData({ ...formData, panel_slots: newSlots });
    };

    const userFolders = folders.filter(f => !f.is_default);

    return (
        <div className="space-y-4">
            <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700 mb-4">
                <button 
                    type="button"
                    onClick={() => handleTypeToggle('connector')}
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${!isPlate ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    Connector / Barrel
                </button>
                <button 
                    type="button"
                    onClick={() => handleTypeToggle('plate')}
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${isPlate ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    Plate / Chassis
                </button>
            </div>

            <InputField label="Name" name="name" value={formData.name} onChange={handleChange} required autoFocus />
            
            <div className="grid grid-cols-2 gap-4">
                <InputField label="Manufacturer" name="manufacturer" value={formData.manufacturer} onChange={handleChange} />
                <InputField label="Model Number" name="model_number" value={formData.model_number} onChange={handleChange} />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <InputField label="Width (Units/RU)" name="width_units" type="number" step="0.1" value={formData.width_units} onChange={handleChange} />
                <InputField label="Depth (Inches)" name="depth_in" type="number" step="0.1" value={formData.depth_in} onChange={handleChange} />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Mounting Form Factor</label>
                    <input 
                        list="form-factors" 
                        name="slot_type" 
                        value={formData.slot_type || ''} 
                        onChange={handleChange} 
                        placeholder="e.g., steck, d_hole"
                        className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                    <datalist id="form-factors">
                        <option value="d-hole" />
                        <option value="steck" />
                        <option value="ucp" />
                        <option value="gblock" />
                    </datalist>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Folder</label>
                    <select name="folder_id" value={formData.folder_id || ''} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white outline-none">
                        <option value="">Root</option>
                        {userFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                </div>
            </div>

            {!isPlate ? (
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Visual Style (Connector Face)</label>
                    <select name="visual_style" value={formData.visual_style || 'standard'} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white outline-none">
                        <option value="standard">Standard (Generic)</option>
                        <option value="ethercon">EtherCON / RJ45</option>
                        <option value="xlr_f">XLR (Female)</option>
                        <option value="xlr_m">XLR (Male)</option>
                        <option value="bnc">BNC / SDI</option>
                        <option value="hdmi">HDMI</option>
                        <option value="opticalcon">opticalCON</option>
                        <option value="opticalcon_duo">OpticalCON DUO</option>
                        <option value="opticalcon_quad">OpticalCON QUAD</option>
                        <option value="mtp12">MTP12 Fiber</option>
                        <option value="mtp24">MTP24 Fiber</option>
                        <option value="mtp48">MTP48 Fiber</option>
                        <option value="true1">PowerCON True1</option>
                        <option value="powercon_blue">PowerCON (Blue In)</option>
                        <option value="powercon_white">PowerCON (White Out)</option>
                        <option value="speakon">speakON</option>
                        <option value="gblock_6pr">6-Pair G-Block</option>
                        <option value="gblock_12pr">12-Pair G-Block</option>
                    </select>
                </div>
            ) : (
                <div className="border-t border-gray-700 pt-4">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Panel Slots (Holes)</h3>
                        <button 
                            type="button" 
                            onClick={() => {
                                const newIndex = (formData.panel_slots || []).length + 1;
                                const newId = `${formData.id || 'new'}-slot-${Date.now().toString().slice(-5)}`;
                                setFormData({...formData, panel_slots: [...(formData.panel_slots || []), { id: newId, name: `Hole ${newIndex}`, accepted_module_type: '' }]});
                            }} 
                            className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 text-gray-300"
                        >
                            + Add Slot
                        </button>
                    </div>
                    <div className="space-y-2">
                        {(formData.panel_slots || []).map((slot, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                                <input 
                                    className="flex-grow bg-gray-800 border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-amber-500" 
                                    placeholder="Slot Name (e.g. Hole 1)" 
                                    value={slot.name} 
                                    onChange={(e) => handleSlotChange(idx, 'name', e.target.value)} 
                                />
                                <input 
                                    list="form-factors"
                                    className="w-32 bg-gray-800 border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-amber-500" 
                                    placeholder="Accepts..." 
                                    value={slot.accepted_module_type} 
                                    onChange={(e) => handleSlotChange(idx, 'accepted_module_type', e.target.value)} 
                                />
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        if (formData.id && !window.confirm("WARNING: Deleting a hole from an existing template may orphan connectors already mounted to it in active shows. Continue?")) {
                                            return;
                                        }
                                        setFormData({...formData, panel_slots: formData.panel_slots.filter((_, i) => i !== idx)})
                                    }} 
                                    className="text-red-500 hover:text-red-400 p-1"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const PanelTreeView = ({ library, onDragStart, onEditTemplate, onDeleteTemplate, onDeleteFolder, onCopyTemplate }) => {
    const [expandedFolders, setExpandedFolders] = useState({ 'showready-root': true, 'user-root': true });
    const [contextMenu, setContextMenu] = useState(null);

    const toggleFolder = (folderId) => setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));

    const handleContextMenu = (e, item) => {
        if (!item.is_default) return; 
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, item });
        
        const closeMenu = () => setContextMenu(null);
        window.addEventListener('click', closeMenu, { once: true });
    };

    const tree = useMemo(() => {
        const showReadyRoot = { id: 'showready-root', name: 'ShowReady Library', children: [], isRoot: true, is_default: true };
        const userRoot = { id: 'user-root', name: 'Your PE Templates', children: [], isRoot: true, is_default: false };

        const folderMap = {};
        library.folders.forEach(f => {
            folderMap[f.id] = { ...f, type: 'folder', children: [], templates: [] };
        });

        const orphanTemplates = [];
        library.templates.forEach(t => {
            if (t.folder_id && folderMap[t.folder_id]) {
                folderMap[t.folder_id].templates.push(t);
            } else {
                orphanTemplates.push({ type: 'template', ...t });
            }
        });

        const orphanFolders = [];
        library.folders.forEach(f => {
            if (f.parent_id && folderMap[f.parent_id]) {
                folderMap[f.parent_id].children.push(folderMap[f.id]);
            } else if (!f.parent_id) {
                orphanFolders.push(folderMap[f.id]);
            }
        });

        [...orphanFolders, ...orphanTemplates].forEach(item => {
            if (item.is_default) showReadyRoot.children.push(item);
            else userRoot.children.push(item);
        });

        const sortChildren = (node) => {
            if (!node.children && !node.templates) return;
            const allChildren = [...(node.children || []), ...(node.templates || [])];
            allChildren.sort((a, b) => {
                const aIsFolder = a.type === 'folder';
                const bIsFolder = b.type === 'folder';
                if (aIsFolder && !bIsFolder) return -1;
                if (!aIsFolder && bIsFolder) return 1;
                return (a.name || a.model_number || "").localeCompare(b.name || b.model_number || "");
            });
            node.children = allChildren;
            node.children.forEach(sortChildren);
        };

        sortChildren(showReadyRoot);
        sortChildren(userRoot);

        return [showReadyRoot, userRoot];
    }, [library]);

    const renderNode = (node) => {
        if (node.isRoot) {
            const isOpen = expandedFolders[node.id];
            return (
                <li key={node.id} className="mb-4">
                    <div className="flex items-center cursor-pointer p-1 rounded-md text-amber-400 font-bold hover:bg-gray-700 transition-colors" onClick={() => toggleFolder(node.id)}>
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <span className="ml-2 truncate">{node.name}</span>
                    </div>
                    {isOpen && (
                        <ul className="pl-4">
                            {node.children.map(child => renderNode(child))}
                        </ul>
                    )}
                </li>
            );
        }

        if (node.type === 'folder') {
            const isOpen = expandedFolders[node.id];
            const isUserItem = !node.is_default;
            return (
                <li key={node.id} className="mb-1">
                    <div className="flex items-center group p-1.5 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">
                        <div className="flex items-center flex-grow cursor-pointer" onClick={() => toggleFolder(node.id)}>
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <FolderIcon size={14} className="mx-2 text-amber-500" />
                            <span className="truncate">{node.name}</span>
                        </div>
                        {isUserItem && (
                            <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => onDeleteFolder(node.id)} className="p-1 text-gray-500 hover:text-red-400">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        )}
                    </div>
                    {isOpen && (
                        <ul className="pl-4 border-l border-gray-600 ml-3.5 mt-1 space-y-1">
                            {node.children.map(child => renderNode(child))}
                        </ul>
                    )}
                </li>
            );
        }

        const isUserItem = !node.is_default;
        return (
            <li key={node.id} className="my-1 group">
                <div 
                    onContextMenu={(e) => handleContextMenu(e, node)}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-800/80 hover:bg-gray-700 border border-gray-700 rounded-lg transition-all"
                >
                    <div className="flex-grow min-w-0">
                        <PeDraggableItem item={node} type="template">
                            <div className="min-w-0" onDragStart={(e) => onDragStart(e, node)}>
                                <p className="text-sm font-bold text-white truncate">{node.name}</p>
                                <p className="text-[10px] text-gray-400 truncate">{node.manufacturer} {node.model_number ? `- ${node.model_number}` : ''}</p>
                            </div>
                        </PeDraggableItem>
                    </div>
                    
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {node.slot_type && (
                            <div className="px-1.5 py-0.5 bg-gray-900 rounded text-[8px] font-mono text-gray-500 whitespace-nowrap">
                                {node.slot_type}
                            </div>
                        )}
                        {isUserItem && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => onEditTemplate(node)} className="p-1 text-gray-400 hover:text-amber-400 bg-gray-800 rounded">
                                    <Edit size={10} />
                                </button>
                                <button onClick={() => onDeleteTemplate(node.id)} className="p-1 text-gray-400 hover:text-red-400 bg-gray-800 rounded">
                                    <Trash2 size={10} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </li>
        );
    };

    return (
        <>
            <ul className="space-y-1">
                {tree.map(node => renderNode(node))}
            </ul>
            {contextMenu && (
                <div 
                    className="absolute z-50 bg-gray-800 border border-gray-700 rounded-md shadow-lg p-1 text-white" 
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <button 
                        onClick={() => { onCopyTemplate(contextMenu.item); setContextMenu(null); }} 
                        className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 rounded"
                    >
                    <Copy size={14} /> Copy to My Library
                    </button>
                </div>
            )}
        </>
    );
};

const PanelBuilderView = () => {
    const { showId, isLoading: isShowLoading } = useShow();
    const [racks, setRacks] = useState([]);
    const [selectedPanel, setSelectedPanel] = useState(null);
    const [peLibrary, setPeLibrary] = useState({ folders: [], templates: [] });
    const [panelInstances, setPanelInstances] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeDragItem, setActiveDragItem] = useState(null);
    const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
    const [editingInstance, setEditingInstance] = useState(null);
    const [pdfPreview, setPdfPreview] = useState({ isOpen: false, url: '' }); 
    
    const [zoomLevel, setZoomLevel] = useState(1);

    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [folderName, setFolderName] = useState('');
    const [templateFormData, setTemplateFormData] = useState({ name: '', manufacturer: '', model_number: '', width_units: 1.0, depth_in: 0.0, slot_type: '', visual_style: 'standard', panel_slots: [], folder_id: '' });
    const [itemToDelete, setItemToDelete] = useState(null);

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

    const handleCreateFolder = async (e) => {
        e.preventDefault();
        try {
            await api.createPanelFolder({ name: folderName });
            toast.success("Folder created.");
            fetchData();
            setIsFolderModalOpen(false);
            setFolderName('');
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleSaveTemplate = async (e) => {
        e.preventDefault();
        const payload = {
            ...templateFormData,
            folder_id: templateFormData.folder_id || null,
            width_units: parseFloat(templateFormData.width_units) || 1.0,
            depth_in: parseFloat(templateFormData.depth_in) || 0.0,
        };

        try {
            if (editingTemplate) {
                await api.updatePanelTemplate(editingTemplate.id, payload);
                toast.success("Template updated.");
            } else {
                await api.createPanelTemplate(payload);
                toast.success("Template created.");
            }
            fetchData();
            setIsTemplateModalOpen(false);
            setEditingTemplate(null);
            setTemplateFormData({ name: '', manufacturer: '', model_number: '', width_units: 1.0, depth_in: 0.0, slot_type: '', visual_style: 'standard', panel_slots: [], folder_id: '' });
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

    const renderConnectorFace = (style) => {
        if (style.startsWith('gblock')) {
            const is12Pr = style === 'gblock_12pr';
            return (
                <div className="relative w-[90%] h-[90%] bg-[#111] border-2 border-[#333] rounded-md shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] flex flex-col items-center justify-center p-1 mx-auto">
                    <div className="absolute top-1 left-1 w-1.5 h-1.5 bg-[#ccc] rounded-full"></div>
                    <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#ccc] rounded-full"></div>
                    <div className="absolute bottom-1 left-1 w-1.5 h-1.5 bg-[#ccc] rounded-full"></div>
                    <div className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-[#ccc] rounded-full"></div>
                    <div className={`grid gap-1 ${is12Pr ? 'grid-cols-4' : 'grid-cols-3'}`}>
                        {Array.from({ length: is12Pr ? 12 : 6 }).map((_, i) => (
                            <div key={i} className="w-2 h-2 bg-yellow-500 rounded-full shadow-inner"></div>
                        ))}
                    </div>
                </div>
            );
        }

        // Enlarged max bounds (46x55) for much better visibility
        const DSeriesFlange = ({ children }) => (
            <svg viewBox="0 0 260 310" className="w-full h-full max-w-[46px] max-h-[55px] drop-shadow-md mx-auto transition-transform group-hover:scale-105">
                <defs>
                    <linearGradient id="metalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f5f5f5" />
                        <stop offset="100%" stopColor="#b3b3b3" />
                    </linearGradient>
                    <linearGradient id="darkMetal" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#444" />
                        <stop offset="100%" stopColor="#111" />
                    </linearGradient>
                </defs>
                <rect x="0" y="0" width="260" height="310" rx="20" fill="url(#metalGrad)" stroke="#888" strokeWidth="3"/>
                <circle cx="35" cy="35" r="16" fill="#111" stroke="#555" strokeWidth="2"/>
                <circle cx="35" cy="35" r="6" fill="#050505"/>
                <circle cx="225" cy="275" r="16" fill="#111" stroke="#555" strokeWidth="2"/>
                <circle cx="225" cy="275" r="6" fill="#050505"/>
                {children}
            </svg>
        );

        const faces = {
            'ethercon': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                    <path d="M 100,50 L 160,50 L 150,90 L 110,90 Z" fill="#ccc" stroke="#666" strokeWidth="2"/>
                    <rect x="110" y="60" width="40" height="6" fill="#888" rx="2"/>
                    <rect x="85" y="120" width="90" height="75" rx="5" fill="#000" />
                    <path d="M 115,195 L 145,195 L 145,215 L 115,215 Z" fill="#000" />
                    {Array.from({ length: 8 }).map((_, i) => (
                        <rect key={i} x={96 + (i * 9)} y="125" width="4" height="20" fill="#ffd700"/>
                    ))}
                </DSeriesFlange>
            ),
            'xlr_f': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                    <path d="M 100,50 L 160,50 L 150,90 L 110,90 Z" fill="#ccc" stroke="#666" strokeWidth="2"/>
                    <circle cx="130" cy="70" r="10" fill="#888"/>
                    <text x="130" y="45" fill="#555" fontSize="20" fontWeight="bold" textAnchor="middle">PUSH</text>
                    <circle cx="95" cy="130" r="16" fill="#000"/>
                    <circle cx="165" cy="130" r="16" fill="#000"/>
                    <circle cx="130" cy="200" r="16" fill="#000"/>
                </DSeriesFlange>
            ),
            'xlr_m': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                    <circle cx="130" cy="155" r="70" fill="#050505" stroke="#222" strokeWidth="2"/>
                    <rect x="115" y="60" width="30" height="30" fill="#050505"/>
                    <circle cx="95" cy="130" r="12" fill="#e5e5e5"/>
                    <circle cx="165" cy="130" r="12" fill="#e5e5e5"/>
                    <circle cx="130" cy="200" r="12" fill="#e5e5e5"/>
                </DSeriesFlange>
            ),
            'bnc': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#222" strokeWidth="4"/>
                    <circle cx="130" cy="155" r="65" fill="#e5e5e5" stroke="#aaa" strokeWidth="4"/>
                    <rect x="45" y="145" width="170" height="20" fill="#e5e5e5" stroke="#aaa" strokeWidth="2" rx="5"/>
                    <circle cx="130" cy="155" r="45" fill="#fff" stroke="#ddd" strokeWidth="2"/>
                    <circle cx="130" cy="155" r="10" fill="#ffd700" stroke="#b8860b" strokeWidth="2"/>
                </DSeriesFlange>
            ),
            'opticalcon_duo': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                    <rect x="55" y="125" width="150" height="60" rx="10" fill="#00c853" stroke="#007a33" strokeWidth="3"/>
                    <circle cx="100" cy="155" r="12" fill="#fff" stroke="#666" strokeWidth="2"/>
                    <circle cx="160" cy="155" r="12" fill="#fff" stroke="#666" strokeWidth="2"/>
                </DSeriesFlange>
            ),
            'opticalcon_quad': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                    <rect x="55" y="125" width="150" height="60" rx="10" fill="#00c853" stroke="#007a33" strokeWidth="3"/>
                    <rect x="100" y="80" width="60" height="150" rx="10" fill="#00c853" stroke="#007a33" strokeWidth="3"/>
                    <circle cx="100" cy="125" r="12" fill="#fff" stroke="#666" strokeWidth="2"/>
                    <circle cx="160" cy="125" r="12" fill="#fff" stroke="#666" strokeWidth="2"/>
                    <circle cx="100" cy="185" r="12" fill="#fff" stroke="#666" strokeWidth="2"/>
                    <circle cx="160" cy="185" r="12" fill="#fff" stroke="#666" strokeWidth="2"/>
                </DSeriesFlange>
            ),
            'mtp12': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                    <rect x="65" y="135" width="130" height="40" rx="8" fill="#00c853" stroke="#007a33" strokeWidth="3"/>
                    <rect x="85" y="150" width="90" height="10" rx="2" fill="#000"/>
                    <text x="130" y="110" fill="#fff" fontSize="24" fontFamily="monospace" fontWeight="bold" textAnchor="middle">12</text>
                </DSeriesFlange>
            ),
            'mtp24': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                    <rect x="65" y="135" width="130" height="40" rx="8" fill="#00c853" stroke="#007a33" strokeWidth="3"/>
                    <rect x="85" y="150" width="90" height="10" rx="2" fill="#000"/>
                    <text x="130" y="110" fill="#fff" fontSize="24" fontFamily="monospace" fontWeight="bold" textAnchor="middle">24</text>
                </DSeriesFlange>
            ),
            'mtp48': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                    <rect x="65" y="135" width="130" height="40" rx="8" fill="#00c853" stroke="#007a33" strokeWidth="3"/>
                    <rect x="85" y="150" width="90" height="10" rx="2" fill="#000"/>
                    <text x="130" y="110" fill="#fff" fontSize="24" fontFamily="monospace" fontWeight="bold" textAnchor="middle">48</text>
                </DSeriesFlange>
            ),
            'true1': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                    <circle cx="130" cy="155" r="85" fill="#FFD700" stroke="#cca100" strokeWidth="4"/>
                    <circle cx="130" cy="155" r="60" fill="#1a1a1a"/>
                    <rect x="115" y="70" width="30" height="20" fill="#FFD700"/>
                </DSeriesFlange>
            ),
            'powercon_blue': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="#0055FF" stroke="#0033aa" strokeWidth="4"/>
                    <circle cx="130" cy="155" r="60" fill="#1a1a1a" stroke="#000" strokeWidth="4"/>
                    <rect x="120" y="45" width="20" height="20" fill="#1a1a1a"/>
                </DSeriesFlange>
            ),
            'powercon_white': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="#e5e5e5" stroke="#ccc" strokeWidth="4"/>
                    <circle cx="130" cy="155" r="60" fill="#1a1a1a" stroke="#000" strokeWidth="4"/>
                    <rect x="120" y="45" width="20" height="20" fill="#1a1a1a"/>
                </DSeriesFlange>
            ),
            'speakon': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                    <circle cx="130" cy="155" r="65" fill="#111" stroke="#444" strokeWidth="4"/>
                    <rect x="120" y="80" width="20" height="20" fill="#444"/>
                    <rect x="60" y="145" width="20" height="20" fill="#444"/>
                    <rect x="180" y="145" width="20" height="20" fill="#444"/>
                    <circle cx="130" cy="155" r="30" fill="#222"/>
                    <circle cx="130" cy="155" r="15" fill="#111"/>
                </DSeriesFlange>
            ),
            'hdmi': (
                <DSeriesFlange>
                    <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                    <path d="M 60,135 L 200,135 L 200,155 L 180,185 L 80,185 L 60,155 Z" fill="#000" stroke="#555" strokeWidth="3"/>
                    <rect x="75" y="145" width="110" height="6" fill="#333"/>
                    <rect x="85" y="165" width="90" height="4" fill="#333"/>
                </DSeriesFlange>
            ),
            'blank': (
                <DSeriesFlange />
            )
        };

        return faces[style] || faces['blank'];
    };

    const checkIsDHole = (acceptedModuleType, slotName) => {
        const a = (acceptedModuleType || "").trim().toLowerCase();
        const n = (slotName || "").trim().toLowerCase();
        return a.includes('d-hole') || a.includes('d_hole') || a.includes('dhole') || a.includes('d-series') || a === 'd' ||
               n.includes('d-hole') || n.includes('d_hole') || n.includes('d hole');
    };

    const renderPEInstance = (instance, slot) => {
        const template = instance.template;
        if (!template) return null;

        const isConnector = !template.panel_slots || template.panel_slots.length === 0;

        if (isConnector) {
            return (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-between p-0.5 group">
                    <div className="h-4 flex-shrink-0 w-full flex items-start justify-center overflow-hidden">
                        {instance.label && (
                            <div className="bg-white text-black font-bold px-1 py-0.5 rounded shadow-sm text-[7px] truncate max-w-full border border-gray-400 leading-none">
                                {instance.label}
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-grow w-full min-h-0 flex items-center justify-center relative">
                        {renderConnectorFace(template.visual_style || 'standard')}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded z-[70]">
                            <button onClick={() => handleOpenLabelModal(instance)} className="text-amber-400 hover:text-amber-300 p-1"><Edit size={14} /></button>
                            <button onClick={() => handleRemoveInstance(instance.id)} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                        </div>
                    </div>
                </div>
            );
        }

        const slotCount = template.panel_slots.length;
        let gridCols = 1;
        let gridRows = slotCount;
        
        if (slotCount === 4) {
            gridCols = 2;
            gridRows = 2;
        } else if (slotCount > 4) {
            gridCols = 2;
            gridRows = Math.ceil(slotCount / 2);
        }

        const templateModel = (template.model_number || "").trim().toLowerCase();
        const templateName = (template.name || "").trim().toLowerCase();
        const isUCPPlate = templateModel.includes('ucp') || templateName.includes('ucp');

        return (
            <div className="absolute inset-0 z-10 bg-[#1e1e1e] border-x border-[#111] shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] flex flex-col items-center group overflow-hidden">
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

                <div className="w-full flex justify-center mt-3 h-4 flex-shrink-0 px-1 overflow-hidden">
                    {!isUCPPlate && instance.label && (
                        <div className="bg-white text-black font-bold px-1 py-0.5 rounded shadow-sm text-[7px] truncate max-w-full border border-gray-400 leading-none z-50">
                            {instance.label}
                        </div>
                    )}
                </div>

                <div 
                    className="flex-grow w-full grid place-items-center gap-1 px-1 pb-4 min-h-0 mt-1" 
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
                        
                        const dropZoneShapeClass = isDHoleSubSlot 
                            ? 'rounded-full w-12 h-12 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' 
                            : 'inset-0 rounded-sm';

                        return (
                            <div key={subSlotId} className="relative w-full h-full flex items-center justify-center min-h-0 min-w-0">
                                {!child && (
                                    isDHoleSubSlot ? (
                                        <div className="absolute flex flex-col items-center justify-center max-h-full max-w-full" style={{ width: 'min(46px, 100%)', aspectRatio: '260/310' }}>
                                            <div className="absolute inset-0 bg-[#050505] rounded-full shadow-[inset_0_3px_5px_rgba(0,0,0,1)] border border-[#333]"></div>
                                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[65%] h-[12%] bg-[#1e1e1e]"></div>
                                            <div className="absolute top-[10%] left-[10%] w-1.5 h-1.5 rounded-full bg-[#0a0a0a] shadow-inner border border-[#333]"></div>
                                            <div className="absolute bottom-[10%] right-[10%] w-1.5 h-1.5 rounded-full bg-[#0a0a0a] shadow-inner border border-[#333]"></div>
                                            <span className="text-[5px] font-bold text-[#444] absolute z-10 text-center leading-tight select-none pointer-events-none truncate px-0.5 w-full">{subSlot.name || 'Empty'}</span>
                                        </div>
                                    ) : (
                                        <div className="w-full h-full absolute flex flex-col justify-between items-center opacity-80 bg-[#050505] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] border border-[#333] rounded-sm py-1">
                                            <div className="w-1 h-1 rounded-full bg-[#111] shadow-inner border border-[#222]"></div>
                                            <div className="w-1 h-1 rounded-full bg-[#111] shadow-inner border border-[#222]"></div>
                                        </div>
                                    )
                                )}
                                
                                <div className="absolute inset-0 z-10">
                                    <PeDroppableSlot 
                                        slot={{ ...normalizedSubSlot, parent_instance_id: instance.id }} 
                                        isOccupied={!!child} 
                                        overlayClass={dropZoneShapeClass}
                                        className="flex items-center justify-center"
                                    >
                                        {child ? renderPEInstance(child, normalizedSubSlot) : (
                                            <div className={`opacity-0 hover:opacity-100 transition-opacity bg-white/10 flex items-center justify-center ${isDHoleSubSlot ? 'rounded-full w-full max-w-[46px]' : 'rounded w-full h-full'} aspect-[260/310]`}>
                                                <span className="text-[6px] text-gray-400 text-center px-0.5 font-bold leading-tight drop-shadow-md truncate">{subSlot.name}</span>
                                            </div>
                                        )}
                                    </PeDroppableSlot>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="pb-1 text-[7px] font-bold text-gray-400 text-center px-1 leading-tight tracking-wider z-10 w-full truncate flex-shrink-0">
                    {isUCPPlate ? (instance.label || "") : (template.model_number || template.name)}
                </div>

                <div className="absolute top-0 right-0 p-0.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 rounded-bl z-[80]">
                    <button onClick={() => handleOpenLabelModal(instance)} className="text-amber-400 hover:text-amber-300 p-1"><Edit size={12} /></button>
                    <button onClick={() => handleRemoveInstance(instance.id)} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
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
                            
                            <div className="flex-grow relative w-full bg-gray-950/20">
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
                                                            
                                                            const dropZoneShapeClass = isDHoleSlot 
                                                                ? 'rounded-full w-12 h-12 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' 
                                                                : 'inset-0 rounded-sm';

                                                            return (
                                                                <div key={slotId} className={`flex-1 relative h-full min-w-0 flex items-center justify-center ${isDHoleSlot ? '' : 'border-x border-[#1a1a1a]'}`}>
                                                                    <PeDroppableSlot 
                                                                        slot={normalizedSlot} 
                                                                        isOccupied={!!instance} 
                                                                        overlayClass={dropZoneShapeClass}
                                                                        className="flex items-center justify-center"
                                                                    >
                                                                        {instance ? renderPEInstance(instance, normalizedSlot) : (
                                                                            isDHoleSlot ? (
                                                                                <div className="w-10 h-10 relative flex flex-col items-center justify-center opacity-80 transition-opacity group-hover:opacity-100" style={{ width: 'min(46px, 100%)', aspectRatio: '260/310' }}>
                                                                                    <div className="absolute inset-0 bg-[#050505] rounded-full shadow-[inset_0_4px_8px_rgba(0,0,0,0.8)] border border-[#333]"></div>
                                                                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[65%] h-[12%] bg-[#2a2a2a]"></div>
                                                                                    <div className="absolute top-[10%] left-[10%] w-1.5 h-1.5 rounded-full bg-[#111] border border-[#222] shadow-inner"></div>
                                                                                    <div className="absolute bottom-[10%] right-[10%] w-1.5 h-1.5 rounded-full bg-[#111] border border-[#222] shadow-inner"></div>
                                                                                    <span className="text-[6px] font-bold text-[#444] absolute z-10 text-center leading-tight select-none pointer-events-none">{slot.name || 'Empty'}</span>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="w-full h-full relative flex flex-col justify-between items-center opacity-80 transition-opacity bg-[#050505] shadow-[inset_0_4px_8px_rgba(0,0,0,0.8)] border border-[#333] rounded-sm group-hover:opacity-100">
                                                                                    <div className="absolute top-1 w-1.5 h-1.5 rounded-full bg-[#111] shadow-inner border border-[#222]"></div>
                                                                                    <span className="text-[9px] font-bold text-[#444] text-center px-1 break-words transform -rotate-90 whitespace-nowrap mt-auto mb-auto select-none pointer-events-none">
                                                                                        {slot.name || 'Empty'}
                                                                                    </span>
                                                                                    <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#111] shadow-inner border border-[#222]"></div>
                                                                                </div>
                                                                            )
                                                                        )}
                                                                    </PeDroppableSlot>
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
                                onClick={() => { setEditingTemplate(null); setTemplateFormData({ name: '', manufacturer: '', model_number: '', width_units: 1.0, depth_in: 0.0, slot_type: '', visual_style: 'standard', panel_slots: [], folder_id: '' }); setIsTemplateModalOpen(true); }}
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
                            onEditTemplate={(node) => { setEditingTemplate(node); setTemplateFormData(node); setIsTemplateModalOpen(true); }}
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

            {isLabelModalOpen && (
                <Modal 
                    isOpen={isLabelModalOpen} 
                    onClose={() => setIsLabelModalOpen(false)} 
                    title={`Configure ${editingInstance?.template?.name}`}
                >
                    <div className="p-6">
                        <InputField 
                            label="Port Label" 
                            value={editingInstance?.label || ''} 
                            onChange={(e) => setEditingInstance({...editingInstance, label: e.target.value})}
                            autoFocus
                        />
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setIsLabelModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white font-bold">Cancel</button>
                            <button 
                                onClick={() => handleSaveLabel(editingInstance.label)} 
                                className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title="New Folder">
                <form onSubmit={handleCreateFolder} className="p-4 space-y-4">
                    <InputField label="Folder Name" value={folderName} onChange={(e) => setFolderName(e.target.value)} required autoFocus />
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setIsFolderModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400">Create</button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isTemplateModalOpen} onClose={() => setIsTemplateModalOpen(false)} title={editingTemplate ? 'Edit PE Template' : 'New PE Template'}>
                <form onSubmit={handleSaveTemplate} className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
                    <PeTemplateForm formData={templateFormData} setFormData={setTemplateFormData} folders={peLibrary.folders} />
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                        <button type="button" onClick={() => setIsTemplateModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white font-bold">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400">
                            {editingTemplate ? 'Save Changes' : 'Create Template'}
                        </button>
                    </div>
                </form>
            </Modal>

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