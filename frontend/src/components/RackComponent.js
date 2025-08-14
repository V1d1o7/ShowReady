import React, { useState, useMemo } from 'react';
import PlacedEquipmentItem from './PlacedEquipmentItem';

const RackComponent = ({ rack, onDrop, onDelete, draggedItem, setDraggedItem }) => {
    const [dragOverRU, setDragOverRU] = useState(null);

    const filledRUs = useMemo(() => {
        const map = new Map();
        (rack.equipment || []).forEach(item => {
            const height = (item.equipment_templates?.ru_height) || 1;
            for (let i = 0; i < height; i++) {
                map.set(item.ru_position + i, item.id);
            }
        });
        return map;
    }, [rack.equipment]);

    const isOccupied = (start, end, excludeId) => {
        for (let i = start; i <= end; i++) {
            const occupiedBy = filledRUs.get(i);
            if (occupiedBy && occupiedBy !== excludeId) {
                return true;
            }
        }
        return false;
    };

    const handleDragStart = (e, item, isNew) => {
        const data = { isNew, item };
        e.dataTransfer.setData('application/json', JSON.stringify(data));
        setDraggedItem(data);
    };

    const handleDragOver = (e, ru) => {
        e.preventDefault();
        if (draggedItem) {
            setDragOverRU(ru);
        }
    };

    const handleDrop = (e, ru) => {
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        const item = data.item;
        const itemHeight = item.ru_height || (item.equipment_templates?.ru_height) || 1;
        const dropPosition = ru - itemHeight + 1;

        if (dropPosition < 1 || isOccupied(dropPosition, ru, data.isNew ? null : item.id)) {
            console.error("Drop failed: Invalid position or slot is occupied.");
        } else {
            onDrop(data, dropPosition);
        }
        setDragOverRU(null);
        setDraggedItem(null);
    };

    const getHighlightStyle = () => {
        if (!dragOverRU || !draggedItem) return { display: 'none' };

        const item = draggedItem.item;
        const itemHeight = item.ru_height || (item.equipment_templates?.ru_height) || 1;
        const dropPosition = dragOverRU - itemHeight + 1;

        if (dropPosition < 1) return { display: 'none' };

        const isInvalid = isOccupied(dropPosition, dragOverRU, draggedItem.isNew ? null : item.id);

        return {
            display: 'block',
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: `${(dropPosition - 1) * 1.5}rem`,
            height: `${itemHeight * 1.5}rem`,
            backgroundColor: isInvalid ? 'rgba(239, 68, 68, 0.8)' : 'rgba(59, 130, 246, 0.8)',
            border: `1px dashed ${isInvalid ? '#EF4444' : '#3B82F6'}`,
            zIndex: 10,
        };
    };

    return (
        <div className="w-full bg-gray-900/50 p-4 rounded-lg flex gap-4">
            <div className="flex flex-col-reverse justify-end">
                {Array.from({ length: rack.ru_height }, (_, i) => <div key={i} className="h-6 text-xs text-gray-500 text-right pr-2 select-none">{i + 1}</div>)}
            </div>

            <div
                className="flex-grow border-2 border-gray-600 rounded-md relative"
                onDragLeave={() => { setDragOverRU(null); }}
            >
                {Array.from({ length: rack.ru_height }, (_, i) => {
                    const ru = rack.ru_height - i;
                    return (
                        <div
                            key={i}
                            className="h-6 border-b border-gray-700/50"
                            onDragOver={(e) => handleDragOver(e, ru)}
                            onDrop={(e) => handleDrop(e, ru)}
                        />
                    );
                })}

                <div className="absolute inset-0 pointer-events-none">
                    {(rack.equipment || []).map(item => (
                        <div key={item.id} className="pointer-events-auto">
                            <PlacedEquipmentItem item={item} onDragStart={(e) => handleDragStart(e, item, false)} onDelete={() => onDelete(item.id)} />
                        </div>
                    ))}
                    <div style={getHighlightStyle()} />
                </div>
            </div>

            <div className="flex flex-col-reverse justify-end">
                {Array.from({ length: rack.ru_height }, (_, i) => <div key={i} className="h-6 text-xs text-gray-500 text-left pl-2 select-none">{i + 1}</div>)}
            </div>
        </div>
    );
};

export default RackComponent;