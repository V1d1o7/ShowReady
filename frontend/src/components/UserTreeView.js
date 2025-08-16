import React, { useState, useMemo, useEffect } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Folder as FolderIcon, ChevronRight, ChevronDown, Trash2, GripVertical, Edit, Copy } from 'lucide-react';
import { api } from '../api/api';
import EditUserFolderModal from './EditUserFolderModal';
import EditUserEquipmentModal from './EditUserEquipmentModal';

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

const UserTreeView = ({ library, onLibraryUpdate }) => {
    const [expandedFolders, setExpandedFolders] = useState({});
    const [editingItem, setEditingItem] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);

    const toggleFolder = (folderId) => {
        setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
    };

    const handleContextMenu = (e, item) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, item: item });
        
        const handleClickOutside = () => {
            setContextMenu(null);
            window.removeEventListener('click', handleClickOutside);
        };
        window.addEventListener('click', handleClickOutside, { once: true });
    };

    const handleCopyToLibrary = async () => {
        if (!contextMenu || !contextMenu.item) return;
        try {
            await api.copyEquipmentToLibrary({ template_id: contextMenu.item.id, folder_id: null });
            onLibraryUpdate();
            alert(`${contextMenu.item.model_number} copied to your library!`);
        } catch (error) {
            console.error("Failed to copy equipment:", error);
            alert(`Error: ${error.message}`);
        }
        setContextMenu(null);
    };

    const handleDeleteFolder = async (folderId) => {
        if (!window.confirm("Are you sure? This will also delete all equipment and subfolders inside.")) return;
        try { 
            await api.deleteUserFolder(folderId); 
            onLibraryUpdate();
        } catch(error) { 
            console.error("Failed to delete folder", error); 
            alert(`Error: ${error.message}`);
        }
    };

    const handleDeleteEquipment = async (equipmentId) => {
        if (!window.confirm("Are you sure?")) return;
        try { 
            await api.deleteUserEquipment(equipmentId);
            onLibraryUpdate();
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
                await api.updateUserFolder(editingItem.id, updatedData);
            } else {
                await api.updateUserEquipment(editingItem.id, updatedData);
            }
            onLibraryUpdate();
        } catch(error) {
            console.error("Failed to update item", error);
            alert(`Error: ${error.message}`);
        } finally {
            setEditingItem(null);
        }
    };
    
    const tree = useMemo(() => {
        // Ensure library and its properties are defined before accessing them
        if (!library || !library.folders || !library.equipment) return [];

        const showReadyRoot = { id: 'showready-root', name: 'ShowReady Library', children: [] };
        const userRoot = { id: 'user-root', name: 'Your Equipment', children: [] };
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
        
        // Sort children alphabetically, with folders appearing before equipment
        Object.values(itemsById).forEach(item => {
            item.children.sort((a, b) => {
                const aIsFolder = 'parent_id' in a || (a.children && a.children.length > 0);
                const bIsFolder = 'parent_id' in b || (b.children && b.children.length > 0);
                if (aIsFolder && !bIsFolder) return -1;
                if (!aIsFolder && bIsFolder) return 1;
                return (a.name || a.model_number).localeCompare(b.name || b.model_number);
            });
        });

        return [showReadyRoot, userRoot];
    }, [library]);

    const userFolderTree = useMemo(() => {
        if (!library || !library.folders) return [];

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

    const renderNode = (node) => {
        const isFolder = 'parent_id' in node || (node.children && node.children.some(child => 'parent_id' in child));
        const isUserItem = !node.is_default;

        if (isFolder) {
            return (
                <li key={node.id}>
                    <DroppableFolder item={node}>
                        <div className="flex items-center group p-1 rounded-md hover:bg-gray-700">
                            {isUserItem && (
                                <DraggableItem item={node} type="folder">
                                    <div className="flex items-center flex-grow cursor-pointer" onClick={() => toggleFolder(node.id)}>
                                        {expandedFolders[node.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        <FolderIcon size={16} className="mx-2 flex-shrink-0" />
                                        <span className="truncate">{node.name}</span>
                                        {node.nomenclature_prefix && <span className="ml-2 text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">{node.nomenclature_prefix}</span>}
                                    </div>
                                </DraggableItem>
                            )}
                            {!isUserItem && (
                                <div className="flex items-center flex-grow cursor-pointer" onClick={() => toggleFolder(node.id)}>
                                    {expandedFolders[node.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    <FolderIcon size={16} className="mx-2 flex-shrink-0" />
                                    <span className="truncate">{node.name}</span>
                                </div>
                            )}
                            {isUserItem && (
                                <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleEditItem(node, 'folder')} className="p-1 text-gray-500 hover:text-amber-400">
                                        <Edit size={14} />
                                    </button>
                                    <button onClick={() => handleDeleteFolder(node.id)} className="p-1 text-gray-500 hover:text-red-400">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            )}
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
                     <div className="flex items-center flex-grow p-2 rounded-md hover:bg-gray-700"
                        onContextMenu={(e) => handleContextMenu(e, node)}
                    >
                        <div className="flex-grow">
                            <p className="font-bold text-sm truncate">{node.model_number} <span className="text-gray-400 font-normal">({node.width}-width)</span></p>
                            <p className="text-xs text-gray-400">{node.manufacturer} - {node.ru_height}RU</p>
                        </div>
                        {isUserItem && (
                            <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEditItem(node, 'equipment')} className="p-1 text-gray-500 hover:text-amber-400">
                                    <Edit size={14} />
                                </button>
                                <button onClick={() => handleDeleteEquipment(node.id)} className="p-1 text-gray-500 hover:text-red-400">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                </DraggableItem>
            </li>
        );
    };
    
    // Auto-expand root folders on initial load
    useEffect(() => {
      setExpandedFolders(prev => ({...prev, 'showready-root': true, 'user-root': true}));
    }, []);

    return (
        <>
            <ul>
                {tree.map(root => (
                     <li key={root.id} className="mb-4">
                        <div
                            className="flex items-center cursor-pointer p-1 rounded-md text-amber-400 font-bold"
                            onClick={() => toggleFolder(root.id)}
                        >
                            {expandedFolders[root.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <span className="ml-2 truncate">{root.name}</span>
                        </div>
                        {expandedFolders[root.id] && (
                            <ul className="pl-4">
                                {root.children.map(child => renderNode(child))}
                            </ul>
                        )}
                    </li>
                ))}
            </ul>

            {editingItem && editingItem.type === 'folder' && (
                <EditUserFolderModal 
                    isOpen={!!editingItem} 
                    onClose={() => setEditingItem(null)} 
                    onSubmit={handleUpdateItem} 
                    folder={editingItem} 
                    userFolderTree={userFolderTree}
                />
            )}
            {editingItem && editingItem.type === 'equipment' && (
                <EditUserEquipmentModal 
                    isOpen={!!editingItem} 
                    onClose={() => setEditingItem(null)} 
                    onSubmit={handleUpdateItem} 
                    equipment={editingItem} 
                    userFolderTree={userFolderTree}
                />
            )}
            {contextMenu && contextMenu.item.is_default && (
                <div 
                    className="absolute z-50 bg-gray-900 border border-gray-700 rounded-md shadow-lg p-1 text-white" 
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <button 
                        onClick={handleCopyToLibrary} 
                        className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 rounded"
                    >
                       <Copy size={14} /> Copy to My Library
                    </button>
                </div>
            )}
        </>
    );
};

export default UserTreeView;