import React, { useMemo } from 'react';

// --- 1. Sub-component: The dashed background grid ---
const RackBackgroundGrid = ({ height }) => {
    const rus = Array.from({ length: height }, (_, i) => i);
    return (
        <div className="absolute inset-0 pointer-events-none z-0">
            {rus.map(ru => (
                <div key={ru} className="h-[25px] border-b border-dashed border-gray-700 opacity-50" />
            ))}
        </div>
    );
};

// --- 2. Main Component ---
const RackSideView = ({ rack, showHeader = false }) => {
    
    // --- Hook: Process Data ---
    const renderableItems = useMemo(() => {
        if (!rack || !rack.equipment) return [];

        const groups = {};

        rack.equipment.forEach(item => {
            const { ru_position, rack_side } = item;
            const sideKey = rack_side.toLowerCase().startsWith('front') ? 'front' : 'rear';
            const key = `${ru_position}-${sideKey}`;

            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });

        const processed = [];
        Object.values(groups).forEach(group => {
            group.sort((a, b) => a.instance_name.localeCompare(b.instance_name));
            const count = group.length;
            group.forEach((item, index) => {
                processed.push({
                    ...item,
                    visualMeta: {
                        isSharedSlot: count > 1,
                        slotIndex: index,
                        slotTotal: count
                    }
                });
            });
        });

        return processed;
    }, [rack]);

    if (!rack) return null;

    // --- 3. CONSTANTS & MATH ---
    const RACK_U_HEIGHT_PX = 25;
    const DRAWING_AREA_WIDTH = 286; 
    const RACK_DEPTH_INCHES = 24; 

    const rackPixelHeight = rack.ru_height * RACK_U_HEIGHT_PX;

    // --- 4. Render Helper: RU Columns ---
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
        <div className="w-[350px] flex-shrink-0 flex flex-col font-sans select-none animate-fade-in">
            {showHeader && (
                <div className="bg-gray-800 rounded-t-lg p-4">
                    <h3 className="text-lg font-bold text-center text-white capitalize">{rack.rack_name} - Side View</h3>
                </div>
            )}
            
            <div className="relative" style={{ height: `${rackPixelHeight}px` }}>
                <div className={`absolute inset-0 flex overflow-hidden border border-gray-700 ${showHeader ? 'rounded-b-lg' : 'rounded-lg'}`}>
                    
                    {/* LEFT RU COLUMN (Front Rail) */}
                    <div className="w-8 border-r border-gray-700 flex flex-col bg-gray-900 z-20">
                        {renderRuColumn()}
                    </div>

                    {/* CENTER DRAWING AREA */}
                    <div className="relative flex-grow bg-gray-900 overflow-hidden">
                        
                        {/* Background Grid */}
                        <RackBackgroundGrid height={rack.ru_height} />
                        
                        {/* Visual Rails Overlay */}
                        <div className="absolute top-0 bottom-0 left-0 w-[1px] bg-red-500/20 z-10" />
                        <div className="absolute top-0 bottom-0 right-0 w-[1px] bg-red-500/20 z-10" />

                        {/* Render Items */}
                        {renderableItems.map(item => {
                            const { ru_position, equipment_templates, rack_side, visualMeta } = item;
                            
                            if (!equipment_templates) return null;

                            const depth = equipment_templates.depth || 10;
                            const fullRowHeight = equipment_templates.ru_height * RACK_U_HEIGHT_PX;
                            
                            // Math: Scale to 24"
                            let widthPx = (depth / RACK_DEPTH_INCHES) * DRAWING_AREA_WIDTH;
                            
                            // Position Top
                            const baseTop = (rack.ru_height - ru_position - equipment_templates.ru_height + 1) * RACK_U_HEIGHT_PX;
                            const height = fullRowHeight / visualMeta.slotTotal;
                            const top = baseTop + (visualMeta.slotIndex * height);

                            const isFront = rack_side.toLowerCase().startsWith('front');
                            const isCramped = visualMeta.slotTotal >= 3;

                            const style = {
                                height: `${height - 1}px`, 
                                width: `${widthPx}px`,
                                maxWidth: '100%', 
                                top: `${top}px`,
                                zIndex: 20,
                                // --- COLOR CHANGE HERE ---
                                // Shared slots are now Purple (#805AD5) to contrast with the Blue front rail indicator.
                                backgroundColor: visualMeta.isSharedSlot ? '#805AD5' : '#4A5568', 
                                border: '1px solid rgba(255,255,255,0.2)',
                                position: 'absolute'
                            };

                            // Alignment & Indicators
                            if (isFront) {
                                style.left = '0px'; 
                                style.borderLeft = '3px solid #63b3ed'; // Blue Indicator
                                style.borderTopRightRadius = '4px';     
                                style.borderBottomRightRadius = '4px';
                            } else {
                                style.right = '0px'; 
                                style.borderRight = '3px solid #f6ad55'; // Orange Indicator
                                style.borderTopLeftRadius = '4px';       
                                style.borderBottomLeftRadius = '4px';
                            }

                            return (
                                <div 
                                    key={item.id} 
                                    className="flex items-center justify-center overflow-hidden hover:brightness-110 transition-all cursor-pointer group shadow-sm" 
                                    style={style}
                                    title={`${item.instance_name} (Depth: ${depth}")`}
                                >
                                    <span className={`text-white whitespace-nowrap px-1 truncate font-medium drop-shadow-md ${isCramped ? 'text-[8px] leading-none' : 'text-[10px]'}`}>
                                        {item.instance_name}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* RIGHT RU COLUMN (Rear Rail) */}
                    <div className="w-8 border-l border-gray-700 flex flex-col bg-gray-900 z-20">
                        {renderRuColumn()}
                    </div>
                </div>
            </div>
            
            {/* Legend */}
            <div className="mt-2 flex justify-center gap-4 text-[10px] text-gray-500 font-mono">
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-[#63b3ed]"/> Front Mount</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-[#f6ad55]"/> Rear Mount</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-[#805AD5]"/> Shared Slot</span>
            </div>
        </div>
    );
};

export default RackSideView;