import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const DeviceNode = ({ data }) => {
    const { label, ip_address, rack_name, ru_position, equipment_templates } = data;
    const ports = equipment_templates?.ports || [];

    const inputPorts = ports.filter(p => p.type === 'input');
    const outputPorts = ports.filter(p => p.type === 'output');

    const portSpacing = 35; // px
    // Adjust node height based on the maximum number of ports on either side
    const nodeHeight = Math.max(inputPorts.length, outputPorts.length) * portSpacing + 120;

    return (
        <div 
            className="bg-gray-700/80 backdrop-blur-sm border-2 border-gray-600 rounded-lg shadow-lg text-white w-96"
            style={{ height: `${nodeHeight}px` }}
        >
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

            {/* Ports Container */}
            <div className="relative mt-2">
                {/* Input Ports on the left */}
                <div className="absolute left-0 top-0">
                    {inputPorts.map((port, index) => (
                        <div key={port.id} className="relative flex items-center h-8" style={{top: `${index * portSpacing}px`}}>
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={`port-in-${port.id}`}
                                className="!bg-teal-400 !w-3 !h-3"
                            />
                            <p className="ml-5 text-xs font-mono">{port.label} <span className="text-gray-400">({port.connector_type})</span></p>
                        </div>
                    ))}
                </div>

                {/* Output Ports on the right */}
                <div className="absolute right-0 top-0">
                    {outputPorts.map((port, index) => (
                        <div key={port.id} className="relative flex items-center justify-end h-8" style={{top: `${index * portSpacing}px`}}>
                            <p className="mr-5 text-xs font-mono text-right">{port.label} <span className="text-gray-400">({port.connector_type})</span></p>
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={`port-out-${port.id}`}
                                className="!bg-amber-400 !w-3 !h-3"
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default memo(DeviceNode);
