import React, { useState, useEffect } from 'react';
import Modal from './Modal.js';
import { 
  X, 
  Save, 
  Trash2, 
  Grid3X3, 
  Circle, 
  Square, 
  Type, 
  Zap,
  Network,
  Disc,
  Mic,
  Maximize
} from 'lucide-react';

// --- Constants & Types ---
const MODULE_TYPES = [
  { type: 'XLR_M', label: 'XLR Male', icon: Mic, color: 'bg-slate-300' },
  { type: 'XLR_F', label: 'XLR Female', icon: Mic, color: 'bg-slate-400' },
  { type: 'ETHERCON', label: 'EtherCON', icon: Network, color: 'bg-blue-200' },
  { type: 'SPEAKON', label: 'Speakon', icon: Disc, color: 'bg-green-200' },
  { type: 'POWERCON_BLUE', label: 'Power In (Blue)', icon: Zap, color: 'bg-blue-400' },
  { type: 'POWERCON_WHITE', label: 'Power Out (White)', icon: Zap, color: 'bg-gray-300' },
  { type: 'TRUE1', label: 'True1', icon: Zap, color: 'bg-yellow-400' },
  { type: 'BNC', label: 'BNC', icon: Circle, color: 'bg-gray-400' },
  { type: 'USB', label: 'USB', icon: Square, color: 'bg-white border' },
  { type: 'CUSTOM', label: 'Custom/Label', icon: Type, color: 'bg-yellow-100' },
  { type: 'BLANK', label: 'Blank Plate', icon: Maximize, color: 'bg-black text-white' },
];

// --- Sub-Components ---

// 1. Sidebar Item (Draggable Source)
const SidebarItem = ({ module, onDragStart }) => {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, { type: 'NEW_MODULE', ...module })}
      className="flex items-center gap-2 p-3 rounded-lg border cursor-grab hover:bg-gray-50 transition-colors bg-white border-gray-200 hover:shadow-sm"
    >
      <div className={`p-1.5 rounded ${module.color} flex-shrink-0`}>
        {React.createElement(module.icon, { size: 16 })}
      </div>
      <span className="text-sm font-medium text-gray-700">{module.label}</span>
    </div>
  );
};

// 2. Module Instance (Draggable Item inside Grid)
const ModuleInstance = ({ module, index, onRemove, onDragStart }) => {
  const def = MODULE_TYPES.find(m => m.type === module.type) || MODULE_TYPES[0];
  const Icon = def.icon;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, { type: 'EXISTING_MODULE', index, ...module })}
      className={`
        relative w-full h-full flex flex-col items-center justify-center rounded 
        cursor-grab group transition-all
        ${def.color} 
      `}
    >
      <Icon size={14} className="opacity-70" />
      <span className="text-[9px] font-bold mt-0.5 truncate max-w-full px-0.5">
        {module.customLabel || def.label.split(' ')[0]}
      </span>
      
      {/* Remove Button (visible on hover) */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(index); }}
        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
      >
        <X size={10} />
      </button>
    </div>
  );
};

// 3. Grid Slot (Droppable Target)
const GridSlot = ({ index, module, onDrop, onDragOver, onDragStart, onRemove }) => {
  return (
    <div
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      className={`
        relative aspect-square rounded border-2 border-dashed flex items-center justify-center
        transition-colors duration-200
        border-gray-300 bg-gray-50/50 hover:border-blue-400 hover:bg-blue-50/30
      `}
    >
      {module ? (
        <ModuleInstance module={module} index={index} onRemove={onRemove} onDragStart={onDragStart} />
      ) : (
        <div className="w-2 h-2 rounded-full bg-gray-200 pointer-events-none" />
      )}
    </div>
  );
};

