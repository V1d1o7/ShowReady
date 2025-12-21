import React, { useState } from 'react';
import { Trash2, Edit, MessageSquare, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import EditInstanceModal from './EditInstanceModal';
import ConfigureModulesModal from './ConfigureModulesModal';

const PlacedEquipmentItem = ({ item, onDelete, onDragStart, onUpdate, onOpenNotes, equipmentLibrary }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isConfigureModalOpen, setIsConfigureModalOpen] = useState(false);
    const [droppedModule, setDroppedModule] = useState(null);
    const template = item.equipment_templates || {};

    const handleDragStart = (e) => {
        setIsDragging(true);
        onDragStart(e, item, false); 
    };

    const handleDragEnd = () => setIsDragging(false);
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };

    const handleUpdate = (updatedData) => {
        onUpdate(item.id, updatedData);
        setIsEditModalOpen(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedItemData = e.dataTransfer.getData('application/json');
        
        if (!draggedItemData) return;

        try {
            const draggedItem = JSON.parse(draggedItemData);
            
            if (draggedItem.isNew && draggedItem.item.is_module) {
                const slots = template.slots || [];
                const currentAssignments = item.module_assignments || {};

                if (slots.length === 0) {
                    toast.error(`"${template.model_number}" does not accept modules.`);
                    return;
                }

                const targetSlotIndex = slots.findIndex((slot, index) => {
                    const slotId = slot.id || index.toString();
                    const isOccupied = currentAssignments[slotId];
                    const isCompatible = !slot.accepted_module_type || slot.accepted_module_type === draggedItem.item.module_type;
                    return !isOccupied && isCompatible;
                });

                if (targetSlotIndex !== -1) {
                    const targetSlot = slots[targetSlotIndex];
                    const slotId = targetSlot.id || targetSlotIndex.toString();
                    
                    const newAssignments = {
                        ...currentAssignments,
                        [slotId]: draggedItem.item.id
                    };
                    
                    handleUpdate({ module_assignments: newAssignments });
                    toast.success(`Installed ${draggedItem.item.model_number}`);
                } else {
                    toast.error(`No compatible, empty slots available.`);
                }
            }
        } catch (error) {
            console.error("Failed to parse dragged item data:", error);
        }
    };

    const bottomPosition = (item.ru_position - 1) * 25;
    const itemHeight = (template.ru_height || 1) * 25;

    const widthClass = (() => {
        if (template.width === 'half') return 'w-1/2';
        if (template.width === 'third') return 'w-1/3';
        return 'w-full';
    })();

    const positionClass = (() => {
        if (!item.rack_side) return 'left-0';
        if (item.rack_side.endsWith('-right')) {
            return template.width === 'third' ? 'left-2/3' : 'left-1/2';
        }
        if (item.rack_side.endsWith('-middle')) {
            return 'left-1/3';
        }
        return 'left-0';
    })();

    const hasSlots = template.slots && template.slots.length > 0;
    const assignments = item.module_assignments || {};
    const filledSlotCount = Object.values(assignments).filter(Boolean).length;

    return (
        <>
            <div
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`
                    absolute ${widthClass} ${positionClass} bg-blue-500/30 border border-blue-400
                    rounded-sm text-white text-xs flex flex-col items-center justify-center
                    p-1 cursor-grab group transition-opacity
                    ${isDragging ? 'opacity-0' : 'opacity-100'}
                `}
                style={{
                    height: `${itemHeight}px`,
                    bottom: `${bottomPosition}px`,
                    zIndex: 20,
                }}
            >
                {/* TOOLTIP: Restored background so it is readable, as this was not the box you hated */}
                {hasSlots && filledSlotCount > 0 && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 bg-gray-900 border border-gray-600 rounded shadow-xl p-2 hidden group-hover:block z-50 pointer-events-none">
                        <div className="text-[10px] text-gray-400 mb-1 border-b border-gray-700 pb-1 font-bold">Installed Modules</div>
                        {template.slots.map((slot, index) => {
                            const slotId = slot.id || index.toString();
                            const modId = assignments[slotId];
                            const module = modId ? equipmentLibrary.find(e => e.id == modId) : null;
                            if (!module) return null;
                            return (
                                <div key={slotId} className="flex justify-between text-[10px] text-white">
                                    <span>{slot.name || `Slot ${index+1}`}:</span>
                                    <span className="text-amber-400">{module.model_number}</span>
                                </div>
                            )
                        })}
                    </div>
                )}

                <span className="font-bold text-center truncate px-2 pointer-events-none">{item.instance_name}</span>
                
                {/* ACTION BAR: Background Removed (Transparent) */}
                <div className="flex items-center absolute right-1 top-1/2 -translate-y-1/2 bg-transparent rounded px-1 z-30">
                    {onOpenNotes && (
                        <div className="relative">
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenNotes(); }}
                                className="p-1 text-gray-300 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <MessageSquare size={14} />
                            </button>
                            {item.has_notes && (
                                <div className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></div>
                            )}
                        </div>
                    )}
                    
                    {hasSlots && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsConfigureModalOpen(true);
                            }}
                            className={`
                                p-1 transition-opacity opacity-0 group-hover:opacity-100 relative
                                ${filledSlotCount > 0 ? 'text-green-400' : 'text-gray-300 hover:text-green-400'}
                            `}
                            title="Configure Modules"
                        >
                            <Settings size={14} />
                            {filledSlotCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-green-500 text-black text-[9px] font-bold h-3.5 w-3.5 flex items-center justify-center rounded-full shadow-sm">
                                    {filledSlotCount}
                                </span>
                            )}
                        </button>
                    )}

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsEditModalOpen(true);
                        }}
                        className="p-1 text-gray-300 hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <Edit size={14} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(item.id);
                        }}
                        className="p-1 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
            
            <EditInstanceModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                onSubmit={handleUpdate}
                item={item}
            />
            {hasSlots && (
                <ConfigureModulesModal
                    isOpen={isConfigureModalOpen}
                    onClose={() => {setIsConfigureModalOpen(false); setDroppedModule(null);}}
                    chassisInstance={item}
                    equipmentLibrary={equipmentLibrary}
                    onSave={onUpdate}
                    droppedModule={droppedModule}
                />
            )}
        </>
    );
};

export default PlacedEquipmentItem;