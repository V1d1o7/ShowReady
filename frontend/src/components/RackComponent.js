import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import PlacedEquipmentItem from './PlacedEquipmentItem';
import { api } from '../api/api';

const RackComponent = ({ rack, onUpdate }) => {
    
    const handleDeleteEquipment = async (instanceId) => {
        if (!window.confirm("Are you sure you want to remove this equipment?")) return;
        try {
            await api.deleteEquipmentFromRack(instanceId);
            onUpdate(); // Trigger a re-fetch in the parent
        } catch (error) {
            console.error("Failed to delete equipment:", error);
            alert(`Error deleting equipment: ${error.message}`);
        }
    };

    // Create a map of occupied slots for quick visual feedback
    const occupiedSlots = useMemo(() => {
        const slots = new Map();
        (rack.equipment || []).forEach(item => {
            const template = item.equipment_templates || {};
            const height = template.ru_height || 1;
            for (let i = 0; i < height; i++) {
                const currentRu = item.ru_position + i;
                if (template.width === 'full') {
                    slots.set(`${currentRu}-left`, true);
                    slots.set(`${currentRu}-right`, true);
                } else if (item.rack_side) {
                    slots.set(`${currentRu}-${item.rack_side}`, true);
                }
            }
        });
        return slots;
    }, [rack.equipment]);

    const DropZone = ({ ru, side }) => {
        const { isOver, setNodeRef } = useDroppable({
            id: `rack-${rack.id}-ru-${ru}-side-${side}`,
            data: {
                rackId: rack.id,
                ruPosition: ru,
                side: side
            }
        });

        const isOccupied = occupiedSlots.has(`${ru}-${side}`);
        
        return (
            <div 
                ref={setNodeRef} 
                className={`h-full transition-colors ${isOver ? 'bg-amber-500/30' : ''} ${isOccupied ? 'bg-red-500/10' : ''}`}
            />
        );
    };

    return (
        <div className="flex-shrink-0 w-[300px] bg-gray-900/50 p-4 rounded-lg flex flex-col">
            <h3 className="text-lg font-bold text-white text-center mb-4">{rack.rack_name} ({rack.ru_height}RU)</h3>
            <div className="flex-grow flex gap-4">
                {/* RU Labels */}
                <div className="flex flex-col-reverse justify-end">
                    {Array.from({ length: rack.ru_height }, (_, i) => <div key={i} className="h-6 text-xs text-gray-500 text-right pr-2 select-none">{i + 1}</div>)}
                </div>

                <div className="flex-grow border-2 border-gray-600 rounded-md relative">
                    {/* Drop Zones */}
                    {Array.from({ length: rack.ru_height }, (_, i) => {
                        const ru = rack.ru_height - i;
                        return (
                            <div key={ru} className="h-6 border-b border-gray-700/50 flex">
                                <div className="w-1/2 h-full"><DropZone ru={ru} side="left" /></div>
                                <div className="w-1/2 h-full border-l border-dashed border-gray-800"><DropZone ru={ru} side="right" /></div>
                            </div>
                        );
                    })}

                    {/* Placed Equipment */}
                    <div className="absolute inset-0">
                        {(rack.equipment || []).map(item => (
                            <PlacedEquipmentItem key={item.id} item={item} onDelete={handleDeleteEquipment} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RackComponent;
