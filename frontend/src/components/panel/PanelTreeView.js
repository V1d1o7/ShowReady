import React, { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ChevronRight, ChevronDown, Folder as FolderIcon, Trash2, Edit, Copy } from 'lucide-react';

export const PeDraggableItem = ({ item, type, children }) => {
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

export default PanelTreeView;