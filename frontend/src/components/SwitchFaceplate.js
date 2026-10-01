import React, { useRef, useCallback } from 'react';

// Renders a switch's ports laid out like a real faceplate: copper ports in the classic
// staggered 2-row pattern (port 1 top-left, port 2 below it, port 3 top-next-column, ...),
// plus a separate SFP/uplink block continuing the numbering. Each port is keyboard-
// navigable (arrow keys move within its block, Enter/Space opens it) so a tech can
// configure an entire switch without touching a mouse. A port that's a LAG member is
// marked distinctly and opens that LAG's config instead of its own -- VLAN membership
// lives on the LAG interface, not the member port.

const hasConfig = (config) =>
    !!config && (config.port_name || config.pvid || (config.tagged_vlans && config.tagged_vlans.length > 0));

const PortTile = ({ portNumber, config, isSfp, lagId, tileRef, onKeyDown, onActivate, style }) => {
    const configured = hasConfig(config);
    const inLag = !!lagId;

    return (
        <div
            ref={tileRef}
            tabIndex={0}
            role="button"
            aria-label={inLag
                ? `Port ${portNumber}, member of LAG ${lagId}`
                : `Port ${portNumber}${configured ? `, configured as ${config.port_name || 'unnamed'}` : ', unconfigured'}`}
            onKeyDown={onKeyDown}
            onClick={onActivate}
            style={style}
            className={`group flex flex-col items-center cursor-pointer outline-none`}
        >
            <div
                className={`relative w-9 border-2 transition-colors
                    ${isSfp ? 'h-6 rounded-sm' : 'h-8 rounded-b-md rounded-t-sm'}
                    ${inLag ? 'bg-purple-700 border-purple-400' : configured ? 'bg-blue-600 border-blue-400' : 'bg-gray-700 border-gray-600'}
                    group-hover:border-amber-400 group-focus:border-amber-400 group-focus:ring-2 group-focus:ring-amber-400/50`}
                style={isSfp ? { clipPath: 'polygon(10% 0, 90% 0, 100% 100%, 0 100%)' } : undefined}
            >
                {!isSfp && (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-0.5 w-4 h-2.5 rounded-sm bg-black/30" />
                )}
            </div>
            <p className="mt-1 text-[10px] font-bold text-gray-300">{portNumber}</p>
            <p className="text-[9px] text-gray-500 truncate w-12 text-center leading-tight">
                {inLag ? `LAG ${lagId}` : (config?.port_name || '')}
            </p>
        </div>
    );
};

const SwitchFaceplate = ({ switchDetails, portConfigs, portToLagId, onPortClick, onLagPortClick }) => {
    const tileRefs = useRef(new Map());

    // Existing switch_models rows predate the copper/sfp split (both default to 0) --
    // fall back to treating every port as copper using the old total so they don't
    // render as an empty faceplate.
    const hasSplit = !!(switchDetails?.copper_port_count || switchDetails?.sfp_port_count);
    const copperCount = hasSplit ? (switchDetails?.copper_port_count || 0) : (switchDetails?.port_count || 0);
    const sfpCount = hasSplit ? (switchDetails?.sfp_port_count || 0) : 0;

    const activatePort = useCallback((portNumber) => {
        const lagId = portToLagId?.[portNumber];
        if (lagId) onLagPortClick?.(lagId);
        else onPortClick(portNumber, portConfigs?.[portNumber]);
    }, [portToLagId, onLagPortClick, onPortClick, portConfigs]);

    const focusPort = useCallback((portNumber) => {
        tileRefs.current.get(portNumber)?.focus();
    }, []);

    const handleCopperKeyDown = useCallback((portNumber, e) => {
        // Staggered pairing: odd ports are the top row, even ports the bottom row of
        // the same column. Left/Right move a whole column (+/-2); Up/Down toggle
        // between the top/bottom port of the current column.
        const isTop = portNumber % 2 === 1;
        let target = null;
        if (e.key === 'ArrowRight') target = portNumber + 2;
        else if (e.key === 'ArrowLeft') target = portNumber - 2;
        else if (e.key === 'ArrowDown' && isTop) target = portNumber + 1;
        else if (e.key === 'ArrowUp' && !isTop) target = portNumber - 1;
        else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activatePort(portNumber);
            return;
        } else {
            return;
        }
        e.preventDefault();
        if (target >= 1 && target <= copperCount) focusPort(target);
    }, [copperCount, focusPort, activatePort]);

    const handleSfpKeyDown = useCallback((portNumber, e) => {
        let target = null;
        if (e.key === 'ArrowRight') target = portNumber + 1;
        else if (e.key === 'ArrowLeft') target = portNumber - 1;
        else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activatePort(portNumber);
            return;
        } else {
            return;
        }
        e.preventDefault();
        if (target >= copperCount + 1 && target <= copperCount + sfpCount) focusPort(target);
    }, [copperCount, sfpCount, focusPort, activatePort]);

    if (!switchDetails) return null;

    const copperPorts = Array.from({ length: copperCount }, (_, i) => i + 1);
    const sfpPorts = Array.from({ length: sfpCount }, (_, i) => copperCount + i + 1);

    return (
        <div className="flex flex-col gap-6 p-4 bg-gray-900 rounded-lg border border-gray-700 overflow-x-auto">
            {copperPorts.length > 0 && (
                <div
                    className="grid gap-x-3 gap-y-1 w-max"
                    style={{ gridTemplateRows: 'repeat(2, auto)', gridAutoFlow: 'column' }}
                >
                    {copperPorts.map(portNumber => (
                        <PortTile
                            key={portNumber}
                            portNumber={portNumber}
                            config={portConfigs?.[portNumber]}
                            isSfp={false}
                            lagId={portToLagId?.[portNumber]}
                            tileRef={(el) => tileRefs.current.set(portNumber, el)}
                            onKeyDown={(e) => handleCopperKeyDown(portNumber, e)}
                            onActivate={() => activatePort(portNumber)}
                            style={{ gridRow: portNumber % 2 === 1 ? 1 : 2 }}
                        />
                    ))}
                </div>
            )}
            {sfpPorts.length > 0 && (
                <div className="flex gap-3 items-end">
                    {sfpPorts.map(portNumber => (
                        <PortTile
                            key={portNumber}
                            portNumber={portNumber}
                            config={portConfigs?.[portNumber]}
                            isSfp={true}
                            lagId={portToLagId?.[portNumber]}
                            tileRef={(el) => tileRefs.current.set(portNumber, el)}
                            onKeyDown={(e) => handleSfpKeyDown(portNumber, e)}
                            onActivate={() => activatePort(portNumber)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default SwitchFaceplate;
