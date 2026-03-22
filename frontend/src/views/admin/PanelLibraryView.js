import React, { useState, useEffect, useMemo } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Plus, Folder as FolderIcon, ChevronRight, ChevronDown, Trash2, GripVertical, Edit } from 'lucide-react';
import { api } from '../../api/api';
import Card from '../../components/Card';
import ConfirmationModal from '../../components/ConfirmationModal';
import toast, { Toaster } from 'react-hot-toast';

// Clean component imports
import PanelFolderModal from '../../components/panel/PanelFolderModal';
import EditPanelFolderModal from '../../components/panel/EditPanelFolderModal';
import PanelTemplateModal from '../../components/panel/PanelTemplateModal';

// --- Draggable Tree Components ---

const DraggableItem = ({ item, type, children }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `pe-${type}-${item.id}`,
        data: { type, item }
    });
    const style = { opacity: isDragging ? 0.5 : 1 };
    return (
        <div ref={setNodeRef} style={style} className="flex items-center">
            <span {...listeners} {...attributes} className="cursor-grab p-1 text-gray-500 hover:text-white">
                <GripVertical size={16} />
            </span>
            {children}
        </div>
    );
};

const DroppableFolder = ({ item, children }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `folder-${item.id}`,
        data: { type: 'folder', item }
    });
    return (
        <div ref={setNodeRef} className={`transition-colors rounded-lg ${isOver ? 'bg-blue-500/20' : ''}`}>
            {children}
        </div>
    );
};

// --- Main View ---

