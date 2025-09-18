import React, { useState } from 'react';
import { Trash2, Edit } from 'lucide-react';
import EditInstanceModal from './EditInstanceModal';

const PlacedEquipmentItem = ({ item, onDelete, onDragStart, onUpdate }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const template = item.equipment_templates || {};
    const isHalfWidth = template.width === 'half' || (item.rack_side && (item.rack_side.includes('-left') || item.rack_side.includes('-right')));

    const handleDragStart = (e) => {
        setIsDragging(true);
        onDragStart(e, item, false); // isNew = false
    };

    const handleDragEnd = () => setIsDragging(false);

    const bottomPosition = (item.ru_position - 1) * 25;
    const itemHeight = (template.ru_height || 1) * 25;

    const widthClass = isHalfWidth ? 'w-1/2' : 'w-full';
    const positionClass = item.rack_side && item.rack_side.endsWith('-right') ? 'left-1/2' : 'left-0';

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
                    rounded-sm text-white text-xs flex items-center justify-between
                    p-1 cursor-grab group transition-opacity
                    ${isDragging ? 'opacity-0' : 'opacity-100'}
                `}
                style={{
                    height: `${itemHeight}px`,
                    bottom: `${bottomPosition}px`,
                    zIndex: 20,
                }}
            >
                <span className="truncate px-2">{item.instance_name}</span>
                <div className="flex items-center">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsEditModalOpen(true);
                        }}
                        className="pr-1 text-gray-400 hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <Edit size={14} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(item.id);
                        }}
                        className="pr-2 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
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