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

    const rackBodyHeight = rack.ru_height * 25;

    const isRuOccupied = (ru) => {
        return equipmentInView.some(item => {
            const template = item.equipment_templates;
            if (!template) return false;
            const start = item.ru_position;
            const end = start + template.ru_height - 1;
            return ru >= start && ru <= end;
        });
    };

    const renderRuColumn = () => {
        const rus = [];
        for (let i = rack.ru_height; i >= 1; i--) {
            rus.push(
                <div key={i} className="flex h-[25px] flex-shrink-0 items-center justify-center text-xs text-gray-500">
                    {i}
                </div>
            );
        }
        return rus;
    };

    const renderDropZones = () => {
        const zones = [];
        for (let i = rack.ru_height; i >= 1; i--) {
            const occupied = isRuOccupied(i);
            zones.push(
                <div key={i} className="relative" style={{ height: '25px' }}>
                    {!occupied && <RackDropZone onDrop={onDrop} ru={i} side={view} />}
                </div>
            );
        }
        return zones;
    };

    return (
        <div className="bg-gray-800 rounded-lg p-4 w-[350px] flex-shrink-0">
            <h3 className="text-lg font-bold text-center text-white mb-4 capitalize">{rack.rack_name} - {view} View</h3>
            <div className="rounded-md border-2 border-gray-700 relative" style={{ height: `${rackBodyHeight}px` }}>
                
                {/* Left Sidebar for RUs and Border */}
                <div className="absolute top-0 bottom-0 left-0 w-8 border-r border-gray-700 flex flex-col bg-gray-900 rounded-l-md">
                    {renderRuColumn()}
                </div>

                {/* Center Content Area for Equipment */}
                <div className="absolute top-0 bottom-0 left-8 right-8 bg-gray-900">
                    {renderDropZones()}
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

                {/* Right Sidebar for RUs and Border */}
                <div className="absolute top-0 bottom-0 right-0 w-8 border-l border-gray-700 flex flex-col bg-gray-900 rounded-r-md">
                    {renderRuColumn()}
                </div>
            </div>
        </div>
    );
};

export default RackComponent;