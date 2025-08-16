import React, { useState, useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Folder as FolderIcon, ChevronRight, ChevronDown, Trash2, GripVertical, Edit } from 'lucide-react';

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

const UserTreeView = ({ folders, equipment, onDeleteFolder, onDeleteEquipment, onEditItem }) => {
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


export default UserTreeView;