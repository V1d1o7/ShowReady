import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useDrag } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { MoreVertical, Copy, Trash2, Edit2, MessageSquare, StickyNote, Grid } from 'lucide-react';
import EditInstanceModal from './EditInstanceModal';
import { api } from '../api/api';

const PlacedEquipmentItem = ({ 
    item, 
    onDelete, 
    onUpdate, 
    onDragStart, 
    onOpenNotes,
    onConfigurePanel, // New prop for opening panel builder
    equipmentLibrary 
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [childCount, setChildCount] = useState(0); // State for child count
    const ref = useRef(null);

    // --- Panel Builder Logic ---
    // Identify if this item is a frame/panel that can be configured
    // Logic: If the template has slots defined, or has a specific slot_type indicating it's a container
    const isConfigurablePanel = useMemo(() => {
        const template = item.equipment_templates;
        if (!template) return false;
        
        // Check for slots definition or naming convention heuristic
        return (template.slots && template.slots.length > 0) || 
               (template.model_number && (
                   (template.model_number.includes('16') && template.model_number.includes('Panel')) || 
                   template.model_number.includes('UCP')
               ));
    }, [item.equipment_templates]);

    // Fetch children count if configurable
    useEffect(() => {
        if (isConfigurablePanel) {
            const fetchChildren = async () => {
                try {
                    const children = await api.getEquipmentChildren(item.id);
                    setChildCount(children?.length || 0);
                } catch (err) {
                    // Silent fail is acceptable here to avoid spamming console if ID not ready
                    console.warn("Could not fetch panel children", err);
                }
            };
            fetchChildren();
        }
    }, [item.id, isConfigurablePanel]);
    // ---------------------------

    const [{ isDragging }, drag, preview] = useDrag({
        type: 'PLACED_EQUIPMENT',
        item: { ...item, type: 'PLACED_EQUIPMENT' },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    });

    useEffect(() => {
        preview(getEmptyImage(), { captureDraggingState: true });
    }, [preview]);

    // Connect drag source to ref
    drag(ref);

    // Calculate height based on RU
    const heightInPx = (item.equipment_templates?.ru_height || 1) * 25;

    // Determine width class
    const widthClass = (() => {
        const width = item.equipment_templates?.width;
        if (width === 'half') return 'w-1/2';
        if (width === 'third') return 'w-1/3';
        return 'w-full';
    })();

    // Determine position class based on rack_side suffix
    const positionClass = (() => {
        const side = item.rack_side || '';
        if (side.endsWith('-left')) return 'left-0';
        if (side.endsWith('-right')) return 'right-0';
        if (side.endsWith('-middle')) return 'left-1/3'; // Approximation for 1/3
        return 'left-0';
    })();

    // Helper to trigger the passed onDragStart (for custom drag layer logic if used)
    const handleDragStartInternal = (e) => {
        // If using HTML5 drag events alongside React DnD, we can pass it up
        if (onDragStart) {
             onDragStart(e, item);
        }
        setShowMenu(false);
    };

    const handleEditSave = (updates) => {
        onUpdate(item.id, updates);
        setIsEditModalOpen(false);
    };

    const toggleMenu = (e) => {
        e.stopPropagation();
        e.preventDefault(); // Prevent drag start when clicking menu
        setShowMenu(!showMenu);
    };

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = () => setShowMenu(false);
        if (showMenu) {
            window.addEventListener('click', handleClickOutside);
        }
        return () => {
            window.removeEventListener('click', handleClickOutside);
        };
    }, [showMenu]);

    // Handle double click for panel configuration
    const handleDoubleClick = (e) => {
        e.stopPropagation();
        if (isConfigurablePanel && onConfigurePanel) {
            onConfigurePanel(item);
        }
    };

    // --- Styling Construction ---
    // Base styles for the item container
    const containerStyle = {
        top: 'auto',
        bottom: `${((item.ru_position || 1) - 1) * 25}px`,
        height: `${heightInPx}px`,
        zIndex: 10,
        opacity: isDragging ? 0.5 : 1,
    };

    // Determine background color based on logic (e.g. is it a ghost item? usually passed via props if so)
    // Default to gray-700 for placed items
    const bgClass = 'bg-gray-700';
    const borderClass = 'border-gray-600';

    return (
        <>
            <div 
                ref={ref}
                className={`absolute ${widthClass} ${positionClass} ${bgClass} border ${borderClass} flex items-center justify-between px-2 cursor-grab active:cursor-grabbing group overflow-visible transition-colors hover:bg-gray-600`}
                style={containerStyle}
                draggable={true}
                onDragStart={handleDragStartInternal}
                onDoubleClick={handleDoubleClick}
                title={isConfigurablePanel ? "Double-click to configure panel" : (item.instance_name || item.equipment_templates?.model_number)}
            >
                {/* Visual Content */}
                <div className="flex items-center gap-2 overflow-hidden w-full">
                    
                    {/* Icon for Configurable Panels */}
                    {isConfigurablePanel && (
                        <div className="text-indigo-400 flex-shrink-0" title="Configurable Panel">
                            <Grid size={12} />
                        </div>
                    )}

                    {/* Has Notes Indicator */}
                    {item.has_notes && (
                        <div className="text-amber-400 flex-shrink-0">
                            <StickyNote size={12} fill="currentColor" className="opacity-80" />
                        </div>
                    )}

                    {/* Name Label */}
                    <span className="text-xs text-white font-medium truncate select-none flex-grow">
                        {item.instance_name || item.equipment_templates?.model_number || "Unknown Equipment"}
                    </span>

                    {/* Panel Child Count Indicator */}
                    {isConfigurablePanel && childCount > 0 && (
                        <span className="text-[9px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-sm ml-1 flex-shrink-0" title={`${childCount} items installed`}>
                            {childCount}
                        </span>
                    )}
                </div>

                {/* Hover Actions / Menu */}
                {/* We use group-hover to show these actions */}
                <div className={`flex items-center gap-1 absolute right-1 bg-gray-800/90 rounded px-1 py-0.5 transition-opacity duration-200 ${showMenu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    
                    {/* Quick Note Button */}
                    {onOpenNotes && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); onOpenNotes(); }}
                            className={`p-1 rounded hover:bg-gray-600 ${item.has_notes ? 'text-amber-400' : 'text-gray-400 hover:text-white'}`}
                            title="Contextual Notes"
                        >
                            <MessageSquare size={12} />
                        </button>
                    )}

                    {/* Context Menu Trigger */}
                    <div className="relative">
                        <button 
                            onClick={toggleMenu} 
                            className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-600"
                            title="Options"
                        >
                            <MoreVertical size={14} />
                        </button>
                        
                        {/* Dropdown Menu */}
                        {showMenu && (
                            <div className="absolute right-0 top-full mt-1 w-40 bg-gray-800 border border-gray-700 rounded-md shadow-xl z-50 py-1 flex flex-col">
                                
                                {/* Configure Action (Only for panels) */}
                                {isConfigurablePanel && (
                                    <button 
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            if(onConfigurePanel) onConfigurePanel(item); 
                                            setShowMenu(false); 
                                        }}
                                        className="w-full px-4 py-2 text-left text-xs text-indigo-400 hover:bg-gray-700 flex items-center gap-2 transition-colors border-b border-gray-700"
                                    >
                                        <Grid size={14} />
                                        <span>Configure Panel</span>
                                    </button>
                                )}

                                {/* Edit Action */}
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setIsEditModalOpen(true); 
                                        setShowMenu(false); 
                                    }}
                                    className="w-full px-4 py-2 text-left text-xs text-gray-200 hover:bg-gray-700 flex items-center gap-2 transition-colors"
                                >
                                    <Edit2 size={14} />
                                    <span>Edit Details</span>
                                </button>
                                
                                {/* Delete Action */}
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        onDelete(item.id); 
                                        setShowMenu(false); 
                                    }}
                                    className="w-full px-4 py-2 text-left text-xs text-red-400 hover:bg-gray-700 flex items-center gap-2 transition-colors"
                                >
                                    <Trash2 size={14} />
                                    <span>Remove</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Edit Instance Modal */}
            {isEditModalOpen && (
                <EditInstanceModal 
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    item={item}
                    onSave={handleEditSave}
                />
            )}
        </>
    );
};

// Memoize to prevent unnecessary re-renders during drag operations elsewhere
export default React.memo(PlacedEquipmentItem, (prevProps, nextProps) => {
    return (
        prevProps.item.id === nextProps.item.id &&
        prevProps.item.ru_position === nextProps.item.ru_position &&
        prevProps.item.rack_side === nextProps.item.rack_side &&
        prevProps.item.instance_name === nextProps.item.instance_name &&
        prevProps.item.has_notes === nextProps.item.has_notes &&
        // Important: check if equipment template details changed (e.g. user edited the template)
        prevProps.item.equipment_templates?.model_number === nextProps.item.equipment_templates?.model_number &&
        // Check if showMenu changed to allow menu to open/close
        // We can't easily check internal state in React.memo comparison of props, 
        // but if parent passes new props on update, it re-renders. 
        // For internal state changes like 'showMenu', the component re-renders itself anyway.
        // We just need to ensure we don't block updates from parents that matter.
        true 
    );
});