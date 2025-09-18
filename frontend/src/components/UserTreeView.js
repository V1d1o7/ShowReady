import React, { useState, useMemo, useEffect } from 'react';
import { Folder as FolderIcon, ChevronRight, ChevronDown, Trash2, Edit, Copy } from 'lucide-react';
import { api } from '../api/api';
import EditUserFolderModal from './EditUserFolderModal';
import EditUserEquipmentModal from './EditUserEquipmentModal';

const UserTreeView = ({ library, onDragStart, onDeleteFolder, onDeleteEquipment, onEditItem, showDefaultLibrary = true }) => {
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
            // The parent component should handle fetching the data
            alert(`${contextMenu.item.model_number} copied to your library!`);
        } catch (error) {
            console.error("Failed to copy equipment:", error);
            alert(`Error: ${error.message}`);
        }
        setContextMenu(null);
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
            // The parent component should handle fetching the data
        } catch(error) {
            console.error("Failed to update item", error);
            alert(`Error: ${error.message}`);
        } finally {
            setEditingItem(null);
        }
    };
    
    const tree = useMemo(() => {
        if (!library || !library.folders || !library.equipment) return [];

        const showReadyRoot = { id: 'showready-root', name: 'ShowReady Library', children: [] };
        const userRoot = { id: 'user-root', name: 'Your Equipment', children: [] };
        
        const foldersById = {};
        library.folders.forEach(f => {
            foldersById[f.id] = { ...f, children: [] };
        });

        const orphanEquipment = [];
        library.equipment.forEach(e => {
            if (e.folder_id && foldersById[e.folder_id]) {
                foldersById[e.folder_id].children.push(e);
            } else {
                orphanEquipment.push(e);
            }
        });

        const orphanFolders = [];
        Object.values(foldersById).forEach(folder => {
            if (folder.parent_id && foldersById[folder.parent_id]) {
                foldersById[folder.parent_id].children.push(folder);
            } else {
                orphanFolders.push(folder);
            }
        });

        [...orphanFolders, ...orphanEquipment].forEach(item => {
            if (item.is_default) {
                showReadyRoot.children.push(item);
            } else {
                userRoot.children.push(item);
            }
        });

        const sortChildren = (node) => {
            if (!node.children || node.children.length === 0) return;
            node.children.sort((a, b) => {
                const aIsFolder = 'parent_id' in a || (a.children && a.children.length > 0);
                const bIsFolder = 'parent_id' in b || (b.children && b.children.length > 0);
                if (aIsFolder && !bIsFolder) return -1;
                if (!aIsFolder && bIsFolder) return 1;
                return (a.name || a.model_number).localeCompare(b.name || b.model_number);
            });
            node.children.forEach(sortChildren);
        };

        sortChildren(showReadyRoot);
        sortChildren(userRoot);

        const roots = [userRoot];
        if (showDefaultLibrary) {
            roots.unshift(showReadyRoot);
        }

        return roots.filter(root => root.children.length > 0);
    }, [library, showDefaultLibrary]);

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
                    <div className="transition-colors rounded-lg">
                        <div className="flex items-center group p-1 rounded-md hover:bg-gray-700">
                            <div className="flex items-center flex-grow cursor-pointer" onClick={() => toggleFolder(node.id)}>
                                {expandedFolders[node.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                <FolderIcon size={16} className="mx-2 flex-shrink-0" />
                                <span className="truncate">{node.name}</span>
                                {node.nomenclature_prefix && <span className="ml-2 text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">{node.nomenclature_prefix}</span>}
                            </div>
                            {isUserItem && (
                                <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleEditItem(node, 'folder')} className="p-1 text-gray-500 hover:text-amber-400">
                                        <Edit size={14} />
                                    </button>
                                    <button onClick={() => onDeleteFolder(node.id)} className="p-1 text-gray-500 hover:text-red-400">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
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
                 <div
                    draggable
                    onDragStart={(e) => onDragStart && onDragStart(e, node)}
                    className="flex items-center flex-grow p-2 rounded-md hover:bg-gray-700 cursor-grab"
                    onContextMenu={(e) => handleContextMenu(e, node)}
                >
                    <div className="flex-grow">
                        <p className="font-bold text-sm truncate">{node.model_number} <span className="text-gray-400 font-normal">({node.width}-width)</span></p>
                        <p className="text-xs text-gray-400">{node.manufacturer} - {node.ru_height}RU</p>
                    </div>
                    {isUserItem && (
                        <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => onEditItem(node, 'equipment')} className="p-1 text-gray-500 hover:text-amber-400">
                                <Edit size={14} />
                            </button>
                            <button onClick={() => onDeleteEquipment(node.id)} className="p-1 text-gray-500 hover:text-red-400">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    )}
                </div>
            </li>
        );
    };
    
    useEffect(() => {
      setExpandedFolders(prev => ({...prev, 'showready-root': true, 'user-root': true}));
    }, []);

    return (
        <>
            <div className="max-h-[500px] overflow-y-auto pr-2">
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
            </div>

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