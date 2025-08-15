import React, { useMemo, useRef } from 'react';
import { api } from '../api/api';

const Port = ({ deviceId, port, onMouseDown, onMouseUp }) => {
  const isInput = port.type === 'input';
  const portColor = { 'HDMI': 'bg-blue-500', 'SDI': 'bg-green-500', 'XLR': 'bg-red-500', 'CAT6': 'bg-yellow-500', 'RJ45': 'bg-yellow-500' }[port.connector_type] || 'bg-gray-500';

  return (
    <div className={`flex items-center h-8 ${isInput ? 'flex-row' : 'flex-row-reverse'} my-1`}>
      <span className="text-xs text-gray-300 px-2 truncate">{port.label} ({port.connector_type})</span>
      <div
        id={`port-${deviceId}-${port.id}`}
        className={`w-4 h-4 rounded-full border-2 border-gray-900 cursor-pointer flex-shrink-0 ${portColor}`}
        data-port-id={port.id}
        data-device-id={deviceId}
        data-port-type={port.type}
        data-connector-type={port.connector_type}
        onMouseDown={isInput ? null : onMouseDown}
        onMouseUp={isInput ? onMouseUp : null}
        title={`${port.label} (${port.connector_type})`}
      />
    </div>
  );
};

const DeviceNode = ({ device, onPortMouseDown, onPortMouseUp, position, setPosition, onNodeClick }) => {
    const nodeRef = useRef(null);

    const handleMouseDown = (e) => {
        // Only drag when clicking on the header
        if (!e.target.classList.contains('drag-handle')) return;
        
        if (!nodeRef.current) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = nodeRef.current.offsetLeft;
        const startTop = nodeRef.current.offsetTop;

        const handleMouseMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            setPosition(device.id, startLeft + dx, startTop + dy);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            const newPos = {
                x_pos: nodeRef.current.offsetLeft,
                y_pos: nodeRef.current.offsetTop,
            };
            api.updateEquipmentInstance(device.id, newPos).catch(error => {
                console.error("Failed to save node position:", error);
            });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const ports = useMemo(() => {
        return device.equipment_templates.ports.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    }, [device.equipment_templates.ports]);
    
    const inputs = ports.filter(p => p.type === 'input');
    const outputs = ports.filter(p => p.type === 'output');

    return (
        <div
            ref={nodeRef}
            className="absolute bg-gray-800 rounded-lg shadow-xl border border-gray-700 flex text-white"
            style={{ left: position.x, top: position.y, minHeight: '100px' }}
            onDoubleClick={() => onNodeClick(device)}
            data-device-id={device.id}
        >
            {/* Input Ports Column */}
            <div className="border-r border-gray-700 p-2">
                {inputs.map((port) => <Port key={port.id} deviceId={device.id} port={port} onMouseUp={onPortMouseUp} />)}
            </div>

            {/* Center Info Column */}
            <div 
                className="p-4 w-48 cursor-grab active:cursor-grabbing drag-handle"
                onMouseDown={handleMouseDown}
            >
                <h3 className="font-bold text-md pointer-events-none">{device.instance_name}</h3>
                <p className="text-xs text-gray-400 pointer-events-none">{device.equipment_templates.model_number}</p>
                {device.ip_address && (
                    <p className="text-xs text-amber-400 mt-2 pointer-events-none">IP: {device.ip_address}</p>
                )}
            </div>

            {/* Output Ports Column */}
            <div className="border-l border-gray-700 p-2">
                {outputs.map((port) => <Port key={port.id} deviceId={device.id} port={port} onMouseDown={onPortMouseDown} />)}
            </div>
        </div>
    );
};

export default DeviceNode;