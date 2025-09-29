import React, { memo, useState, useLayoutEffect, useRef } from 'react';
import { Handle, Position } from 'reactflow';

const DeviceNode = ({ data, onDoubleClick }) => {
    const { label, ip_address, rack_name, ru_position, equipment_templates } = data;
    const ports = equipment_templates?.ports || [];

    const inputPorts = ports.filter(p => p.type === 'input');
    const outputPorts = ports.filter(p => p.type === 'output');
    const ioPorts = ports.filter(p => p.type === 'io');

    const topContentRef = useRef(null);
    const [topContentHeight, setTopContentHeight] = useState(70); 

    useLayoutEffect(() => {
        if (topContentRef.current) {
            setTopContentHeight(topContentRef.current.offsetHeight);
        }
    }, [data]);

    const portSpacing = 32;
    const listPadding = 15;

    const maxStandardPorts = Math.max(inputPorts.length, outputPorts.length);
    const totalPortsHeight = (maxStandardPorts + ioPorts.length) * portSpacing;
    const nodeHeight = topContentHeight + listPadding + totalPortsHeight + listPadding;
    const portsStartY = topContentHeight + listPadding;

    return (
        <div 
            className="bg-gray-700/80 backdrop-blur-sm border-2 border-gray-600 rounded-lg shadow-lg text-white w-96 relative"
            style={{ height: `${nodeHeight}px` }}
            onDoubleClick={onDoubleClick}
        >
            <div ref={topContentRef}>
                <div className="bg-gray-800 px-4 py-2 rounded-t-lg border-b-2 border-gray-600">
                    <p className="font-bold text-base truncate" title={label}>{label}</p>
                </div>
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
                    key={`in-${port.id}`} 
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

            {/* Output Ports */}
            {outputPorts.map((port, index) => (
                <div 
                    key={`out-${port.id}`} 
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

            {/* Aligned IO Ports */}
            {ioPorts.map((port, index) => {
                const yPos = portsStartY + (maxStandardPorts + index) * portSpacing;
                return (
                    <div key={`io-${port.id}`} className="absolute w-full h-8" style={{ top: `${yPos}px` }}>
                        {/* Pass-through line */}
                        <div 
                            className="absolute top-1/2 left-4 right-4 h-px bg-blue-300 opacity-50"
                            style={{ transform: 'translateY(-50%)' }}
                        ></div>
                        {/* Input Handle */}
                        <Handle
                            type="target"
                            position={Position.Left}
                            id={`port-in-${port.id}`}
                            className={'!bg-blue-400 !w-3 !h-3'}
                            style={{ top: '50%', transform: 'translateY(-50%)' }}
                        />
                        {/* Centered Label */}
                        <div className="absolute w-full top-1/2 -translate-y-1/2 flex justify-center">
                            <p className="text-center text-xs font-mono bg-gray-700 px-2 rounded">
                                {port.label} <span className="text-gray-400">({port.connector_type})</span>
                            </p>
                        </div>
                        {/* Output Handle */}
                        <Handle
                            type="source"
                            position={Position.Right}
                            id={`port-out-${port.id}`}
                            className={'!bg-blue-400 !w-3 !h-3'}
                            style={{ top: '50%', transform: 'translateY(-50%)' }}
                        />
                    </div>
                );
            })}
        </div>
    );
};

export default memo(DeviceNode);