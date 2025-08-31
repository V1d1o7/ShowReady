import React, { useState, useEffect } from 'react';
import DeviceNode from './DeviceNode';

const CustomDragLayer = ({ draggingItem }) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const zoom = draggingItem?.zoom || 1;

    useEffect(() => {
        const handleMouseMove = (event) => {
            setPosition({
                x: event.clientX,
                y: event.clientY,
            });
        };

        if (draggingItem) {
            window.addEventListener('mousemove', handleMouseMove);
            // Also listen for dragover to update position when mouse isn't moving but view is scrolling
            window.addEventListener('dragover', handleMouseMove);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('dragover', handleMouseMove);
        };
    }, [draggingItem]);

    if (!draggingItem) {
        return null;
    }

    const layerStyles = {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: 1000,
        left: 0,
        top: 0,
        transform: `translate(${position.x}px, ${position.y}px)`,
    };

    return (
        <div style={layerStyles}>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                <DeviceNode data={draggingItem} />
            </div>
        </div>
    );
};

export default CustomDragLayer;
