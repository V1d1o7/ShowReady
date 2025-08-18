import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Plus, Folder as FolderIcon, ChevronRight, ChevronDown, Trash2, GripVertical, Edit } from 'lucide-react';
import { api } from '../api/api';
import Card from '../components/Card';
import InputField from '../components/InputField';
import Modal from '../components/Modal';
import NewEquipmentModal from '../components/NewEquipmentModal';
import FolderOptions from '../components/FolderOptions';
import EditFolderModal from '../components/EditFolderModal';
import EditEquipmentModal from '../components/EditEquipmentModal';

// --- Draggable Tree Components ---

const DraggableItem = ({ item, type, children }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `${type}-${item.id}`,
        data: { type, item }
    });
    
    const style = {
        opacity: isDragging ? 0.5 : 1,
    };

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

const AdminTreeView = ({ folders, equipment, onDeleteFolder, onDeleteEquipment, onEditItem }) => {
    const [expandedFolders, setExpandedFolders] = useState({});

    const toggleFolder = (folderId) => {
        setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
    };

    const tree = useMemo(() => {
        const itemsById = {};
        [...folders, ...equipment].forEach(item => {
            itemsById[item.id] = { ...item, children: [] };
        });

        const roots = [];
        Object.values(itemsById).forEach(item => {
            const parentId = item.parent_id || item.folder_id;
            if (parentId && itemsById[parentId]) {
                itemsById[parentId].children.push(item);
            } else if (!parentId) {
                roots.push(item);
            }
        });
        
        Object.values(itemsById).forEach(item => {
            item.children.sort((a, b) => {
                const aIsFolder = 'parent_id' in a || (a.children && a.children.length > 0);
                const bIsFolder = 'parent_id' in b || (b.children && b.children.length > 0);
                if (aIsFolder && !bIsFolder) return -1;
                if (!aIsFolder && bIsFolder) return 1;
                return (a.name || a.model_number).localeCompare(b.name || b.model_number);
            });
        });
        return roots;
    }, [folders, equipment]);

    const renderNode = (node) => {
        const isFolder = 'parent_id' in node || (node.children && node.children.some(child => 'parent_id' in child));

        if (isFolder) {
            return (
                <li key={node.id}>
                    <DroppableFolder item={node}>
                        <div className="flex items-center group p-1 rounded-md hover:bg-gray-700">
                             <DraggableItem item={node} type="folder">
                                <div className="flex items-center flex-grow cursor-pointer" onClick={() => toggleFolder(node.id)}>
                                    {expandedFolders[node.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    <FolderIcon size={16} className="mx-2 flex-shrink-0" />
                                    <span className="truncate">{node.name}</span>
                                    {node.nomenclature_prefix && <span className="ml-2 text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">{node.nomenclature_prefix}</span>}
                                </div>
                             </DraggableItem>
                            <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => onEditItem(node, 'folder')} className="p-1 text-gray-500 hover:text-amber-400">
                                    <Edit size={14} />
                                </button>
                                <button onClick={() => onDeleteFolder(node.id)} className="p-1 text-gray-500 hover:text-red-400">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    </DroppableFolder>
                    {expandedFolders[node.id] && (
                        <ul className="pl-6 border-l border-gray-700 ml-3">
                            {node.children.map(child => renderNode(child))}
                        </ul>
                    )}
                </li>
            );
        }

        return (
             <li key={node.id} className="group my-1">
                <DraggableItem item={node} type="equipment">
                     <div className="flex items-center flex-grow p-2 rounded-md hover:bg-gray-700">
                        <div className="flex-grow">
                            <p className="font-bold text-sm truncate">{node.model_number} <span className="text-gray-400 font-normal">({node.width}-width)</span></p>
                            <p className="text-xs text-gray-400">{node.manufacturer} - {node.ru_height}RU</p>
                        </div>
                        <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => onEditItem(node, 'equipment')} className="p-1 text-gray-500 hover:text-amber-400">
                                <Edit size={14} />
                            </button>
                            <button onClick={() => onDeleteEquipment(node.id)} className="p-1 text-gray-500 hover:text-red-400">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                </DraggableItem>
            </li>
        );
    };

    return <ul>{tree.map(node => renderNode(node))}</ul>;
};


const NewFolderModal = ({ isOpen, onClose, onSubmit, folderTree }) => {
    const [name, setName] = useState('');
    const [parentId, setParentId] = useState('');
    const [prefix, setPrefix] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, parent_id: parentId || null, nomenclature_prefix: prefix || null });
        setName(''); setParentId(''); setPrefix('');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Default Folder">
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField label="Folder Name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
                <InputField label="Nomenclature Prefix (Optional)" type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g., KVM" />
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Parent Folder (Optional)</label>
                    <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                        <option value="">None (Root Level)</option>
                        <FolderOptions folders={folderTree} />
                    </select>
                </div>
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Create</button>
                </div>
            </form>
        </Modal>
    );
};


