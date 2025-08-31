import React from 'react';

const GhostEquipmentItem = ({ item, ru, side, rackHeight }) => {
    if (!item || !ru) return null;

    const template = item.isNew ? item.item : item.item.equipment_templates || {};
    if (!template) return null;

    const isHalfWidth = template.width === 'half';

    if (ru < 1 || ru + template.ru_height - 1 > rackHeight) {
        return null;
    }

    const bottomPosition = (ru - 1) * 25;
    const itemHeight = (template.ru_height || 1) * 25;
    const widthClass = isHalfWidth ? 'w-1/2' : 'w-full';
    const positionClass = isHalfWidth && side && side.endsWith('-right') ? 'left-1/2' : 'left-0';

    return (
        <div
            className={`
                absolute ${widthClass} ${positionClass} bg-sky-500/30 border-2 border-dashed
                border-sky-400 rounded-sm pointer-events-none
            `}
            style={{
                height: `${itemHeight}px`,
                bottom: `${bottomPosition}px`,
                zIndex: 30,
            }}
        />
    );
};

export default GhostEquipmentItem;