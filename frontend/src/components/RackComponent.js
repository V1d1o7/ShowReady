import React from 'react';
import { Trash2, Settings, Plus, GripHorizontal } from 'lucide-react';

const RackUnit = ({ u, item, onDrop, onDragOver, onDelete, onUpdate, onDragStart, onOpenNotes, onConfigurePanel, interactive, showHeader }) => {
  
  // Native HTML5 Drag & Drop handlers
  const handleDragOver = (e) => {
    e.preventDefault(); // Necessary to allow dropping
    if (onDragOver) {
        // Construct the dragOverData expected by the parent
        // We pass just the RU because RackComponent doesn't know "side" relative to parent logic easily
        // But RackBuilderView expects { ru } so we can trigger it.
        onDragOver({ ru: u }); 
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (onDrop) {
      onDrop(e, u);
    }
  };

  // Determine height styles based on item U height
  // Standard 1U = ~3rem or 48px usually in these UIs
  const heightStyle = {
     height: `${(item ? item.equipment_templates.ru_height : 1) * 3}rem` 
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`
        relative w-full border-b border-gray-700 flex
        ${!item ? 'hover:bg-gray-800/50' : 'bg-[#1a1a1a]'}
        transition-all duration-200 group
      `}
      style={heightStyle}
    >
      {/* Rack Rail Label (Left) */}
      <div className="w-8 flex items-center justify-center border-r border-gray-700 bg-[#2a2a2a] text-gray-500 text-xs font-mono select-none">
        {u}
      </div>

      {/* Content Area */}
      <div className="flex-1 relative flex items-center justify-center">
        {item ? (
          <div 
            className="w-full h-full p-1"
            draggable
            onDragStart={(e) => onDragStart(e, item)}
          >
             <div className="w-full h-full bg-[#252525] rounded border border-gray-600 shadow-sm flex items-center relative overflow-hidden group-hover:border-gray-500">
                
                {/* Drag Handle */}
                <div className="absolute left-2 text-gray-600 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-10">
                   <GripHorizontal size={14} />
                </div>

                {/* Device Content */}
                <div className="flex-1 flex flex-col items-center justify-center px-8">
                   <span className="text-gray-200 font-medium text-sm truncate max-w-full px-2">
                      {item.instance_name || item.model_number || item.equipment_templates?.model_name || "Unknown Device"}
                   </span>
                   
                   {/* RENDER PANEL LAYOUT IF EXISTS */}
                   {item.hasCustomPanel && item.layout && (
                      <div className="flex items-center gap-1 mt-1 px-4 py-1 bg-[#111] rounded-sm border border-gray-800 shadow-inner max-w-full overflow-hidden">
                         {item.layout.map((mod, i) => {
                            if(!mod) return <div key={i} className="w-3 h-3 rounded-full bg-black/50 border border-gray-700" />;
                            let color = 'bg-gray-400';
                            if (mod.type && mod.type.includes('ETHER')) color = 'bg-blue-500';
                            if (mod.type && mod.type.includes('POWER')) color = 'bg-yellow-500';
                            
                            return (
                               <div key={i} className={`w-3 h-3 rounded-full ${color} shadow-sm`} title={mod.label} />
                            );
                         })}
                      </div>
                   )}
                </div>

                {/* Actions (visible on hover) */}
                <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-[#252525] pl-2 z-10">
                    {onConfigurePanel && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onConfigurePanel(item); }}
                          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-600 rounded"
                          title="Configure Panel"
                        >
                          <Settings size={14} />
                        </button>
                    )}
                    {onDelete && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded"
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                    )}
                </div>
             </div>
          </div>
        ) : (
          /* Empty Slot State */
          <div className="w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                {/* Optional: Add button to create panel directly in empty slot if desired */}
                 <span className="text-xs text-gray-600 font-medium select-none">Drop equipment</span>
          </div>
        )}
      </div>

      {/* Rack Rail Label (Right) */}
      <div className="w-8 flex items-center justify-center border-l border-gray-700 bg-[#2a2a2a] text-gray-500 text-xs font-mono select-none">
        {u}
      </div>
    </div>
  );
};

const RackComponent = ({ 
    rack, 
    view, 
    onDrop, 
    onDelete, 
    onUpdate, 
    onDragStart, 
    draggedItem, 
    dragOverData, 
    onDragOverRack, 
    onOpenNotes,
    onConfigurePanel,
    equipmentLibrary,
    showHeader = true 
}) => {
  if (!rack) return null;

  // Generate array of Us (top to bottom)
  const us = Array.from({ length: rack.ru_height }, (_, i) => rack.ru_height - i);

  // Helper to handle drag over for a specific U
  const handleDragOverU = (uInfo) => {
      if (onDragOverRack) {
          onDragOverRack({
              ru: uInfo.ru,
              side: view === 'front' ? 'Front' : 'Rear', // Capitalized to match typical data
              rackId: rack.id
          });
      }
  };

  return (
    <div className="w-full max-w-md bg-[#1a1a1a] border-x-4 border-gray-800 shadow-2xl rounded-sm overflow-hidden flex flex-col">
      {/* Top Cap / Header */}
      {showHeader && (
          <div className="bg-gray-800 text-white text-center py-2 font-bold border-b border-black">
              {view === 'front' ? 'Front View' : 'Rear View'}
          </div>
      )}
      {!showHeader && <div className="h-4 bg-gray-800 border-b border-black w-full" />}
      
      {/* Rack Units */}
      <div className="flex flex-col">
        {us.map((u) => {
            // Check for covering item logic:
            
            // 1. Is there an item STARTING here? (assuming ru_position is bottom)
            // Actually, for visual stacking top-down, we need to know if an item occupies this slot.
            // If item height > 1, it occupies [start, start + height - 1].
            // If we are at 'u', we check if any item has top == u.
            
            const itemStartingHereTop = rack.equipment.find(eq => 
                eq.rack_side.toLowerCase().startsWith(view) &&
                (eq.ru_position + eq.equipment_templates.ru_height - 1) === u
            );
            
            if (itemStartingHereTop) {
                return (
                    <RackUnit
                        key={u}
                        u={u} 
                        item={itemStartingHereTop}
                        onDrop={onDrop}
                        onDragOver={handleDragOverU}
                        onDelete={onDelete}
                        onUpdate={onUpdate}
                        onDragStart={onDragStart}
                        onOpenNotes={onOpenNotes}
                        onConfigurePanel={onConfigurePanel}
                        interactive={true}
                    />
                );
            }
            
            // 2. Is this slot covered by an item starting below?
            const coveredByAbove = rack.equipment.find(eq => 
                eq.rack_side.toLowerCase().startsWith(view) &&
                (eq.ru_position + eq.equipment_templates.ru_height - 1) > u && 
                eq.ru_position <= u 
            );
            
            if (coveredByAbove) {
                return null; // Skip rendering this slot
            }

            // 3. Empty Slot
            return (
                <RackUnit
                    key={u}
                    u={u}
                    item={null}
                    onDrop={onDrop}
                    onDragOver={handleDragOverU}
                    onDelete={onDelete}
                    onUpdate={onUpdate}
                    onDragStart={onDragStart}
                    onOpenNotes={onOpenNotes}
                    onConfigurePanel={onConfigurePanel}
                    interactive={true}
                />
            );
        })}
      </div>

      {/* Bottom Cap */}
      <div className="h-4 bg-gray-800 border-t border-black w-full" />
    </div>
  );
};

export default RackComponent;