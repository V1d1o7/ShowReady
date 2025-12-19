import React from 'react';

const GhostEquipmentItem = ({ item, ru, side, rackHeight }) => {
    if (!item || !ru) return null;

    const template = item.isNew ? item.item : item.item.equipment_templates || {};
    if (!template) return null;

    if (ru < 1 || ru + template.ru_height - 1 > rackHeight) {
        return null;
    }

    const bottomPosition = (ru - 1) * 25;
    const itemHeight = (template.ru_height || 1) * 25;

    const widthClass = (() => {
        if (template.width === 'half') return 'w-1/2';
        if (template.width === 'third') return 'w-1/3';
        return 'w-full';
    })();

    const positionClass = (() => {
        if (!side) return 'left-0';
        if (side.endsWith('-right')) {
            return template.width === 'third' ? 'left-2/3' : 'left-1/2';
        }
        if (side.endsWith('-middle')) {
            return 'left-1/3';
        }
        return 'left-0';
    })();

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