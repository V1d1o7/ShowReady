import React, { useState, useMemo } from 'react';
import PlacedEquipmentItem from './PlacedEquipmentItem';

const RackDropZone = ({ onDrop, ru, side }) => {
    const [isOver, setIsOver] = useState(false);
    return (
        <div
            onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
            onDragLeave={() => setIsOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setIsOver(false);
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                onDrop(data, ru, side);
            }}
            className={`h-full transition-colors ${isOver ? 'bg-amber-500/30' : 'bg-transparent'}`}
        />
    );
};

const RackComponent = ({ rack, view, onDrop, onDelete, onDragStart, draggedItem }) => {
    const equipmentInView = useMemo(() =>
        (rack.equipment || []).filter(item => item.rack_side === view),
        [rack.equipment, view]
    );

    const isRuOccupied = (ru) => {
        return (rack.equipment || []).some(item => {
            const template = item.equipment_templates;
            if (!template) return false;
            const start = item.ru_position;
            const end = start + template.ru_height - 1;
            return ru >= start && ru <= end;
        });
    };

    const renderRUs = () => {
        const rus = [];
        for (let i = rack.ru_height; i >= 1; i--) {
            const occupied = isRuOccupied(i);
            rus.push(
                <div key={i} className="flex items-center" style={{ height: '25px' }}>
                    <div className="w-8 text-center text-xs text-gray-500 border-r border-gray-700">{i}</div>
                    <div className="flex-grow h-full relative">
                       {!occupied && <RackDropZone onDrop={onDrop} ru={i} side={view} />}
                    </div>
                    <div className="w-8 text-center text-xs text-gray-500 border-l border-gray-700">{i}</div>
                </div>
            );
        }
        return rus;
    };
    
    return (
        <div className="bg-gray-800 rounded-lg p-4 w-[400px] flex-shrink-0">
            <h3 className="text-lg font-bold text-center text-white mb-4 capitalize">{rack.rack_name} - {view} View</h3>
            <div className="bg-gray-900 rounded-md border-2 border-gray-700 relative">
                {renderRUs()}
                {equipmentInView.map(item => (
                    <PlacedEquipmentItem
                        key={item.id}
                        item={item}
                        onDelete={onDelete}
                        onDragStart={onDragStart}
                        draggedItem={draggedItem}
                        rackHeight={rack.ru_height}
                    />
                ))}
            </div>
        </div>
    );
};

export default RackComponent;