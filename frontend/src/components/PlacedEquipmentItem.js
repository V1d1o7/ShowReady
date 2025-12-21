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
        onDragStart(e, item, false); // isNew = false
    };

    const handleDragEnd = () => setIsDragging(false);

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedItemData = e.dataTransfer.getData('application/json');
        
        if (!draggedItemData) {
            toast.error("Failed to get drag data.");
            return;
        }

        try {
            const draggedItem = JSON.parse(draggedItemData);
            
            if (draggedItem.isNew && draggedItem.item.is_module) {
                if (hasSlots) {
                    setDroppedModule(draggedItem.item);
                    setIsConfigureModalOpen(true);
                } else {
                    toast.error(`"${template.model_number}" does not accept modules.`);
                }
            }
        } catch (error) {
            console.error("Failed to parse dragged item data:", error);
            toast.error("An error occurred during drop.");
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

    const handleUpdate = (updatedData) => {
        onUpdate(item.id, updatedData);
        setIsEditModalOpen(false);
    };

    const hasSlots = template.slots && template.slots.length > 0;

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
                <span className="font-bold text-center truncate px-2">{item.instance_name}</span>
                
                {hasSlots && (
                    <div className="text-center text-[10px] w-full px-1 mt-1">
                        {template.slots.map(slot => {
                            const installedModuleId = item.module_assignments?.[slot.id];
                            const module = installedModuleId ? equipmentLibrary.find(e => e.id === installedModuleId) : null;
                            return (
                                <div key={slot.id} className="bg-black/20 rounded-sm p-0.5 my-0.5 truncate">
                                    <span className="font-bold">{slot.name}:</span> {module ? module.model_number : '[Empty]'}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="flex items-center absolute right-1 top-1/2 -translate-y-1/2">
                    {onOpenNotes && (
                        <div className="relative">
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenNotes(); }}
                                className="p-1 text-gray-400 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
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
                            className="p-1 text-gray-400 hover:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <Settings size={14} />
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsEditModalOpen(true);
                        }}
                        className="p-1 text-gray-400 hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <Edit size={14} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(item.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
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
