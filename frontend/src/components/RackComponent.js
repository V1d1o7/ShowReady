import React, { useState, useMemo } from 'react';
import PlacedEquipmentItem from './PlacedEquipmentItem';

const RackComponent = ({ rack, onDrop, onDelete, onDragStart, draggedItem }) => {
    const [dragOverInfo, setDragOverInfo] = useState(null); // { ru, side }

    // Create a map of occupied slots for quick lookup: "RU-SIDE" -> true
    const occupiedSlots = useMemo(() => {
        const slots = new Map();
        (rack.equipment || []).forEach(item => {
            const template = item.equipment_templates || {};
            const height = template.ru_height || 1;
            for (let i = 0; i < height; i++) {
                const currentRu = item.ru_position + i;
                if (template.width === 'full') {
                    slots.set(`${currentRu}-left`, item.id);
                    slots.set(`${currentRu}-right`, item.id);
                } else if (item.rack_side) {
                    slots.set(`${currentRu}-${item.rack_side}`, item.id);
                }
            }
        });
        return slots;
    }, [rack.equipment]);

    const isOccupied = (startRu, endRu, side, excludeId) => {
        for (let ru = startRu; ru <= endRu; ru++) {
            const occupantId = occupiedSlots.get(`${ru}-${side}`);
            if (occupantId && occupantId !== excludeId) {
                return true;
            }
        }
        return false;
    };

    const handleDragOver = (e, ru, side) => {
        e.preventDefault();
        if (draggedItem) {
            setDragOverInfo({ ru, side });
        }
    };

    const handleDrop = (e, ru, side) => {
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        const item = data.item;
        const template = item.equipment_templates || item;
        const itemHeight = template.ru_height || 1;
        const dropPosition = ru - itemHeight + 1;
        
        if (dropPosition < 1) {
             console.error("Drop failed: Item too tall for this position.");
        } else {
            onDrop(data, dropPosition, side);
        }
        
        setDragOverInfo(null);
    };

    const getHighlightStyle = () => {
        if (!dragOverInfo || !draggedItem) return { display: 'none' };

        const { ru, side } = dragOverInfo;
        const item = draggedItem.item;
        const template = item.equipment_templates || item;

        const itemHeight = template.ru_height || 1;
        const isHalf = template.width === 'half';
        const dropPosition = ru - itemHeight + 1;

        if (dropPosition < 1) return { display: 'none' };

        let isInvalid = false;
        if (isHalf) {
            if (isOccupied(dropPosition, ru, side, draggedItem.isNew ? null : item.id)) {
                isInvalid = true;
            }
        } else { // Full width item
            if (isOccupied(dropPosition, ru, 'left', draggedItem.isNew ? null : item.id) || 
                isOccupied(dropPosition, ru, 'right', draggedItem.isNew ? null : item.id)) {
                isInvalid = true;
            }
        }

        return {
            display: 'block',
            position: 'absolute',
            left: isHalf && side === 'right' ? '50%' : '0',
            width: isHalf ? '50%' : '100%',
            bottom: `${(dropPosition - 1) * 1.5}rem`,
            height: `${itemHeight * 1.5}rem`,
            backgroundColor: isInvalid ? 'rgba(239, 68, 68, 0.8)' : 'rgba(59, 130, 246, 0.8)',
            border: `1px dashed ${isInvalid ? '#EF4444' : '#3B82F6'}`,
            zIndex: 10,
        };
    };

    return (
        <div className="w-full bg-gray-900/50 p-4 rounded-lg flex gap-4">
            {/* RU Labels */}
            <div className="flex flex-col-reverse justify-end">
                {Array.from({ length: rack.ru_height }, (_, i) => <div key={i} className="h-6 text-xs text-gray-500 text-right pr-2 select-none">{i + 1}</div>)}
            </div>

            <div className="flex-grow border-2 border-gray-600 rounded-md relative" onDragLeave={() => setDragOverInfo(null)}>
                {/* Drop Zones */}
                {Array.from({ length: rack.ru_height }, (_, i) => {
                    const ru = rack.ru_height - i;
                    return (
                        <div key={ru} className="h-6 border-b border-gray-700/50 flex">
                            <div className="w-1/2 h-full" onDragOver={(e) => handleDragOver(e, ru, 'left')} onDrop={(e) => handleDrop(e, ru, 'left')} />
                            <div className="w-1/2 h-full border-l border-dashed border-gray-800" onDragOver={(e) => handleDragOver(e, ru, 'right')} onDrop={(e) => handleDrop(e, ru, 'right')} />
                        </div>
                    );
                })}

                {/* Placed Equipment */}
                <div className="absolute inset-0 pointer-events-none">
                    {(rack.equipment || []).map(item => (
                        <div key={item.id} className="pointer-events-auto">
                            <PlacedEquipmentItem item={item} onDragStart={onDragStart} onDelete={onDelete} />
                        </div>
                    ))}
                    <div style={getHighlightStyle()} />
                </div>
            </div>
            
            {/* RU Labels */}
            <div className="flex flex-col-reverse justify-end">
                {Array.from({ length: rack.ru_height }, (_, i) => <div key={i} className="h-6 text-xs text-gray-500 text-left pl-2 select-none">{i + 1}</div>)}
            </div>
        </div>
    );
};

export default RackComponent;