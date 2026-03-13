import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Plus, Folder as FolderIcon, ChevronRight, ChevronDown, Search, Edit, Trash2, Download, FolderPlus, FilePlus, Copy, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import Modal from '../components/Modal';
import InputField from '../components/InputField';
import ConfirmationModal from '../components/ConfirmationModal';
import toast, { Toaster } from 'react-hot-toast';

// --- Sub-Components ---

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

const PeDroppableSlot = ({ slot, onDrop, children, isOccupied, className = "" }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `slot-${slot.id}`,
        data: { slot }
    });

    return (
        <div 
            ref={setNodeRef} 
            className={`w-full h-full relative transition-colors ${className} ${isOver ? (isOccupied ? 'bg-red-500/30' : 'bg-green-500/30') : ''}`}
        >
            {children}
        </div>
    );
};

const PeTemplateForm = ({ formData, setFormData, folders }) => {
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSlotChange = (index, field, value) => {
        const newSlots = [...(formData.panel_slots || [])];
        newSlots[index][field] = value;
        setFormData({ ...formData, panel_slots: newSlots });
    };

    const userFolders = folders.filter(f => !f.is_default);

    return (
        <div className="space-y-4">
            <InputField label="Name" name="name" value={formData.name} onChange={handleChange} required autoFocus />
            <div className="grid grid-cols-2 gap-4">
                <InputField label="Manufacturer" name="manufacturer" value={formData.manufacturer} onChange={handleChange} />
                <InputField label="Model Number" name="model_number" value={formData.model_number} onChange={handleChange} />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <InputField label="Slot Type (Accepted)" name="slot_type" value={formData.slot_type} onChange={handleChange} placeholder="e.g., steck, d-hole" />
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Visual Style (Connector Face)</label>
                    <select name="visual_style" value={formData.visual_style || 'standard'} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm">
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
                        <option value="blank">Blank Plate</option>
                    </select>
                </div>
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Folder</label>
                <select name="folder_id" value={formData.folder_id || ''} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm">
                    <option value="">Root</option>
                    {userFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
            </div>

            <div className="border-t border-gray-700 pt-4">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Panel Slots (Holes)</h3>
                    <button type="button" onClick={() => setFormData({...formData, panel_slots: [...(formData.panel_slots || []), { id: crypto.randomUUID(), name: '', accepted_module_type: '' }]})} className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 text-gray-300">+ Add Slot</button>
                </div>
                <div className="space-y-2">
                    {(formData.panel_slots || []).map((slot, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                            <input className="flex-grow bg-gray-800 border border-gray-700 rounded p-1.5 text-xs text-white" placeholder="Slot Name (e.g. Hole 1)" value={slot.name} onChange={(e) => handleSlotChange(idx, 'name', e.target.value)} />
                            <input className="w-32 bg-gray-800 border border-gray-700 rounded p-1.5 text-xs text-white" placeholder="Accepted Type" value={slot.accepted_module_type} onChange={(e) => handleSlotChange(idx, 'accepted_module_type', e.target.value)} />
                            <button type="button" onClick={() => setFormData({...formData, panel_slots: formData.panel_slots.filter((_, i) => i !== idx)})} className="text-red-500 hover:text-red-400 p-1">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- Panel Tree View Sidebar Component ---
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
                    <div className="flex items-center cursor-pointer p-1 rounded-md text-amber-400 font-bold hover:bg-gray-800 transition-colors" onClick={() => toggleFolder(node.id)}>
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
                        <ul className="pl-4 border-l border-gray-700 ml-3.5 mt-1 space-y-1">
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
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-700 border border-gray-700 rounded-lg transition-all"
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
                    className="absolute z-50 bg-gray-900 border border-gray-700 rounded-md shadow-lg p-1 text-white" 
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

// --- Main View ---

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
    
    // Zoom State
    const [zoomLevel, setZoomLevel] = useState(1);

    // Creation / Edit Modals State
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
                description: itemToCopy.description,
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

        if (requiredType && requiredType !== providedType) {
            toast.error(`Compatibility error: This slot requires '${slot.accepted_module_type}'.`);
            return;
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
            const a = document.createElement('a');
            a.href = url;
            a.download = `Panel_Build_Sheets.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            toast.success("Export complete!", { id: tid });
        } catch (error) {
            toast.error(`Export failed: ${error.message}`, { id: tid });
        }
    };

    const renderConnectorFace = (style) => {
        if (style.startsWith('gblock')) {
            const is12Pr = style === 'gblock_12pr';
            return (
                <div className="relative w-[90%] h-[90%] bg-[#111] border-2 border-[#333] rounded-md shadow-md flex flex-col items-center justify-center p-1">
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

        const faces = {
            'mtp12': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-[#111] border border-[#222] flex flex-col items-center justify-center relative">
                    <div className="w-5 h-2.5 bg-green-500 rounded-sm flex items-center justify-center">
                        <div className="w-3 h-0.5 bg-black"></div>
                    </div>
                    <span className="text-[4px] text-white mt-0.5 font-bold">12</span>
                </div>
            ),
            'mtp24': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-[#111] border border-[#222] flex flex-col items-center justify-center relative">
                    <div className="w-5 h-2.5 bg-green-500 rounded-sm flex items-center justify-center">
                        <div className="w-3 h-0.5 bg-black"></div>
                    </div>
                    <span className="text-[4px] text-white mt-0.5 font-bold">24</span>
                </div>
            ),
            'mtp48': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-[#111] border border-[#222] flex flex-col items-center justify-center relative">
                    <div className="w-5 h-2.5 bg-green-500 rounded-sm flex items-center justify-center">
                        <div className="w-3 h-0.5 bg-black"></div>
                    </div>
                    <span className="text-[4px] text-white mt-0.5 font-bold">48</span>
                </div>
            ),
            'opticalcon_duo': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-[#111] border border-[#222] flex items-center justify-center relative">
                    <div className="w-6 h-2 bg-green-500 flex justify-around items-center px-1">
                        <div className="w-1 h-1 bg-white rounded-full"></div>
                        <div className="w-1 h-1 bg-white rounded-full"></div>
                    </div>
                </div>
            ),
            'opticalcon_quad': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-[#111] border border-[#222] flex items-center justify-center relative">
                    <div className="absolute w-6 h-2 bg-green-500"></div>
                    <div className="absolute w-2 h-6 bg-green-500"></div>
                    <div className="absolute grid grid-cols-2 gap-1.5 z-10">
                        <div className="w-1 h-1 bg-white rounded-full"></div>
                        <div className="w-1 h-1 bg-white rounded-full"></div>
                        <div className="w-1 h-1 bg-white rounded-full"></div>
                        <div className="w-1 h-1 bg-white rounded-full"></div>
                    </div>
                </div>
            ),
            'true1': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-[#111] border-[3px] border-yellow-500 flex items-center justify-center relative">
                    <div className="w-5 h-5 bg-[#111] rounded-full"></div>
                    <div className="absolute top-0.5 w-1 h-1.5 bg-yellow-500"></div>
                </div>
            ),
            'powercon_blue': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-blue-600 flex items-center justify-center relative">
                    <div className="w-5 h-5 bg-[#111] rounded-full"></div>
                    <div className="absolute top-1 w-1 h-1.5 bg-gray-300"></div>
                </div>
            ),
            'powercon_white': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-gray-200 border border-gray-400 flex items-center justify-center relative">
                    <div className="w-5 h-5 bg-[#111] rounded-full"></div>
                    <div className="absolute top-1 w-1 h-1.5 bg-gray-400"></div>
                </div>
            ),
            'ethercon': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-gradient-to-b from-[#222] to-[#050505] border border-[#111] flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,1)]">
                    <div className="relative w-4 h-4 bg-black rounded-sm border-b border-gray-700"></div>
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-3 h-1.5 bg-gradient-to-b from-gray-300 to-gray-500 rounded-sm"></div>
                </div>
            ),
            'xlr_f': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-gradient-to-b from-[#222] to-[#050505] border border-[#111] flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,1)] relative">
                    <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-1 bg-gradient-to-b from-gray-400 to-gray-600 rounded-sm"></div>
                    <div className="absolute top-3.5 left-2.5 w-1 h-1 bg-black rounded-full"></div>
                    <div className="absolute top-3.5 right-2.5 w-1 h-1 bg-black rounded-full"></div>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 bg-black rounded-full"></div>
                </div>
            ),
            'xlr_m': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-gradient-to-b from-[#222] to-[#050505] border border-[#111] flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,1)] relative">
                    <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center relative">
                        <div className="absolute top-1 left-1 w-1 h-1 bg-gray-300 rounded-full shadow-sm"></div>
                        <div className="absolute top-1 right-1 w-1 h-1 bg-gray-300 rounded-full shadow-sm"></div>
                        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-gray-300 rounded-full shadow-sm"></div>
                    </div>
                </div>
            ),
            'bnc': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-gradient-to-b from-[#222] to-[#050505] border border-[#111] flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,1)] relative">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 border border-gray-600 flex items-center justify-center relative">
                        <div className="w-1 h-1 rounded-full bg-black"></div>
                        <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-1 h-1 bg-gray-200 rounded-full"></div>
                        <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1 h-1 bg-gray-200 rounded-full"></div>
                    </div>
                </div>
            ),
            'hdmi': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-gradient-to-b from-[#222] to-[#050505] border border-[#111] flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,1)]">
                    <div className="w-4 h-2 bg-black border-b border-x border-gray-600 rounded-b-sm" style={{ clipPath: 'polygon(0 0, 100% 0, 85% 100%, 15% 100%)' }}></div>
                </div>
            ),
            'speakon': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-gradient-to-b from-[#222] to-[#050505] border border-[#111] flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,1)] relative">
                    <div className="w-5 h-5 rounded-full border-4 border-[#333] relative">
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-2 bg-[#333]"></div>
                    </div>
                </div>
            ),
            'blank': (
                <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-gradient-to-b from-[#d4d4d4] to-[#8a8a8a] border border-[#555]"></div>
            )
        };

        const Face = faces[style] || (
            <div className="w-8 h-8 max-w-[32px] max-h-[32px] rounded-full bg-gradient-to-b from-[#222] to-[#050505] border border-[#111] flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,1)]">
                <div className="w-3 h-3 rounded-full bg-black shadow-inner"></div>
            </div>
        );

        return (
            <div className="relative w-full h-full max-w-[38px] max-h-[46px] bg-gradient-to-br from-[#d4d4d4] to-[#8a8a8a] rounded-sm shadow-md border border-[#555] flex items-center justify-center transition-transform group-hover:scale-105 mx-auto">
                <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-[#222] shadow-inner"></div>
                <div className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-[#222] shadow-inner"></div>
                {Face}
            </div>
        );
    };

    const renderPEInstance = (instance, slot) => {
        const template = instance.template;
        if (!template) return null;

        const isConnector = !template.panel_slots || template.panel_slots.length === 0;

        if (isConnector) {
            return (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center group overflow-visible w-full h-full">
                    {renderConnectorFace(template.visual_style || 'standard')}

                    {/* User Label */}
                    {instance.label && (
                        <div className="absolute -bottom-4 text-[8px] bg-white text-black font-bold px-1.5 py-0.5 rounded shadow-md max-w-[150%] truncate border border-gray-300 z-[60]">
                            {instance.label}
                        </div>
                    )}
                    
                    {/* Controls */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded z-[70]">
                        <button onClick={() => handleOpenLabelModal(instance)} className="text-amber-400 hover:text-amber-300 p-1"><Edit size={14} /></button>
                        <button onClick={() => handleRemoveInstance(instance.id)} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                    </div>
                </div>
            );
        }

        // It is a Plate (e.g. Steck module)
        return (
            <div className="absolute inset-0 z-10 bg-[#1e1e1e] border-x border-[#111] shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] flex flex-col items-center group overflow-visible">
                {/* Plate Screws */}
                <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#0a0a0a] border border-[#333] shadow-sm"></div>
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#0a0a0a] border border-[#333] shadow-sm"></div>

                {/* Plate Silkscreen */}
                <div className="pt-4 pb-1 text-[7px] font-bold text-gray-400 text-center px-1 leading-tight tracking-wider z-10 w-full truncate">
                    {template.model_number || template.name}
                </div>
                
                {/* Sub-Slots (D-Holes) Grid - Dynamic columns based on slot count */}
                <div 
                    className="flex-grow w-full grid place-items-center gap-1 px-1 pb-4" 
                    style={{
                        gridTemplateColumns: template.panel_slots.length > 4 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(1, minmax(0, 1fr))',
                        gridAutoRows: 'minmax(0, 1fr)'
                    }}
                >
                    {template.panel_slots.map((subSlot, idx) => {
                        const subSlotId = subSlot.id || subSlot.name || `${instance.id}-sub-${idx}`;
                        const normalizedSubSlot = { ...subSlot, id: subSlotId };
                        const child = (instance.children || []).find(c => c.slot_id === subSlotId);

                        return (
                            <div key={subSlotId} className="relative w-full h-full flex items-center justify-center">
                                {/* Empty D-Hole Graphic (Behind Dropzone) */}
                                {!child && (
                                    <div className="absolute flex flex-col items-center justify-center" style={{ width: 'min(32px, 100%)', aspectRatio: '1/1' }}>
                                        <div className="absolute inset-0 bg-[#050505] rounded-full shadow-[inset_0_3px_5px_rgba(0,0,0,1)] border border-[#333]"></div>
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[15%] bg-[#1e1e1e]"></div>
                                        {/* Screw taps */}
                                        <div className="absolute -top-1 -left-1 w-1.5 h-1.5 rounded-full bg-[#0a0a0a] shadow-inner border border-[#333]"></div>
                                        <div className="absolute -bottom-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#0a0a0a] shadow-inner border border-[#333]"></div>
                                    </div>
                                )}
                                
                                <div className="absolute inset-0 z-10">
                                    <PeDroppableSlot slot={{ ...normalizedSubSlot, parent_instance_id: instance.id }} isOccupied={!!child} className="rounded flex items-center justify-center">
                                        {child ? renderPEInstance(child, normalizedSubSlot) : (
                                            <div className="opacity-0 hover:opacity-100 transition-opacity bg-white/10 rounded w-full h-full flex items-center justify-center">
                                                <span className="text-[6px] text-gray-400 text-center px-0.5 font-bold leading-tight drop-shadow-md">{subSlot.name}</span>
                                            </div>
                                        )}
                                    </PeDroppableSlot>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* User Label absolute positioned to prevent grid breaking */}
                {instance.label && (
                    <div className="absolute -bottom-4 text-[8px] bg-white text-black font-bold px-1.5 py-0.5 rounded shadow-sm max-w-[150%] truncate border border-gray-400 z-50">
                        {instance.label}
                    </div>
                )}

                {/* Controls */}
                <div className="absolute top-0 right-0 p-0.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 rounded-bl z-[80]">
                    <button onClick={() => handleOpenLabelModal(instance)} className="text-amber-400 hover:text-amber-300 p-1"><Edit size={12} /></button>
                    <button onClick={() => handleRemoveInstance(instance.id)} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                </div>
            </div>
        );
    };

    const renderCanvas = () => {
        if (!selectedPanel) {
            return (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 italic p-8 text-center space-y-2 min-w-0">
                    <p>Select a patch panel from the left sidebar to start building.</p>
                    <p className="text-xs text-gray-600 max-w-sm">
                        Hint: If you don't see your panel, make sure "Is this a Patch Panel?" is toggled ON in your Rack Equipment Library settings!
                    </p>
                </div>
            );
        }

        const infraSlots = selectedPanel.equipment_templates?.slots || [];
        const ruHeight = selectedPanel.equipment_templates?.ru_height || 1;
        const panelHeightPx = ruHeight * 80;

        return (
            <div className="p-8 text-center h-full flex flex-col min-w-0">
                <div className="flex-shrink-0 mb-8 flex justify-between items-end">
                    <div>
                        <h2 className="text-2xl font-bold text-white text-left">{selectedPanel.instance_name}</h2>
                        <p className="text-sm text-gray-400 text-left">{selectedPanel.equipment_templates?.manufacturer} {selectedPanel.equipment_templates?.model_number} ({selectedPanel.rack_name})</p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Zoom Controls */}
                        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 border border-gray-700 shadow-lg">
                            <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.1))} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="Zoom Out">
                                <ZoomOut size={16} />
                            </button>
                            <span className="text-xs text-gray-300 font-mono w-10 text-center select-none">{Math.round(zoomLevel * 100)}%</span>
                            <button onClick={() => setZoomLevel(z => Math.min(3, z + 0.1))} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="Zoom In">
                                <ZoomIn size={16} />
                            </button>
                            <button onClick={() => setZoomLevel(1)} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white border-l border-gray-600 ml-1 pl-2" title="Reset Zoom">
                                <Maximize size={16} />
                            </button>
                        </div>
                        <button 
                            onClick={handleExport}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors shadow-lg shadow-black/50"
                        >
                            <Download size={18} /> Export Build Sheets
                        </button>
                    </div>
                </div>

                {/* Canvas Zoom Wrapper (min-w-0 prevents it from pushing the right sidebar out) */}
                <div className="flex-grow flex items-start justify-center overflow-auto p-4 relative min-w-0">
                    {/* Bounding Box Spacer - Resizes layout dynamically */}
                    <div 
                        style={{ 
                            width: `${850 * zoomLevel}px`, 
                            height: `${panelHeightPx * zoomLevel}px`,
                            transition: 'width 0.2s ease-out, height 0.2s ease-out',
                        }}
                        className="flex-shrink-0 relative"
                    >
                        {/* Scaled Panel */}
                        <div style={{
                            width: '850px',
                            height: `${panelHeightPx}px`,
                            transform: `scale(${zoomLevel})`,
                            transformOrigin: 'top left',
                            position: 'absolute',
                            top: 0,
                            left: 0
                        }}>
                            <div className="relative w-full h-full rounded-sm shadow-2xl flex bg-[#111] border border-[#222]">
                                {/* Left Rack Ear */}
                                <div className="w-10 flex-shrink-0 border-r border-[#000] flex flex-col justify-around items-center bg-gradient-to-r from-[#222] to-[#111]">
                                    <div className="w-3.5 h-5 rounded-full bg-[#050505] shadow-[inset_0_1px_3px_rgba(0,0,0,1)] border border-[#333]"></div>
                                    <div className="w-3.5 h-5 rounded-full bg-[#050505] shadow-[inset_0_1px_3px_rgba(0,0,0,1)] border border-[#333]"></div>
                                </div>

                                {/* Main Chassis Area */}
                                <div className="flex-grow relative flex flex-col min-w-0">
                                    {/* Top Lip */}
                                    <div className="h-3 w-full bg-gradient-to-b from-[#2a2a2a] to-[#111] border-b border-[#000]"></div>
                                    
                                    {/* Slots Container - Removed min-w so they don't break flex layout when scaling to 16 holes */}
                                    <div className="flex-grow flex flex-row items-center justify-evenly px-1 w-full h-full overflow-visible">
                                        {infraSlots.map((slot, idx) => {
                                            const slotId = slot.id || `${selectedPanel.id}-slot-${idx}`;
                                            const normalizedSlot = { ...slot, id: slotId };
                                            const instance = panelInstances.find(i => i.slot_id === slotId);

                                            const acceptedType = (slot.accepted_module_type || "").trim().toLowerCase();
                                            const isDHoleSlot = acceptedType === 'd-hole' || acceptedType === 'dhole';

                                            return (
                                                <div key={slotId} className={`flex-1 relative h-full min-w-0 flex items-center justify-center ${isDHoleSlot ? '' : 'border-x border-[#0a0a0a]'}`}>
                                                    <PeDroppableSlot slot={normalizedSlot} isOccupied={!!instance} className="rounded flex items-center justify-center">
                                                        {instance ? renderPEInstance(instance, normalizedSlot) : (
                                                            isDHoleSlot ? (
                                                                // Realistic Empty D-Hole directly on Chassis
                                                                <div className="w-10 h-10 relative flex flex-col items-center justify-center opacity-40 hover:opacity-100 transition-opacity">
                                                                    <div className="absolute inset-0 bg-[#050505] rounded-full shadow-[inset_0_3px_5px_rgba(0,0,0,1)] border border-[#333]"></div>
                                                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[15%] bg-[#111]"></div>
                                                                    <div className="absolute -top-1.5 -left-1.5 w-1.5 h-1.5 rounded-full bg-[#050505] border border-[#222]"></div>
                                                                    <div className="absolute -bottom-1.5 -right-1.5 w-1.5 h-1.5 rounded-full bg-[#050505] border border-[#222]"></div>
                                                                    <span className="text-[6px] font-bold text-[#666] absolute z-10 text-center leading-tight">{slot.name || 'Empty'}</span>
                                                                </div>
                                                            ) : (
                                                                // Empty Steck Bay Divider
                                                                <div className="w-full h-full relative flex flex-col justify-between items-center py-2 opacity-30 hover:opacity-100 transition-opacity bg-black/40 shadow-inner">
                                                                    <div className="w-2 h-2 rounded-full bg-[#050505] border border-[#222]"></div>
                                                                    <span className="text-[9px] font-bold text-[#666] text-center px-1 break-words transform -rotate-90 whitespace-nowrap mt-4">
                                                                        {slot.name || 'Empty'}
                                                                    </span>
                                                                    <div className="w-2 h-2 rounded-full bg-[#050505] border border-[#222] mt-auto"></div>
                                                                </div>
                                                            )
                                                        )}
                                                    </PeDroppableSlot>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Bottom Lip */}
                                    <div className="h-3 w-full bg-gradient-to-t from-[#2a2a2a] to-[#111] border-t border-[#000]"></div>
                                </div>

                                {/* Right Rack Ear */}
                                <div className="w-10 flex-shrink-0 border-l border-[#000] flex flex-col justify-around items-center bg-gradient-to-l from-[#222] to-[#111]">
                                    <div className="w-3.5 h-5 rounded-full bg-[#050505] shadow-[inset_0_1px_3px_rgba(0,0,0,1)] border border-[#333]"></div>
                                    <div className="w-3.5 h-5 rounded-full bg-[#050505] shadow-[inset_0_1px_3px_rgba(0,0,0,1)] border border-[#333]"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (isShowLoading || isLoading) return <div className="p-8 text-center text-gray-400">Loading Panel Builder...</div>;

    return (
        <div className="h-full flex flex-col bg-gray-950">
            <Toaster position="bottom-center" />
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="flex-grow flex min-h-0">
                    {/* Left Sidebar: Mounted Panels */}
                    <div className="w-72 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col z-20">
                        <div className="p-4 border-b border-gray-800">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Show Panels</h3>
                        </div>
                        <div className="flex-grow overflow-y-auto p-4 space-y-2">
                            {showPanels.length === 0 ? (
                                <p className="text-xs text-gray-500 italic text-center py-8">No panels found in racks.</p>
                            ) : (
                                showPanels.map(panel => (
                                    <button
                                        key={panel.id}
                                        onClick={() => setSelectedPanel(panel)}
                                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                                            selectedPanel?.id === panel.id
                                                ? 'bg-amber-500 border-amber-400 text-black shadow-lg shadow-amber-500/20'
                                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                                        }`}
                                    >
                                        <p className="font-bold text-sm truncate">{panel.instance_name}</p>
                                        <p className={`text-xs truncate ${selectedPanel?.id === panel.id ? 'text-black/70' : 'text-gray-500'}`}>
                                            {panel.rack_name} • {panel.equipment_templates?.model_number}
                                        </p>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Canvas Area */}
                    <div className="flex-grow min-w-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] bg-[#0a0c10] overflow-hidden flex flex-col z-10">
                        {renderCanvas()}
                    </div>

                    {/* Right Sidebar: PE Library */}
                    <div className="w-80 flex-shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col z-20">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">PE Library</h3>
                            <div className="flex gap-1">
                                <button 
                                    onClick={() => setIsFolderModalOpen(true)}
                                    className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors"
                                    title="New Folder"
                                >
                                    <FolderPlus size={14} />
                                </button>
                                <button 
                                    onClick={() => { setEditingTemplate(null); setTemplateFormData({ name: '', manufacturer: '', model_number: '', width_units: 1.0, depth_in: 0.0, slot_type: '', visual_style: 'standard', panel_slots: [], folder_id: '' }); setIsTemplateModalOpen(true); }}
                                    className="p-1.5 bg-gray-800 hover:bg-gray-700 text-amber-500 hover:text-amber-400 rounded transition-colors"
                                    title="New Template"
                                >
                                    <FilePlus size={14} />
                                </button>
                            </div>
                        </div>
                        <div className="p-4 border-b border-gray-800">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                                <input 
                                    type="text" 
                                    placeholder="Search library..." 
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg py-1.5 pl-9 pr-4 text-xs focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="flex-grow overflow-y-auto p-4">
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

            {/* Label Modal */}
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

            {/* Folder Creation Modal */}
            <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title="New Folder">
                <form onSubmit={handleCreateFolder} className="p-4 space-y-4">
                    <InputField label="Folder Name" value={folderName} onChange={(e) => setFolderName(e.target.value)} required autoFocus />
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setIsFolderModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400">Create</button>
                    </div>
                </form>
            </Modal>

            {/* Template Creation/Edit Modal */}
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

            {/* Deletion Confirmation */}
            {itemToDelete && (
                <ConfirmationModal
                    message={`Are you sure you want to delete this ${itemToDelete.type}? This action cannot be undone.`}
                    onConfirm={handleDeleteLibraryItem}
                    onCancel={() => setItemToDelete(null)}
                />
            )}
        </div>
    );
};

export default PanelBuilderView;