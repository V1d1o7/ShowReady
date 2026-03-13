import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Plus, Folder as FolderIcon, ChevronRight, ChevronDown, Search, Edit, Trash2, Download } from 'lucide-react';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import Modal from '../components/Modal';
import InputField from '../components/InputField';
import toast from 'react-hot-toast';

// --- Components ---

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

const PeDroppableSlot = ({ slot, onDrop, children, isOccupied }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `slot-${slot.id}`,
        data: { slot }
    });

    return (
        <div 
            ref={setNodeRef} 
            className={`relative transition-colors rounded ${isOver ? (isOccupied ? 'bg-red-500/20' : 'bg-green-500/20') : ''}`}
        >
            {children}
        </div>
    );
};

const PanelBuilderView = () => {
    const { showId, racks, isLoading: isShowLoading } = useShow();
    const [selectedPanel, setSelectedPanel] = useState(null);
    const [peLibrary, setPeLibrary] = useState({ folders: [], templates: [] });
    const [panelInstances, setPanelInstances] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeDragItem, setActiveDragItem] = useState(null);
    const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
    const [editingInstance, setEditingInstance] = useState(null);
    const [expandedFolders, setExpandedFolders] = useState({});

    // 1. Load PE Library & Panels
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [folders, templates] = await Promise.all([
                api.getPanelFolders(),
                api.getPanelTemplates()
            ]);
            setPeLibrary({ folders, templates });
        } catch (error) {
            console.error("Failed to load Panel Builder data:", error);
            toast.error("Failed to load PE Library.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // 2. Load instances when a panel is selected
    useEffect(() => {
        if (selectedPanel) {
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

    // 3. Identify all "Panels" in the show's racks
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

    // 4. Handle DND
    const sensors = useSensors(useSensor(PointerSensor, {
        activationConstraint: { distance: 5 }
    }));

    const handleDragStart = (event) => {
        setActiveDragItem(event.active.data.current.item);
    };

    const handleDragEnd = async (event) => {
        setActiveDragItem(null);
        const { active, over } = event;
        if (!over || !selectedPanel) return;

        const template = active.data.current.item;
        const slot = over.data.current.slot;

        // Compatibility check
        if (slot.accepted_module_type && slot.accepted_module_type !== template.slot_type) {
            toast.error(`Compatibility error: This slot requires ${slot.accepted_module_type}.`);
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

            // Refresh instances
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

    // --- Renderers ---

    const renderPEInstance = (instance, slot) => {
        const template = instance.template;
        if (!template) return null;

        return (
            <div className="absolute inset-0 z-10 bg-gray-800 border border-gray-600 rounded flex flex-col items-center justify-center group overflow-hidden">
                <div className="text-[10px] font-bold text-gray-400 truncate w-full px-1 text-center">
                    {template.model_number || template.name}
                </div>
                {instance.label && (
                    <div className="text-[9px] bg-amber-500 text-black px-1 rounded mt-0.5 max-w-full truncate">
                        {instance.label}
                    </div>
                )}
                
                {/* Sub-Slots (Recursion) */}
                {template.panel_slots && template.panel_slots.length > 0 && (
                    <div className="w-full h-full flex flex-wrap gap-1 p-1">
                        {template.panel_slots.map(subSlot => {
                            const child = (instance.children || []).find(c => c.slot_id === subSlot.id);
                            return (
                                <div key={subSlot.id} className="relative flex-grow min-w-[10px] min-h-[10px] bg-black/30 rounded-sm">
                                    <PeDroppableSlot slot={{ ...subSlot, parent_instance_id: instance.id }} isOccupied={!!child}>
                                        {child ? renderPEInstance(child, subSlot) : null}
                                    </PeDroppableSlot>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Controls */}
                <div className="absolute top-0 right-0 p-0.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-bl">
                    <button onClick={() => handleOpenLabelModal(instance)} className="text-amber-400 hover:text-amber-300">
                        <Edit size={10} />
                    </button>
                    <button onClick={() => handleRemoveInstance(instance.id)} className="text-red-500 hover:text-red-400">
                        <Trash2 size={10} />
                    </button>
                </div>
            </div>
        );
    };

    const renderCanvas = () => {
        if (!selectedPanel) {
            return (
                <div className="h-full flex items-center justify-center text-gray-500 italic">
                    Select a panel from the left library to start building.
                </div>
            );
        }

        const infraSlots = selectedPanel.equipment_templates?.panel_slots || [];
        const ruHeight = selectedPanel.equipment_templates?.ru_height || 1;

        return (
            <div className="p-8 text-center">
                <div className="mb-4 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-white text-left">{selectedPanel.instance_name}</h2>
                        <p className="text-sm text-gray-400 text-left">{selectedPanel.equipment_templates?.manufacturer} {selectedPanel.equipment_templates?.model_number} ({selectedPanel.rack_name})</p>
                    </div>
                    <button 
                        onClick={handleExport}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded-lg transition-colors"
                    >
                        <Download size={16} /> Export All Panels
                    </button>
                </div>

                {/* Panel Frame Container */}
                <div 
                    className="relative bg-black border-4 border-gray-700 rounded-lg mx-auto overflow-hidden shadow-2xl"
                    style={{ 
                        width: '800px', 
                        height: `${ruHeight * 80}px`,
                    }}
                >
                    <div className="absolute inset-y-0 left-0 w-8 border-r border-gray-800 flex flex-col justify-around px-2">
                        <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                        <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                    </div>
                    <div className="absolute inset-y-0 right-0 w-8 border-l border-gray-800 flex flex-col justify-around px-2 items-end">
                        <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                        <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                    </div>

                    {/* Main Slots Area */}
                    <div className="absolute inset-y-0 left-8 right-8 flex items-center justify-center gap-2 p-4">
                        {infraSlots.map(slot => {
                            const instance = panelInstances.find(i => i.slot_id === slot.id);
                            return (
                                <div key={slot.id} className="relative flex-grow h-full max-w-[140px] bg-gray-900 border border-dashed border-gray-700 rounded-md">
                                    <PeDroppableSlot slot={slot} isOccupied={!!instance}>
                                        {instance ? renderPEInstance(instance, slot) : (
                                            <div className="h-full flex items-center justify-center opacity-20 group">
                                                <span className="text-[8px] font-bold text-gray-400 group-hover:opacity-100 transition-opacity">{slot.name}</span>
                                            </div>
                                        )}
                                    </PeDroppableSlot>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const renderPELibrary = () => {
        const tree = [];
        const folderMap = {};
        peLibrary.folders.forEach(f => {
            folderMap[f.id] = { ...f, children: [], templates: [] };
        });

        peLibrary.templates.forEach(t => {
            if (t.folder_id && folderMap[t.folder_id]) {
                folderMap[t.folder_id].templates.push(t);
            } else {
                tree.push({ type: 'template', ...t });
            }
        });

        peLibrary.folders.forEach(f => {
            if (f.parent_id && folderMap[f.parent_id]) {
                folderMap[f.parent_id].children.push(folderMap[f.id]);
            } else if (!f.parent_id) {
                tree.push({ type: 'folder', ...folderMap[f.id] });
            }
        });

        const toggleFolder = (id) => setExpandedFolders(prev => ({ ...prev, [id]: !prev[id] }));

        const renderNode = (node) => {
            if (node.type === 'folder' || (!node.type && 'name' in node)) {
                const isOpen = expandedFolders[node.id];
                return (
                    <li key={node.id} className="mb-1">
                        <div 
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-700 rounded-lg cursor-pointer text-sm text-gray-300 transition-colors"
                            onClick={() => toggleFolder(node.id)}
                        >
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <FolderIcon size={14} className="text-amber-500" />
                            <span className="truncate">{node.name}</span>
                        </div>
                        {isOpen && (
                            <ul className="pl-4 border-l border-gray-700 ml-3.5 mt-1 space-y-1">
                                {(node.children || []).map(child => renderNode(child))}
                                {(node.templates || []).map(temp => renderNode({ type: 'template', ...temp }))}
                            </ul>
                        )}
                    </li>
                );
            }

            return (
                <li key={node.id}>
                    <PeDraggableItem item={node} type="template">
                        <div className="group flex items-center justify-between gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-700 border border-gray-700 rounded-lg transition-all cursor-grab">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-white truncate">{node.name}</p>
                                <p className="text-[10px] text-gray-400 truncate">{node.manufacturer} - {node.model_number}</p>
                            </div>
                            <div className="px-1.5 py-0.5 bg-gray-900 rounded text-[8px] font-mono text-gray-500 whitespace-nowrap">
                                {node.slot_type}
                            </div>
                        </div>
                    </PeDraggableItem>
                </li>
            );
        };

        return (
            <ul className="space-y-2">
                {tree.map(node => renderNode(node))}
            </ul>
        );
    };

    if (isShowLoading || isLoading) return <div className="p-8 text-center text-gray-400">Loading Panel Builder...</div>;

    return (
        <div className="h-full flex flex-col bg-gray-950">
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="flex-grow flex min-h-0">
                    {/* Left Sidebar: Mounted Panels */}
                    <div className="w-72 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
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
                    <div className="flex-grow bg-[#0f1115] overflow-auto flex flex-col">
                        {renderCanvas()}
                    </div>

                    {/* Right Sidebar: PE Library */}
                    <div className="w-80 flex-shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">ShowReady PE Library</h3>
                            <button className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors">
                                <Plus size={16} />
                            </button>
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
                            {renderPELibrary()}
                        </div>
                    </div>
                </div>

                <DragOverlay>
                    {activeDragItem ? (
                        <div className="bg-gray-700 p-2 rounded-md text-sm shadow-xl border border-amber-500/50 min-w-[120px]">
                            <p className="font-bold text-white">{activeDragItem.name}</p>
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
        </div>
    );
};

export default PanelBuilderView;
