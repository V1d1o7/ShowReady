import React, { useMemo } from 'react';
import PlacedEquipmentItem from './PlacedEquipmentItem';
import GhostEquipmentItem from './GhostEquipmentItem';

const RackBackgroundGrid = ({ height }) => {
    const rus = Array.from({ length: height }, (_, i) => i);
    return (
        <div className="absolute inset-0 pointer-events-none">
            {rus.map(ru => (
                <div key={ru} className="h-[25px] border-b border-dashed border-gray-700" />
            ))}
        </div>
    );
};

const RackComponent = ({
    rack,
    view,
    onDrop,
    onDelete,
    onDragStart,
    draggedItem,
    dragOverData,
    onDragOverRack,
}) => {
    const equipmentInView = useMemo(() =>
        (rack.equipment || []).filter(item => item.rack_side.startsWith(view)),
        [rack.equipment, view]
    );

    const rackBodyHeight = rack.ru_height * 25;

    const handleDragOver = (e) => {
        e.preventDefault();
        if (!draggedItem) return;

        const rackBody = e.currentTarget.getBoundingClientRect();
        const template = draggedItem.isNew ? draggedItem.item : draggedItem.item.equipment_templates;
        
        if (!template) return;

        const isFullWidth = template.width !== 'half';

        const x = e.clientX - rackBody.left;
        const isRightSide = x > rackBody.width / 2;

        const y = e.clientY - rackBody.top;
        const itemHeightInRUs = template.ru_height || 1;
        const ruOffset = Math.floor(itemHeightInRUs / 2);
        const calculatedRu = rack.ru_height - Math.floor(y / 25) - ruOffset;
        
        const side = `${view}${isRightSide ? '-right' : '-left'}`;

        onDragOverRack({ rackId: rack.id, ru: calculatedRu, side });
    };

    const handleDragLeave = () => {
        onDragOverRack(null);
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

    return (
        <div className="w-[350px] flex-shrink-0 flex flex-col" style={{ borderCollapse: 'collapse' }}>
            <div className="bg-gray-800 rounded-t-lg p-4">
                <h3 className="text-lg font-bold text-center text-white capitalize">{rack.rack_name} - {view} View</h3>
            </div>
            
            <div className="relative" style={{ height: `${rackBodyHeight}px` }}>
                <div className="absolute inset-0 rounded-b-lg flex overflow-hidden border border-gray-700">
                    {/* Left RU Column */}
                    <div className="w-8 border-r border-gray-700 flex flex-col bg-gray-900">
                        {renderRuColumn()}
                    </div>
                    
                    {/* The single, intelligent drop zone */}
                    <div 
                        className="relative flex-grow bg-gray-900"
                        onDragOver={handleDragOver}
                        onDrop={onDrop}
                        onDragLeave={handleDragLeave}
                    >
                        {/* Render the visual background grid to restore the original look */}
                        <RackBackgroundGrid height={rack.ru_height} />
                        
                        {/* Render Placed Equipment */}
                        {equipmentInView.map(item => (
                            <PlacedEquipmentItem
                                key={item.id}
                                item={item}
                                onDelete={onDelete}
                                onDragStart={onDragStart}
                            />
                        ))}
                        
                        {/* Render Ghost item when dragging over THIS specific rack */}
                        {draggedItem && dragOverData && dragOverData.rackId === rack.id && dragOverData.side.startsWith(view) && (
                            <GhostEquipmentItem 
                                item={draggedItem}
                                ru={dragOverData.ru}
                                side={dragOverData.side}
                                rackHeight={rack.ru_height}
                            />
                        )}
                    </div>

                    {/* Right RU Column */}
                    <div className="w-8 border-l border-gray-700 flex flex-col bg-gray-900">
                        {renderRuColumn()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RackComponent;