import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';

const PlacedEquipmentItem = ({ item, onDragStart, onDelete }) => {
    const [isDragging, setIsDragging] = useState(false);
    const template = item.equipment_templates || {};
    const isHalfWidth = template.width === 'half';

    const handleDragStart = (e) => {
        setIsDragging(true);
        onDragStart(e, { ...item, isHalf: isHalfWidth });
    };

    const handleDragEnd = () => setIsDragging(false);

    const bottomPosition = (item.ru_position - 1) * 1.5;
    const itemHeight = (template.ru_height || 1) * 1.5;

    // Determine width and horizontal position
    const widthClass = isHalfWidth ? 'w-1/2' : 'w-full';
    const positionClass = item.rack_side === 'right' ? 'left-1/2' : 'left-0';

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className={`absolute ${widthClass} ${positionClass} bg-blue-500/30 border border-blue-400 rounded-sm text-white text-xs flex items-center justify-center p-1 cursor-move group ${isDragging ? 'opacity-80' : ''}`}
            style={{ height: `${itemHeight}rem`, bottom: `${bottomPosition}rem`, zIndex: 20 }}
        >
            <span className="truncate px-2">{item.instance_name}</span>
            <button onClick={() => onDelete(item.id)} className="absolute right-0 pr-2 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 size={14} />
            </button>
        </div>
    );
};

export default PlacedEquipmentItem;