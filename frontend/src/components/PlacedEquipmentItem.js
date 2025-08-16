import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Trash2 } from 'lucide-react';

const PlacedEquipmentItem = ({ item, isOverlay = false, onDelete }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `placed-item-${item.id}`,
        data: { type: 'placed-item', item }
    });

    const template = item.equipment_templates || {};
    const isHalfWidth = template.width === 'half';

    // When rendering as an overlay, we don't have the context of the rack,
    // so we use a simpler style.
    if (isOverlay) {
        return (
            <div className="p-2 bg-gray-900 border border-amber-500 rounded-md shadow-lg">
                <p className="font-bold text-sm text-white">{item.instance_name}</p>
                <p className="text-xs text-gray-400">{template.ru_height}RU</p>
            </div>
        );
    }

    const bottomPosition = (item.ru_position - 1) * 1.5;
    const itemHeight = (template.ru_height || 1) * 1.5;

    const widthClass = isHalfWidth ? 'w-1/2' : 'w-full';
    const positionClass = item.rack_side === 'right' ? 'left-1/2' : 'left-0';

    const style = {
        height: `${itemHeight}rem`,
        bottom: `${bottomPosition}rem`,
        zIndex: 20,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            style={style}
            className={`absolute ${widthClass} ${positionClass} bg-blue-500/30 border border-blue-400 rounded-sm text-white text-xs flex items-center justify-center p-1 cursor-grab group`}
        >
            <span className="truncate px-2 pointer-events-none">{item.instance_name}</span>
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                }} 
                className="absolute right-0 pr-2 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
};

export default PlacedEquipmentItem;