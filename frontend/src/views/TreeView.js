import React, { useState, useMemo } from 'react';
import { Folder as FolderIcon, ChevronRight, ChevronDown } from 'lucide-react';

const TreeView = ({ folders = [], equipment = [], onDragStart }) => {
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
            } else {
                roots.push(item);
            }
        });
        return roots;
    }, [folders, equipment]);

    const renderNode = (node) => {
        const isFolder = 'parent_id' in node || (node.children && node.children.some(child => 'parent_id' in child));

        if (isFolder) {
            return (
                <li key={node.id}>
                    <div
                        className="flex items-center cursor-pointer p-1 rounded-md hover:bg-gray-700"
                        onClick={() => toggleFolder(node.id)}
                    >
                        {expandedFolders[node.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <FolderIcon size={16} className="mx-2 flex-shrink-0" />
                        <span className="truncate">{node.name}</span>
                    </div>
                    {expandedFolders[node.id] && (
                        <ul className="pl-4">
                            {node.children.map(child => renderNode(child))}
                        </ul>
                    )}
                </li>
            );
        }

        return (
            <li key={node.id}>
                <div
                    draggable
                    onDragStart={(e) => onDragStart(e, node)}
                    className="p-2 my-1 bg-gray-700 rounded-md cursor-grab active:cursor-grabbing"
                >
                    <p className="font-bold text-sm truncate">{node.model_number}</p>
                    <p className="text-xs text-gray-400">{node.manufacturer} - {node.ru_height}RU</p>
                </div>
            </li>
        );
    };

    return <ul>{tree.map(node => renderNode(node))}</ul>;
};

export default TreeView;