import React, { useState } from 'react';
import { Trash2, Edit, MessageSquare } from 'lucide-react';
import EditInstanceModal from './EditInstanceModal';

const PlacedEquipmentItem = ({ item, onDelete, onDragStart, onUpdate, onOpenNotes }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const template = item.equipment_templates || {};

    const handleDragStart = (e) => {
        setIsDragging(true);
        onDragStart(e, item, false); // isNew = false
    };

    const handleDragEnd = () => setIsDragging(false);

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

    return (
        <>
            <div
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                className={`
                    absolute ${widthClass} ${positionClass} bg-blue-500/30 border border-blue-400
                    rounded-sm text-white text-xs flex items-center
                    p-1 cursor-grab group transition-opacity
                    ${isDragging ? 'opacity-0' : 'opacity-100'}
                `}
                style={{
                    height: `${itemHeight}px`,
                    bottom: `${bottomPosition}px`,
                    zIndex: 20,
                }}
            >
                <span className="flex-grow text-center truncate px-2">{item.instance_name}</span>
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
        </>
    );
};

export default PlacedEquipmentItem;