const AdminView = () => {
    const navigate = useNavigate();
    const [library, setLibrary] = useState({ folders: [], equipment: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
    const [activeDragItem, setActiveDragItem] = useState(null);
    const [editingItem, setEditingItem] = useState(null);
    const sensors = useSensors(useSensor(PointerSensor));

    const fetchAdminLibrary = async () => {
        setIsLoading(true);
        try {
            const libraryData = await api.getAdminLibrary();
            setLibrary(libraryData);
        } catch (error) {
            console.error("Failed to fetch admin library:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchAdminLibrary(); }, []);

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
            if (activeType === 'equipment' && activeItem.folder_id !== overItem.id) {
                setLibrary(prev => ({ ...prev, equipment: prev.equipment.map(e => e.id === activeItem.id ? { ...e, folder_id: overItem.id } : e)}));
                try { 
                    await api.updateAdminEquipment(activeItem.id, { folder_id: overItem.id }); 
                } catch (error) { 
                    console.error("Failed to move equipment", error); 
                    alert(`Error: ${error.message}`); 
                    fetchAdminLibrary(); 
                }
            } else if (activeType === 'folder' && activeItem.parent_id !== overItem.id) {
                 setLibrary(prev => ({ ...prev, folders: prev.folders.map(f => f.id === activeItem.id ? { ...f, parent_id: overItem.id } : f)}));
                try { 
                    await api.updateAdminFolder(activeItem.id, { parent_id: overItem.id }); 
                } catch (error) { 
                    console.error("Failed to move folder", error); 
                    alert(`Error: ${error.message}`); 
                    fetchAdminLibrary(); 
                }
            }
        }
    };

    const handleCreateFolder = async (folderData) => {
        try { 
            await api.createAdminFolder(folderData); 
            await fetchAdminLibrary(); 
        } catch(error) { 
            console.error("Failed to create folder", error); 
            alert(`Error: ${error.message}`); 
        }
        setIsFolderModalOpen(false);
    };

    const handleCreateEquipment = async (equipmentData) => {
        try { 
            await api.createAdminEquipment(equipmentData); 
            await fetchAdminLibrary(); 
        } catch(error) { 
            console.error("Failed to create equipment", error); 
            alert(`Error: ${error.message}`); 
        }
        setIsEquipmentModalOpen(false);
    };

    const handleDeleteFolder = async (folderId) => {
        if (!window.confirm("Are you sure? This will also delete all equipment and subfolders inside.")) return;
        try { 
            const res = await api.deleteAdminFolder(folderId); 
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Failed to delete folder.");
            }
            await fetchAdminLibrary();
        } catch(error) { 
            console.error("Failed to delete folder", error); 
            alert(`Error: ${error.message}`);
        }
    };

    const handleDeleteEquipment = async (equipmentId) => {
        if (!window.confirm("Are you sure?")) return;
        try { 
            const res = await api.deleteAdminEquipment(equipmentId); 
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Failed to delete equipment.");
            }
            await fetchAdminLibrary();
        } catch(error) { 
            console.error("Failed to delete equipment", error); 
            alert(`Error: ${error.message}`);
        }
    };
    
    const handleEditItem = (item, type) => {
        setEditingItem({ ...item, type });
    };

    const handleUpdateItem = async (updatedData) => {
        if (!editingItem) return;
        
        try {
            if (editingItem.type === 'folder') {
                await api.updateAdminFolder(editingItem.id, updatedData);
            } else {
                await api.updateAdminEquipment(editingItem.id, updatedData);
            }
            await fetchAdminLibrary();
        } catch(error) {
            console.error("Failed to update item", error);
            alert(`Error: ${error.message}`);
        } finally {
            setEditingItem(null);
        }
    };

    const folderTree = useMemo(() => {
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

    if (isLoading) return <div className="p-8 text-center text-gray-400">Loading Admin Library...</div>;

    return (
        <>
            <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">
                <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white">Super Admin Panel</h1>
                    </div>
                </header>
                <main className="space-y-8">
                    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                        <Card>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-white">Default Equipment Library</h2>
                                <div className="flex gap-2">
                                    <button onClick={() => setIsFolderModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600">
                                        <Plus size={16} /> New Folder
                                    </button>
                                    <button onClick={() => setIsEquipmentModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400">
                                        <Plus size={16} /> New Equipment
                                    </button>
                                </div>
                            </div>
                            <div className="p-4 bg-gray-900/50 rounded-lg">
                               <AdminTreeView 
                                   folders={library.folders} 
                                   equipment={library.equipment} 
                                   onDeleteFolder={handleDeleteFolder} 
                                   onDeleteEquipment={handleDeleteEquipment} 
                                   onEditItem={handleEditItem}
                                />
                            </div>
                        </Card>
                        <DragOverlay>
                            {activeDragItem ? (
                                <div className="bg-gray-700 p-2 rounded-md text-sm shadow-lg">
                                    {activeDragItem.name || activeDragItem.model_number}
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </main>
            </div>
            
            {/* Modals */}
            <NewFolderModal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} onSubmit={handleCreateFolder} folderTree={folderTree} />
            <NewEquipmentModal isOpen={isEquipmentModalOpen} onClose={() => setIsEquipmentModalOpen(false)} onSubmit={handleCreateEquipment} folderTree={folderTree} />
            
            {editingItem && editingItem.type === 'folder' && (
                <EditFolderModal 
                    isOpen={!!editingItem} 
                    onClose={() => setEditingItem(null)} 
                    onSubmit={handleUpdateItem} 
                    folder={editingItem} 
                />
            )}
            {editingItem && editingItem.type === 'equipment' && (
                <EditEquipmentModal 
                    isOpen={!!editingItem} 
                    onClose={() => setEditingItem(null)} 
                    onSubmit={handleUpdateItem} 
                    equipment={editingItem} 
                />
            )}
        </>
    );
};

export default AdminView;