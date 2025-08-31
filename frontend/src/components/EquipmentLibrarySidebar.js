import React, { useMemo, useState } from 'react';
import { Folder as FolderIcon, ChevronRight, ChevronDown, Copy } from 'lucide-react';
import { api } from '../api/api';

const DraggableEquipment = ({ equipment, onDragStart, onContextMenu }) => {
    const handleDragStart = (e) => {
        e.stopPropagation();
        onDragStart(e, equipment);
    };

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onContextMenu={(e) => onContextMenu(e, equipment)}
            className="p-2 my-1 bg-gray-700 rounded-md cursor-grab hover:bg-gray-600 group"
        >
            <p className="font-bold text-sm truncate">{equipment.model_number}</p>
            <p className="text-xs text-gray-400">{equipment.manufacturer} - {equipment.ru_height}RU</p>
        </div>
    );
};

const Folder = ({ folder, allEquipment, expandedFolders, toggleFolder, onDragStart, onContextMenu }) => {
    const isExpanded = expandedFolders[folder.id];

    return (
        <li>
            <div
                className="flex items-center p-1 cursor-pointer hover:bg-gray-700 rounded-md"
                onClick={() => toggleFolder(folder.id)}
            >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <FolderIcon size={16} className="mx-2 flex-shrink-0" />
                <span className="font-bold truncate">{folder.name}</span>
            </div>
            {isExpanded && (
                <ul className="pl-6 border-l border-gray-600 ml-3">
                    {folder.children.map(child => (
                        <Folder
                            key={child.id}
                            folder={child}
                            allEquipment={allEquipment}
                            expandedFolders={expandedFolders}
                            toggleFolder={toggleFolder}
                            onDragStart={onDragStart}
                            onContextMenu={onContextMenu}
                        />
                    ))}
                    {allEquipment
                        .filter(e => e.folder_id === folder.id)
                        .map(e => <DraggableEquipment key={e.id} equipment={e} onDragStart={onDragStart} onContextMenu={onContextMenu} />)
                    }
                </ul>
            )}
        </li>
    );
};


const EquipmentLibrarySidebar = ({ library, onDragStart, onLibraryUpdate }) => {
    const [expandedFolders, setExpandedFolders] = useState({});
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

    const tree = useMemo(() => {
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

        // Automatically expand the root folders
        if (!expandedFolders['showready-root']) {
            setExpandedFolders(prev => ({...prev, 'showready-root': true, 'user-root': true}));
        }

        return [showReadyRoot, userRoot];
    }, [library, expandedFolders]);

    return (
        <div className="w-80 flex-shrink-0 bg-gray-800 p-3 rounded-xl flex flex-col">
            <div className="overflow-y-auto flex-grow">
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
                                    {root.children.filter(c => 'children' in c).map(child => (
                                         <Folder
                                            key={child.id}
                                            folder={child}
                                            allEquipment={library.equipment}
                                            expandedFolders={expandedFolders}
                                            toggleFolder={toggleFolder}
                                            onDragStart={onDragStart}
                                            onContextMenu={handleContextMenu}
                                        />
                                    ))}
                                    {root.children.filter(c => !('children' in c)).map(e => <DraggableEquipment key={e.id} equipment={e} onDragStart={onDragStart} onContextMenu={handleContextMenu} />)}
                                </ul>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
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
        </div>
    );
};

export default EquipmentLibrarySidebar;