import React, { memo, useState, useLayoutEffect, useRef } from 'react';
import { Handle, Position } from 'reactflow';

const DeviceNode = ({ data }) => {
    const { label, ip_address, rack_name, ru_position, equipment_templates } = data;
    const ports = equipment_templates?.ports || [];

    const inputPorts = ports.filter(p => p.type === 'input');
    const outputPorts = ports.filter(p => p.type === 'output');
    const ioPorts = ports.filter(p => p.type === 'io');

    // --- Final Corrected Logic ---

    const topContentRef = useRef(null);
    const [topContentHeight, setTopContentHeight] = useState(70); // Fallback height

    // Measure the actual height of the header/body content
    useLayoutEffect(() => {
        if (topContentRef.current) {
            setTopContentHeight(topContentRef.current.offsetHeight);
        }
    }, [data]);

    // Match the port spacing to the port's div height (h-8 = 2rem = 32px)
    // This makes positioning pixel-perfect without magic numbers.
    const portSpacing = 32;
    
    // Aesthetic padding above the first port and below the last one.
    const listPadding = 15; 

    const maxPorts = Math.max(inputPorts.length + ioPorts.length, outputPorts.length);

    // Calculate the total height required for the list of port slots.
    const portsListHeight = maxPorts * portSpacing;
    
    // The final height is the measured top content + top padding + ports list + bottom padding.
    const nodeHeight = topContentHeight + listPadding + portsListHeight + listPadding;

    // The Y coordinate where the first port's div should start.
    const portsStartY = topContentHeight + listPadding;

    return (
        <div 
            className="bg-gray-700/80 backdrop-blur-sm border-2 border-gray-600 rounded-lg shadow-lg text-white w-96 relative"
            style={{ height: `${nodeHeight}px` }}
        >
            {/* Wrapper for measuring the top content */}
            <div ref={topContentRef}>
                {/* Header */}
                <div className="bg-gray-800 px-4 py-2 rounded-t-lg border-b-2 border-gray-600">
                    <p className="font-bold text-base truncate" title={label}>{label}</p>
                </div>

                {/* Body */}
                <div className="p-3 text-xs">
                    <div className="flex justify-between">
                        <p className="text-gray-300">
                            <span className="font-semibold text-gray-400">IP:</span> {ip_address || 'N/A'}
                        </p>
                        <p className="text-gray-300">
                            <span className="font-semibold text-gray-400">Loc:</span> {rack_name || 'N/A'} / RU {ru_position}
                        </p>
                    </div>
                </div>
            </div>

            {/* Input Ports */}
            {inputPorts.map((port, index) => (
                <div 
                    key={port.id} 
                    className="absolute left-0 flex items-center h-8" 
                    style={{ top: `${portsStartY + (index * portSpacing)}px` }}
                >
                    <Handle
                        type="target"
                        position={Position.Left}
                        id={`port-in-${port.id}`}
                        className={'!bg-teal-400 !w-3 !h-3'}
                    />
                    <p className="ml-5 text-xs font-mono">{port.label} <span className="text-gray-400">({port.connector_type})</span></p>
                </div>
            ))}

            {/* IO Ports */}
            {ioPorts.map((port, index) => (
                <div
                    key={port.id}
                    className="absolute left-0 flex items-center h-8"
                    style={{ top: `${portsStartY + ((inputPorts.length + index) * portSpacing)}px` }}
                >
                    {/* The target handle (the visible blue dot). It is rendered first, so it's underneath. */}
                    <Handle
                        type="target"
                        position={Position.Left}
                        id={`port-in-${port.id}`}
                        className="!bg-blue-400 !w-3 !h-3"
                    />
                    {/* The source handle is a transparent overlay to capture drag events. 
                        It's rendered second, so it will be on top of the target handle, capturing the click.
                        It's made slightly larger to make it easier to grab. */}
                    <Handle
                        type="source"
                        position={Position.Left}
                        id={`port-out-${port.id}`}
                        className="!bg-transparent !w-5 !h-5 !border-0"
                    />
                    <p className="ml-5 text-xs font-mono">{port.label} <span className="text-gray-400">({port.connector_type})</span></p>
                </div>
            ))}


            {/* Output Ports */}
            {outputPorts.map((port, index) => (
                <div 
                    key={port.id} 
                    className="absolute right-0 flex items-center justify-end h-8" 
                    style={{ top: `${portsStartY + (index * portSpacing)}px` }}
                >
                    <p className="mr-5 text-xs font-mono text-right">{port.label} <span className="text-gray-400">({port.connector_type})</span></p>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id={`port-out-${port.id}`}
                        className={'!bg-amber-400 !w-3 !h-3'}
                    />
                </div>
            ))}
        </div>
    );
};

export default memo(DeviceNode);
