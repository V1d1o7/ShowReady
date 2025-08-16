import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import PlacedEquipmentItem from './PlacedEquipmentItem';
import { HardDrive } from 'lucide-react';

const DropZone = ({ ru, side, rackId }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `ru-${ru}-${side}-${rackId}`,
        data: { ru, side, type: 'rack-ru' }
    });

    const highlightStyle = isOver ? 'bg-blue-500/20' : '';
    const borderStyle = side.endsWith('-right') ? 'border-l border-dashed border-gray-800' : '';

    return (
        <div 
            ref={setNodeRef} 
            className={`w-1/2 h-full ${borderStyle} ${highlightStyle}`}
        />
    );
};

const RackComponent = ({ rack, view, onDelete }) => {
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

    return (
        <div className="flex-shrink-0 w-[350px] bg-gray-800/50 p-4 rounded-xl flex flex-col">
            <div className="flex justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-2 min-w-0">
                    <HardDrive className="text-amber-400 flex-shrink-0" />
                    <h3 className="text-xl font-bold text-white truncate">{rack.rack_name}</h3>
                </div>
            </div>
            <div className="flex-grow bg-gray-900/50 p-2 rounded-lg relative">
                <h4 className="text-center font-bold mb-2 capitalize">{view}</h4>
                <div className="relative bg-gray-800 rounded-md">
                    {Array.from({ length: rack.ru_height }, (_, i) => {
                        const ru = rack.ru_height - i;
                        return (
                            <div key={ru} className="h-6 border-b border-gray-700/50 flex">
                                <DropZone ru={ru} side={`${view}-left`} rackId={rack.id} />
                                <DropZone ru={ru} side={`${view}-right`} rackId={rack.id} />
                            </div>
                        );
                    })}
                    <div className="absolute inset-0">
                        {rack.equipment
                            .filter(item => item.rack_side?.startsWith(view))
                            .map(item => (
                                <PlacedEquipmentItem
                                    key={item.id}
                                    item={item}
                                    onDelete={() => onDelete(item.id)}
                                />
                            ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RackComponent;