// --- Main Component ---
const PanelBuilderModal = ({ isOpen, onClose, rackItem, onUpdate }) => {
  const [layout, setLayout] = useState([]);
  const [portCount, setPortCount] = useState(12); // Default 12 ports
  const [panelName, setPanelName] = useState("New Panel");

  // Initialize from props (rackItem)
  useEffect(() => {
    if (rackItem) {
      if (rackItem.layout) setLayout(rackItem.layout);
      // We might need to guess port count if not saved
      if (rackItem.portCount) setPortCount(rackItem.portCount);
      if (rackItem.name || rackItem.instance_name) setPanelName(rackItem.name || rackItem.instance_name);
    } else {
      // Reset defaults if new
      setLayout(new Array(12).fill(null));
      setPortCount(12);
      setPanelName("Custom Panel");
    }
  }, [rackItem, isOpen]);

  // Adjust layout array size when port count changes
  useEffect(() => {
    setLayout(prev => {
      const newLayout = [...prev];
      if (newLayout.length < portCount) {
        // Grow: Add nulls
        return [...newLayout, ...new Array(portCount - newLayout.length).fill(null)];
      } else if (newLayout.length > portCount) {
        // Shrink: Slice
        return newLayout.slice(0, portCount);
      }
      return newLayout;
    });
  }, [portCount]);

  // Handlers
  const handleDragStart = (e, item) => {
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        
        setLayout(prev => {
            const next = [...prev];

            if (data.type === 'NEW_MODULE') {
                // Add new module to empty slot or overwrite
                next[targetIndex] = { ...data, id: Date.now() };
            } else if (data.type === 'EXISTING_MODULE') {
                // Move existing module
                const sourceIndex = data.index;
                if (sourceIndex === targetIndex) return prev;

                const itemToMove = next[sourceIndex];
                const targetItem = next[targetIndex];

                // Swap
                next[targetIndex] = itemToMove;
                next[sourceIndex] = targetItem;
            }
            return next;
        });

    } catch (err) {
        console.error("Drop failed", err);
    }
  };

  const handleRemove = (index) => {
    setLayout(prev => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  const handleClear = () => {
    if (window.confirm("Are you sure you want to clear the entire panel?")) {
      setLayout(new Array(portCount).fill(null));
    }
  };

  const handleSaveWrapper = () => {
    // Construct the panel data object
    // Assuming onUpdate expects the modified rackItem data
    const updatedData = {
      ...rackItem,
      name: panelName,
      portCount,
      layout,
      // Ensure we mark it as having a custom panel layout
      hasCustomPanel: true
    };
    onUpdate(rackItem.id, updatedData); // Updated to pass ID and data separately if typical update pattern
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Panel Builder" size="5xl">
      <div className="flex h-[700px] gap-6">
        
        {/* Left: Component Sidebar */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-4 border-r pr-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Settings</h3>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Panel Name</label>
              <input
                type="text"
                value={panelName}
                onChange={(e) => setPanelName(e.target.value)}
                className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Port Count</label>
              <select
                value={portCount}
                onChange={(e) => setPortCount(parseInt(e.target.value))}
                className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={8}>8 Ports</option>
                <option value={12}>12 Ports</option>
                <option value={16}>16 Ports</option>
                <option value={24}>24 Ports (High Density)</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Modules</h3>
            <div className="space-y-2">
              {MODULE_TYPES.map(m => (
                <SidebarItem key={m.type} module={m} onDragStart={handleDragStart} />
              ))}
            </div>
          </div>
        </div>

        {/* Right: Canvas & Preview */}
        <div className="flex-1 flex flex-col gap-6">
          
          {/* Visual Preview (The Rack Representation) */}
          <div className="bg-gray-800 rounded-lg p-6 shadow-inner relative overflow-hidden">
            <div className="absolute top-2 left-2 text-xs text-gray-500 font-mono">FRONT VIEW PREVIEW</div>
            
            {/* The Panel Itself */}
            <div className="bg-gray-900 border border-gray-700 h-16 rounded shadow-lg mt-4 flex items-center justify-between px-8 relative">
               {/* Rack Ears */}
               <div className="absolute left-0 top-0 bottom-0 w-4 bg-gray-800 border-r border-gray-700 flex flex-col justify-center gap-8 items-center">
                  <div className="w-1.5 h-2 rounded-full bg-gray-900"></div>
                  <div className="w-1.5 h-2 rounded-full bg-gray-900"></div>
               </div>
               <div className="absolute right-0 top-0 bottom-0 w-4 bg-gray-800 border-l border-gray-700 flex flex-col justify-center gap-8 items-center">
                  <div className="w-1.5 h-2 rounded-full bg-gray-900"></div>
                  <div className="w-1.5 h-2 rounded-full bg-gray-900"></div>
               </div>

               {/* Ports */}
               <div className="flex-1 flex justify-evenly items-center px-4">
                  {layout.map((module, i) => {
                     // Render a mini preview of the module
                     if (!module) return <div key={i} className="w-8 h-8 rounded-full border border-gray-700 bg-gray-800 opacity-50"></div>;
                     
                     const def = MODULE_TYPES.find(m => m.type === module.type);
                     const Icon = def?.icon || Circle;
                     
                     return (
                        <div key={i} className={`w-8 h-8 rounded flex items-center justify-center text-xs ${def?.color || 'bg-gray-600'}`}>
                           <Icon size={14} />
                        </div>
                     );
                  })}
               </div>
            </div>
          </div>

          {/* Drag & Drop Grid Editor */}
          <div className="flex-1 bg-white border rounded-lg flex flex-col">
            <div className="p-4 border-b flex items-center justify-between bg-gray-50 rounded-t-lg">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Grid3X3 size={18} />
                Editor Grid
              </h3>
              <button 
                onClick={handleClear}
                className="text-xs text-red-600 hover:text-red-700 hover:underline flex items-center gap-1"
              >
                <Trash2 size={12} /> Clear Layout
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
               <div 
                  className="grid gap-4"
                  style={{ 
                    gridTemplateColumns: `repeat(${portCount > 12 ? 8 : 4}, minmax(0, 1fr))` 
                  }}
               >
                  {layout.map((module, index) => (
                    <div key={index} className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase text-gray-400 font-mono text-center">Port {index + 1}</span>
                      <GridSlot 
                        index={index} 
                        module={module} 
                        onDrop={handleDrop} 
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onRemove={handleRemove}
                      />
                    </div>
                  ))}
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveWrapper}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Save size={16} />
          Save Panel Configuration
        </button>
      </div>
    </Modal>
  );
};

export default PanelBuilderModal;