import React, { useState } from 'react';
import { Folder as FolderIcon, ChevronRight, ChevronDown } from 'lucide-react';

// Draggable component for library equipment
const DraggableEquipment = ({ item, onDragStart, onContextMenu }) => {
    const handleDragStart = (e) => {
        // This is the native HTML drag and drop event
        e.stopPropagation();
        onDragStart(e, item);
    };

    return (
        <div 
            draggable
            onDragStart={handleDragStart}
            onContextMenu={(e) => onContextMenu && onContextMenu(e, item)}
            className="p-2 my-1 bg-gray-700 rounded-md cursor-grab active:cursor-grabbing"
        >
            <p className="font-bold text-sm truncate pointer-events-none">{item.model_number}</p>
            <p className="text-xs text-gray-400 pointer-events-none">{item.manufacturer} - {item.ru_height}RU</p>
        </div>
    );
};

// Main TreeView component
const TreeView = ({ treeData, onDragStart, onContextMenu }) => {
    const [expandedFolders, setExpandedFolders] = useState({});

    const toggleFolder = (folderId) => {
        setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
    };

    const renderNode = (node) => {
        const isFolder = 'children' in node;

        if (isFolder) {
            const isRootFolder = node.id === 'showready-root' || node.id === 'user-root';
            return (
                <li key={node.id} className={isRootFolder ? 'mt-4 first:mt-0' : ''}>
                    <div
                        className={`flex items-center cursor-pointer p-1 rounded-md hover:bg-gray-700 ${isRootFolder ? 'text-amber-400 font-bold' : ''}`}
                        onClick={() => toggleFolder(node.id)}
                    >
                        {expandedFolders[node.id] || isRootFolder ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <FolderIcon size={16} className="mx-2 flex-shrink-0" />
                        <span className="truncate">{node.name}</span>
                    </div>
                    {(expandedFolders[node.id] || isRootFolder) && (
                        <ul className="pl-4">
                            {node.children.map(child => renderNode(child))}
                        </ul>
                    )}
                </li>
            );
        }

        // It's an equipment item
        return (
            <li key={node.id}>
                <DraggableEquipment 
                    item={node} 
                    onDragStart={onDragStart} 
                    onContextMenu={onContextMenu} 
                />
            </li>
        );
    };

    return <ul>{treeData.map(node => renderNode(node))}</ul>;
};

export default TreeView;
