import React from 'react';

const RackSideView = ({ rack, showHeader = true }) => {
    if (!rack) {
        return null;
    }

    const rackDepth = 24; // Standard 24-inch rack depth
    const rackPixelHeight = rack.ru_height * 25;
    const rackPixelWidth = 300; // Fixed width for the side view

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
            {showHeader && (
                <div className="bg-gray-800 rounded-t-lg p-4 overflow-hidden">
                    <h3 className="text-lg font-bold text-center text-white truncate">{rack.rack_name} - Side View</h3>
                </div>
            )}
            <div className="relative" style={{ height: `${rackPixelHeight}px` }}>
                <div className={`absolute inset-0 flex overflow-hidden border border-gray-700 ${showHeader ? 'rounded-b-lg' : 'rounded-lg'}`}>
                    <div className="w-8 border-r border-gray-700 flex flex-col bg-gray-900">
                        {renderRuColumn()}
                    </div>
                    <div className="relative bg-gray-900 flex-grow">
                        {/* Rack Rails */}
                        <div className="absolute top-0 bottom-0 left-0 w-2 bg-gray-600" />
                        <div className="absolute top-0 bottom-0 right-0 w-2 bg-gray-600" />

                        {/* Equipment */}
                        {(rack.equipment || []).map(item => {
                            const { ru_position, equipment_templates, rack_side } = item;
                            if (!equipment_templates) return null;
                            
                            const depth = equipment_templates.depth || 0;
                            if (depth === 0) return null;

                            const itemHeight = equipment_templates.ru_height * 25;
                            const itemWidth = (depth / rackDepth) * rackPixelWidth;
                            const top = (rack.ru_height - ru_position - equipment_templates.ru_height + 1) * 25;
                            
                            const style = {
                                height: `${itemHeight}px`,
                                width: `${itemWidth}px`,
                                top: `${top}px`,
                                backgroundColor: '#4A5568', // gray-600
                                border: '1px solid #2D3748', // gray-700
                            };

                            if (rack_side.startsWith('front')) {
                                style.left = '0px';
                            } else { // rear
                                style.right = '0px';
                            }

                            return (
                                <div key={item.id} className="absolute flex items-center justify-center" style={style}>
                                    <span className="text-white text-xs p-1">{item.instance_name}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RackSideView;
