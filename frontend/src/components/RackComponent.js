import React, { useState, useMemo } from 'react';
import PlacedEquipmentItem from './PlacedEquipmentItem';
import { HardDrive } from 'lucide-react';

const RackComponent = ({ rack, view, onDrop, onDelete, onDragStart, draggedItem }) => {
    const [dragOverInfo, setDragOverInfo] = useState(null);

    const occupiedSlots = useMemo(() => {
        const slots = new Map();
        (rack.equipment || []).forEach(item => {
            const template = item.equipment_templates || {};
            const height = template.ru_height || 1;
            for (let i = 0; i < height; i++) {
                const currentRu = item.ru_position + i;
                if (template.width === 'full') {
                    const baseSide = item.rack_side ? item.rack_side.split('-')[0] : view;
                    slots.set(`${currentRu}-${baseSide}-left`, item.id);
                    slots.set(`${currentRu}-${baseSide}-right`, item.id);
                } else if (item.rack_side) {
                    slots.set(`${currentRu}-${item.rack_side}`, item.id);
                }
            }
        });
        return slots;
    }, [rack.equipment, view]);

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
        // This is the crucial fix. Always prevent default to signal a valid drop target.
        e.preventDefault();
        // The visual feedback is handled by the state update below.
        if (draggedItem) {
            setDragOverInfo({ ru, side });
        }
    };

    const handleDrop = (e, ru, side) => {
        e.preventDefault();
        try {
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
        } catch (error) {
            console.error("Error processing drop data:", error);
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
        const excludeId = draggedItem.isNew ? null : item.id;

        if (isHalf) {
            if (isOccupied(dropPosition, ru, side, excludeId)) {
                isInvalid = true;
            }
        } else {
            if (isOccupied(dropPosition, ru, `${view}-left`, excludeId) ||
                isOccupied(dropPosition, ru, `${view}-right`, excludeId)) {
                isInvalid = true;
            }
        }

        return {
            display: 'block',
            position: 'absolute',
            left: isHalf && side.endsWith('-right') ? '50%' : '0',
            width: isHalf ? '50%' : '100%',
            bottom: `${(dropPosition - 1) * 1.5}rem`,
            height: `${itemHeight * 1.5}rem`,
            backgroundColor: isInvalid ? 'rgba(239, 68, 68, 0.5)' : 'rgba(59, 130, 246, 0.5)',
            border: `2px dashed ${isInvalid ? '#EF4444' : '#3B82F6'}`,
            zIndex: 10,
            pointerEvents: 'none',
        };
    };

    const renderRUs = (currentView) => {
        return Array.from({ length: rack.ru_height }, (_, i) => {
            const ru = rack.ru_height - i;
            return (
                <div key={`${currentView}-${ru}`} className="h-6 border-b border-gray-700/50 flex">
                    <div className="w-1/2 h-full" onDragOver={(e) => handleDragOver(e, ru, `${currentView}-left`)} onDrop={(e) => handleDrop(e, ru, `${currentView}-left`)} />
                    <div className="w-1/2 h-full border-l border-dashed border-gray-800" onDragOver={(e) => handleDragOver(e, ru, `${currentView}-right`)} onDrop={(e) => handleDrop(e, ru, `${currentView}-right`)} />
                </div>
            );
        });
    };

    return (
        <div className="flex-shrink-0 w-[350px] bg-gray-800/50 p-4 rounded-xl flex flex-col">
            <div className="flex justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-2 min-w-0">
                    <HardDrive className="text-amber-400 flex-shrink-0" />
                    <h3 className="text-xl font-bold text-white truncate">{rack.rack_name}</h3>
                </div>
            </div>
            <div className="flex-grow bg-gray-900/50 p-2 rounded-lg relative" onDragLeave={() => setDragOverInfo(null)}>
                <h4 className="text-center font-bold mb-2 capitalize">{view}</h4>
                <div className="relative bg-gray-800 rounded-md">
                    {renderRUs(view)}
                    <div className="absolute inset-0">
                        {(rack.equipment || [])
                            .filter(item => item.rack_side && item.rack_side.startsWith(view))
                            .map(item => (
                                <div key={item.id} className="pointer-events-auto">
                                    <PlacedEquipmentItem item={item} onDragStart={onDragStart} onDelete={() => onDelete(item.id)} />
                                </div>
                            ))}
                    </div>
                    <div style={getHighlightStyle()} />
                </div>
            </div>
        </div>
    );
};

export default RackComponent;