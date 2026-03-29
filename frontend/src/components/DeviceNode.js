import React, { memo, useState, useLayoutEffect, useRef } from 'react';
import { Handle, Position } from 'reactflow';

const DeviceNode = ({ data, onDoubleClick }) => {
    // Extract the new 'highlighted' prop
    const { label, ip_address, rack_name, ru_position, equipment_templates, highlighted } = data;
    const ports = equipment_templates?.ports || [];
    const isPatchPanel = equipment_templates?.is_patch_panel;

    const naturalSort = (a, b) => {
        const labelA = a.label || '';
        const labelB = b.label || '';
        return labelA.localeCompare(labelB, undefined, { numeric: true, sensitivity: 'base' });
    };

    // Standard equipment sorting (Ignored for Patch Panels)
    const inputPorts = ports.filter(p => p.type === 'input').sort(naturalSort);
    const outputPorts = ports.filter(p => p.type === 'output').sort(naturalSort);
    const ioPorts = ports.filter(p => p.type === 'io').sort(naturalSort);

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
    const totalPortsHeight = isPatchPanel 
        ? ports.length * portSpacing 
        : (maxStandardPorts + ioPorts.length) * portSpacing;
        
    const nodeHeight = topContentHeight + listPadding + totalPortsHeight + listPadding;
    const portsStartY = topContentHeight + listPadding;

    return (
        <div 
            className={`backdrop-blur-sm border-2 rounded-lg shadow-lg text-white w-96 relative transition-all duration-500 ${
                highlighted 
                    ? 'bg-gray-700/95 border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.6)] scale-[1.02] z-50 ring-4 ring-amber-500/20' 
                    : 'bg-gray-700/80 border-gray-600 hover:border-gray-500'
            }`}
            style={{ height: `${nodeHeight}px` }}
            onDoubleClick={onDoubleClick}
        >
            <div ref={topContentRef}>
                <div className={`px-4 py-2 rounded-t-lg border-b-2 transition-colors duration-500 ${highlighted ? 'bg-gray-900 border-amber-400' : 'bg-gray-800 border-gray-600'}`}>
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

            {isPatchPanel ? (
                /* ========================================= */
                /* PATCH PANEL RENDERING                     */
                /* ========================================= */
                ports.map((port, index) => {
                    const yPos = portsStartY + (index * portSpacing);
                    
                    if (port.isEmpty) {
                        return (
                            <div key={`empty-${index}`} className="absolute w-full h-8" style={{ top: `${yPos}px` }}>
                                <div className="absolute w-full top-1/2 -translate-y-1/2 flex justify-center">
                                    <p className="text-center text-[10px] font-mono text-gray-500 italic px-2 rounded border border-gray-700 bg-gray-800/30">
                                        {port.full_label || 'Empty'}
                                    </p>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={`pp-${port.pei_id}-${port.id}`} className="absolute w-full h-8" style={{ top: `${yPos}px` }}>
                            {/* Pass-through line */}
                            <div 
                                className="absolute top-1/2 left-4 right-4 h-px bg-gray-500 opacity-50"
                                style={{ transform: 'translateY(-50%)' }}
                            ></div>
                            
                            {/* Back Handle (Left) */}
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={`pei_${port.pei_id}_port_${port.id}_back`}
                                className={'!bg-purple-400 !w-3 !h-3'}
                                style={{ top: '50%', transform: 'translateY(-50%)' }}
                            />
                            
                            {/* Centered Label */}
                            <div className="absolute w-full top-1/2 -translate-y-1/2 flex justify-center">
                                <p className="text-center text-xs font-mono bg-gray-700 px-2 rounded border border-gray-600">
                                    {port.full_label} <span className="text-gray-400">({port.connector_type})</span>
                                </p>
                            </div>
                            
                            {/* Front Handle (Right) */}
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={`pei_${port.pei_id}_port_${port.id}_front`}
                                className={'!bg-pink-400 !w-3 !h-3'}
                                style={{ top: '50%', transform: 'translateY(-50%)' }}
                            />
                        </div>
                    );
                })
            ) : (
                /* ========================================= */
                /* STANDARD DEVICE RENDERING                 */
                /* ========================================= */
                <>
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
                </>
            )}
        </div>
    );
};

export default memo(DeviceNode);