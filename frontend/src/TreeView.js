import React, { useState } from 'react';
import { Folder as FolderIcon, ChevronRight, ChevronDown, Server } from 'lucide-react';

const TreeView = ({ folders, equipment, onSelectEquipment, onDragStart }) => {
  const [expandedFolders, setExpandedFolders] = useState({});

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const renderTree = (parentId = null, isRoot = true) => {
    const currentFolders = folders.filter(f => isRoot ? f.parent_id === null : f.parent_id === parentId);
    const currentEquipment = equipment.filter(e => e.folder_id === parentId);

    return (
      <ul className={isRoot ? '' : 'pl-4'}>
        {currentFolders.map(folder => (
          <li key={folder.id}>
            <div
              className="flex items-center cursor-pointer p-1 rounded-md hover:bg-gray-700"
              onClick={() => toggleFolder(folder.id)}
            >
              {expandedFolders[folder.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <FolderIcon size={16} className="mx-2 flex-shrink-0" />
              <span className="truncate">{folder.name}</span>
            </div>
            {expandedFolders[folder.id] && renderTree(folder.id, false)}
          </li>
        ))}
        {currentEquipment.map(item => (
           <div 
                key={item.id}
                draggable 
                onDragStart={(e) => onDragStart(e, item)}
                className="p-2 mb-2 bg-gray-700 rounded-md cursor-grab active:cursor-grabbing"
            >
                <p className="font-bold text-sm truncate">{item.model_number}</p>
                <p className="text-xs text-gray-400">{item.manufacturer} - {item.ru_height}RU</p>
            </div>
        ))}
      </ul>
    );
  };

  const showReadyLibrary = folders.filter(f => f.is_default);
  const userLibrary = folders.filter(f => !f.is_default);
  const showReadyEquipment = equipment.filter(e => e.is_default && !e.folder_id);
  const userEquipment = equipment.filter(e => !e.user_id && !e.folder_id);

  return (
    <div>
        <h3 className="text-md font-bold text-gray-400 uppercase tracking-wider mb-2">ShowReady Library</h3>
        {renderTree(null, true, showReadyLibrary, showReadyEquipment)}

        <h3 className="text-md font-bold text-gray-400 uppercase tracking-wider mt-4 mb-2">User Library</h3>
        {renderTree(null, true, userLibrary, userEquipment)}
    </div>
  )
};

export default TreeView;