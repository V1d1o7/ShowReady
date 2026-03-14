import React from 'react';
import { useDroppable } from '@dnd-kit/core';

const PeDroppableSlot = ({ slot, onDrop, children, isOccupied, className = "", overlayClass = "inset-0 rounded-sm" }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `slot-${slot.id}`,
        data: { slot }
    });

    const highlightColor = isOccupied ? 'bg-red-500/50' : 'bg-green-500/50';

    return (
        <div ref={setNodeRef} className={`w-full h-full relative ${className}`}>
            {isOver && (
                <div className={`absolute z-30 pointer-events-none transition-colors ${highlightColor} ${overlayClass}`}></div>
            )}
            {children}
        </div>
    );
};

export default PeDroppableSlot;