const PanelLibraryView = () => {
    const [library, setLibrary] = useState({ folders: [], templates: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [activeDragItem, setActiveDragItem] = useState(null);
    const [expandedFolders, setExpandedFolders] = useState({});
    
    const sensors = useSensors(useSensor(PointerSensor));

    const fetchData = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        try {
            const [folders, templates] = await Promise.all([
                api.getPanelFolders(),
                api.getPanelTemplates()
            ]);
            setLibrary({ folders, templates });
        } catch (error) {
            toast.error("Failed to load PE library.");
        } finally {
            if (showLoading) setIsLoading(false);
        }
    };

    useEffect(() => { 
        fetchData(true); 
    }, []);

    // --- Drag and Drop Logic ---
    const handleDragStart = (event) => {
        setActiveDragItem(event.active.data.current.item);
    };
    
    const handleDragEnd = async (event) => {
        setActiveDragItem(null);
        const { active, over } = event;

        if (!over || active.id === over.id) return;

        const activeType = active.data.current.type;
        const activeItem = active.data.current.item;
        const overType = over.data.current.type;
        const overItem = over.data.current.item;

        if (overType === 'folder') {
            if (activeType === 'template' && activeItem.folder_id !== overItem.id) {
                // Optimistic UI Update
                setLibrary(prev => ({ 
                    ...prev, 
                    templates: prev.templates.map(t => t.id === activeItem.id ? { ...t, folder_id: overItem.id } : t)
                }));
                try { 
                    await api.updateAdminPanelTemplate(activeItem.id, { folder_id: overItem.id }); 
                    toast.success("Template moved.");
                } catch (error) { 
                    toast.error(`Error: ${error.message}`); 
                    fetchData(false); 
                }
            } else if (activeType === 'folder' && activeItem.parent_id !== overItem.id && activeItem.id !== overItem.id) {
                // Prevent circular references (can't move a folder into its own child)
                let isChild = false;
                let currentParentCheck = overItem.id;
                while (currentParentCheck) {
                    if (currentParentCheck === activeItem.id) {
                        isChild = true;
                        break;
                    }
                    const parentFolder = library.folders.find(f => f.id === currentParentCheck);
                    currentParentCheck = parentFolder ? parentFolder.parent_id : null;
                }

                if (isChild) {
                    toast.error("Cannot move a folder into its own subfolder.");
                    return;
                }

                setLibrary(prev => ({ 
                    ...prev, 
                    folders: prev.folders.map(f => f.id === activeItem.id ? { ...f, parent_id: overItem.id } : f)
                }));

                try { 
                    const res = await fetch(`/api/panels/admin/folders/${activeItem.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${(await api.supabase.auth.getSession()).data.session?.access_token}`
                        },
                        body: JSON.stringify({ parent_id: overItem.id })
                    });
                    if (!res.ok) throw new Error("Failed to update folder parent");
                    toast.success("Folder moved.");
                } catch (error) { 
                    toast.error(`Error: ${error.message}`); 
                    fetchData(false); 
                }
            }
        }
    };


    // --- Handlers ---
    const handleCreateFolder = async (folderData) => {
        try {
            await api.createAdminPanelFolder(folderData);
            toast.success("Folder created.");
            fetchData(false);
            setIsFolderModalOpen(false);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleUpdateFolder = async (folderData) => {
        if (!editingItem) return;
        try {
            const res = await fetch(`/api/panels/admin/folders/${editingItem.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${(await api.supabase.auth.getSession()).data.session?.access_token}`
                },
                body: JSON.stringify(folderData)
            });
            if (!res.ok) throw new Error("Failed to update folder");
            
            toast.success("Folder updated.");
            fetchData(false);
            setEditingItem(null);
        } catch (error) {
            toast.error(error.message);
        }
    }

    const handleSaveTemplate = async (payload) => {
        const finalPayload = {
            ...payload,
            folder_id: payload.folder_id || null,
            width_units: parseFloat(payload.width_units) || 1.0,
            depth_in: parseFloat(payload.depth_in) || 0.0,
        };

        try {
            if (editingItem && editingItem.type === 'template') {
                await api.updateAdminPanelTemplate(editingItem.id, finalPayload);
                toast.success("Template updated.");
            } else {
                await api.createAdminPanelTemplate(finalPayload);
                toast.success("Template created.");
            }
            fetchData(false);
            setIsTemplateModalOpen(false);
            setEditingItem(null);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleDelete = async () => {
        try {
            if (itemToDelete.type === 'folder') {
                await api.deleteAdminPanelFolder(itemToDelete.id);
            } else {
                await api.deleteAdminPanelTemplate(itemToDelete.id);
            }
            toast.success("Item deleted.");
            fetchData(false);
            setItemToDelete(null);
        } catch (error) {
            toast.error(error.message);
        }
    };

    // --- Tree Data Structures ---

    // 1. Strict Folder-Only tree for Select Dropdowns
    const panelFolderTree = useMemo(() => {
        const itemsById = {};
        library.folders.forEach(item => { itemsById[item.id] = { ...item, children: [] }; });
        const roots = [];
        Object.values(itemsById).forEach(item => {
            if (item.parent_id && itemsById[item.parent_id]) {
                itemsById[item.parent_id].children.push(item);
            } else if (!item.parent_id) {
                roots.push(item);
            }
        });
        return roots;
    }, [library.folders]);


    // 2. Mixed tree for rendering the library UI
    const renderTree = useMemo(() => {
        const items = [];
        const folderMap = {};
        library.folders.forEach(f => folderMap[f.id] = { ...f, children: [], templates: [] });
        
        library.templates.forEach(t => {
            if (t.folder_id && folderMap[t.folder_id]) folderMap[t.folder_id].templates.push(t);
            else items.push({ type: 'template', ...t });
        });
        
        library.folders.forEach(f => {
            if (f.parent_id && folderMap[f.parent_id]) folderMap[f.parent_id].children.push(folderMap[f.id]);
            else if (!f.parent_id) items.push({ type: 'folder', ...folderMap[f.id] });
        });

        // Sort items (folders first, then alphabetically)
        const sortNodes = (a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            return (a.name || '').localeCompare(b.name || '');
        };
        items.sort(sortNodes);

        return items;
    }, [library]);

    // --- Renderer ---
    const renderNode = (node) => {
        if (node.type === 'folder' || (!node.type && 'name' in node)) {
            const isOpen = expandedFolders[node.id];
            return (
                <li key={node.id} className="mb-1">
                    <DroppableFolder item={node}>
                        <div className="flex items-center group p-1 rounded-md hover:bg-gray-700">
                            <DraggableItem item={node} type="folder">
                                <div className="flex items-center flex-grow cursor-pointer" onClick={() => setExpandedFolders({...expandedFolders, [node.id]: !isOpen})}>
                                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    <FolderIcon size={16} className="mx-2 text-amber-500" />
                                    <span className="truncate">{node.name}</span>
                                </div>
                            </DraggableItem>
                            <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setEditingItem({...node, type: 'folder'}); }} className="p-1 text-gray-500 hover:text-amber-400">
                                    <Edit size={14} />
                                </button>
                                <button onClick={() => setItemToDelete({ id: node.id, type: 'folder' })} className="p-1 text-gray-500 hover:text-red-400">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    </DroppableFolder>
                    {isOpen && (
                        <ul className="pl-6 border-l border-gray-700 ml-3">
                            {(node.children || []).sort((a,b) => a.name.localeCompare(b.name)).map(child => renderNode({...child, type: 'folder'}))}
                            {(node.templates || []).sort((a,b) => a.name.localeCompare(b.name)).map(t => renderNode({ type: 'template', ...t }))}
                        </ul>
                    )}
                </li>
            );
        }

        return (
            <li key={node.id} className="my-1">
                 <DraggableItem item={node} type="template">
                    <div className="flex items-center flex-grow p-2 rounded-md hover:bg-gray-700 group">
                        <div className="flex-grow">
                            <p className="font-bold text-sm text-white">{node.name}</p>
                            <p className="text-xs text-gray-400">{node.manufacturer} {node.model_number}</p>
                        </div>
                        <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingItem({...node, type: 'template'}); setIsTemplateModalOpen(true); }} className="p-1 text-gray-500 hover:text-amber-400">
                                <Edit size={14} />
                            </button>
                            <button onClick={() => setItemToDelete({ id: node.id, type: 'template' })} className="p-1 text-gray-500 hover:text-red-400">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                </DraggableItem>
            </li>
        );
    };

    if (isLoading) return <div className="p-8 text-center text-gray-400">Loading PE Library...</div>;

    return (
        <div className="p-6 h-full flex flex-col">
            <Toaster position="bottom-center" />
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="flex justify-between items-center mb-6 flex-shrink-0">
                    <h1 className="text-3xl font-bold text-white">ShowReady PE Library Management</h1>
                    <div className="flex gap-2">
                        <button onClick={() => setIsFolderModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600">
                            <Plus size={16} /> New Folder
                        </button>
                        <button onClick={() => { setEditingItem(null); setIsTemplateModalOpen(true); }} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black rounded-lg hover:bg-amber-400 font-bold">
                            <Plus size={16} /> New PE Template
                        </button>
                    </div>
                </div>

                <Card className="flex-grow min-h-0 overflow-y-auto">
                    <ul className="space-y-1">
                        {renderTree.map(node => renderNode(node))}
                    </ul>
                </Card>

                <DragOverlay>
                    {activeDragItem ? (
                        <div className="bg-gray-700 p-2 rounded-md text-sm shadow-lg text-white font-bold border border-gray-600">
                            {activeDragItem.name}
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            {/* Render properly separated modal components */}
            <PanelFolderModal 
                isOpen={isFolderModalOpen} 
                onClose={() => setIsFolderModalOpen(false)} 
                onCreate={handleCreateFolder} 
                folderTree={panelFolderTree} 
            />

            {editingItem && editingItem.type === 'folder' && (
                <EditPanelFolderModal 
                    isOpen={!!editingItem} 
                    onClose={() => setEditingItem(null)} 
                    onSubmit={handleUpdateFolder} 
                    folder={editingItem} 
                    folderTree={panelFolderTree} 
                />
            )}

            <PanelTemplateModal 
                isOpen={isTemplateModalOpen} 
                onClose={() => { setIsTemplateModalOpen(false); setEditingItem(null); }} 
                editingTemplate={editingItem?.type === 'template' ? editingItem : null}
                folders={library.folders} 
                onSave={handleSaveTemplate} 
            />

            {itemToDelete && (
                <ConfirmationModal
                    message={`Are you sure you want to delete this ${itemToDelete.type}? This action cannot be undone.`}
                    onConfirm={handleDelete}
                    onCancel={() => setItemToDelete(null)}
                />
            )}
        </div>
    );
};

export default PanelLibraryView;