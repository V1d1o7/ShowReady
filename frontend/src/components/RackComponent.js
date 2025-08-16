import React, { useState, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import PlacedEquipmentItem from './PlacedEquipmentItem';
import { HardDrive, Edit, Trash2, Check, Save } from 'lucide-react';
import { api } from '../api/api';

const RackComponent = ({ rack, view, onUpdate, onDelete, onSave }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [rackName, setRackName] = useState(rack.rack_name);

    const handleSaveName = () => {
        onSave(rack.id, { rack_name: rackName });
        setIsEditing(false);
    };

    const handleDeleteEquipment = async (instanceId) => {
        if (!window.confirm("Are you sure you want to remove this equipment?")) return;
        try {
            await api.deleteEquipmentFromRack(instanceId);
            onUpdate();
        } catch (error) {
            console.error("Failed to delete equipment:", error);
            alert(`Error deleting equipment: ${error.message}`);
        }
    };

    const occupiedSlots = useMemo(() => {
        const slots = new Map();
        (rack.equipment || []).forEach(item => {
            const template = item.equipment_templates || {};
            const height = template.ru_height || 1;
            for (let i = 0; i < height; i++) {
                const currentRu = item.ru_position + i;
                // A full-width item occupies both left and right slots on its designated side (front or rear)
                if (template.width === 'full') {
                    slots.set(`${currentRu}-${item.rack_side}-left`, true);
                    slots.set(`${currentRu}-${item.rack_side}-right`, true);
                } else if (item.rack_side) {
                    // A half-width item only occupies its specific slot
                    slots.set(`${currentRu}-${item.rack_side}`, true);
                }
            }
        });
        return slots;
    }, [rack.equipment]);

    const DroppableRUSlot = ({ ru, side }) => {
        const { isOver, setNodeRef } = useDroppable({
            id: `rack-${rack.id}-ru-${ru}-side-${side}`,
            data: {
                rackId: rack.id,
                ru,
                side,
                type: 'ru-slot'
            },
            disabled: occupiedSlots.has(`${ru}-${side}`)
        });
    
        const isOccupied = occupiedSlots.has(`${ru}-${side}`);
    
        return (
            <div
                ref={setNodeRef}
                className={`h-full transition-colors ${isOver && !isOccupied ? 'bg-amber-500/30' : ''} ${isOccupied ? 'bg-red-500/10' : ''}`}
            />
        );
    };

    const renderRUs = (side) => {
        return Array.from({ length: rack.ru_height }, (_, i) => {
            const ru = rack.ru_height - i;
            return (
                <div key={`${side}-${ru}`} className="h-6 border-b border-gray-700/50 flex">
                    <div className="w-1/2 h-full"><DroppableRUSlot ru={ru} side={`${side}-left`} /></div>
                    <div className="w-1/2 h-full border-l border-dashed border-gray-800"><DroppableRUSlot ru={ru} side={`${side}-right`} /></div>
                </div>
            );
        });
    };

    return (
        <div className="flex-shrink-0 w-[350px] bg-gray-800/50 p-4 rounded-xl flex flex-col">
             <div className="flex justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-2 min-w-0">
                    <HardDrive className="text-amber-400 flex-shrink-0" />
                    {isEditing ? (
                        <input
                            type="text"
                            value={rackName}
                            onChange={(e) => setRackName(e.target.value)}
                            className="bg-gray-700 text-white p-1 rounded-md text-xl font-bold w-full"
                            autoFocus
                            onBlur={handleSaveName}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                        />
                    ) : (
                        <h3 className="text-xl font-bold text-white truncate">{rack.rack_name}</h3>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-mono bg-gray-700 px-2 py-1 rounded-md">{rack.ru_height}RU</span>
                    {view === 'front' && (
                        <>
                            {isEditing ? (
                                <button onClick={handleSaveName} className="p-2 text-green-400 hover:bg-gray-700 rounded-md"><Check size={18} /></button>
                            ) : (
                                <button onClick={() => setIsEditing(true)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md"><Edit size={18} /></button>
                            )}
                             {rack.saved_to_library && (
                                <button onClick={() => onSave(rack.id, { saved_to_library: true })} className="p-2 text-gray-400 hover:text-amber-400 hover:bg-gray-700 rounded-md"><Save size={18} /></button>
                            )}
                            <button onClick={() => onDelete(rack.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-700 rounded-md"><Trash2 size={18} /></button>
                        </>
                    )}
                </div>
            </div>
            <div className="flex-grow bg-gray-900/50 p-2 rounded-lg relative">
                 <h4 className="text-center font-bold mb-2 capitalize">{view}</h4>
                 <div className="relative bg-gray-800 rounded-md">
                    {renderRUs(view)}
                    <div className="absolute inset-0 pointer-events-none">
                        {rack.equipment.filter(item => item.rack_side === view).map(item => (
                            <PlacedEquipmentItem 
                                key={item.id} 
                                item={item} 
                                onDelete={handleDeleteEquipment}
                            />
                        ))}
                    </div>
                 </div>
            </div>
        </div>
    );
};

export default RackComponent;