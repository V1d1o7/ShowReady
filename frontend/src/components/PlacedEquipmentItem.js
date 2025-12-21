import React, { useState } from 'react';
import { Trash2, Edit, MessageSquare, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import EditInstanceModal from './EditInstanceModal';
import ConfigureModulesModal from './ConfigureModulesModal';

const PlacedEquipmentItem = ({ item, onDelete, onDragStart, onUpdate, onOpenNotes, equipmentLibrary }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isConfigureModalOpen, setIsConfigureModalOpen] = useState(false);
    const template = item.equipment_templates || {};

    // --- Helpers for Recursive Data ---
    const getAssignmentId = (val) => (val && typeof val === 'object' ? val.id : val);
    const getSubAssignments = (val) => (val && typeof val === 'object' && val.assignments ? val.assignments : {});
    
    // Recursive Count for Badge
    const countModules = (assignments) => {
        if (!assignments) return 0;
        let count = 0;
        Object.values(assignments).forEach(val => {
            if (!val) return;
            count++; 
            if (typeof val === 'object' && val.assignments) {
                count += countModules(val.assignments);
            }
        });
        return count;
    };

    // Recursive Tooltip Renderer
    const renderTooltipTree = (slots, assignments, depth = 0) => {
        return slots.map((slot, index) => {
            const slotId = slot.id || index.toString();
            const val = assignments[slotId];
            const modId = getAssignmentId(val);
            const module = modId ? equipmentLibrary.find(e => e.id == modId) : null;

            if (!module) return null;

            return (
                <div key={slotId} className="flex flex-col">
                    <div className="flex justify-between text-[10px] text-white drop-shadow-md" style={{ paddingLeft: `${depth * 8}px` }}>
                        <span className="text-gray-200">
                            {depth > 0 && '↳ '}{slot.name}:
                        </span>
                        <span className="text-amber-400 font-medium ml-2">{module.model_number}</span>
                    </div>
                    {/* Recurse if module has slots */}
                    {module.slots && module.slots.length > 0 && (
                        renderTooltipTree(module.slots, getSubAssignments(val), depth + 1)
                    )}
                </div>
            );
        });
    };

    // --- RECURSIVE SLOT FINDER ---
    // Returns an array of IDs representing the path: ['Slot1', 'SubSlotA']
    const findBestSlotPath = (currentTemplate, currentAssignments, droppedType) => {
        if (!currentTemplate || !currentTemplate.slots) return null;

        // 1. Priority: Check current level for ANY empty, compatible slot
        for (const slot of currentTemplate.slots) {
            const slotId = slot.id || slot.name; // Fallback
            const assignment = currentAssignments[slotId];

            if (!assignment) {
                // Empty slot! Check type compatibility
                const isCompatible = !slot.accepted_module_type || slot.accepted_module_type === droppedType;
                if (isCompatible) return [slotId];
            }
        }

        // 2. Secondary: Dive into occupied slots to see if THEY have room
        for (const slot of currentTemplate.slots) {
            const slotId = slot.id || slot.name;
            const assignment = currentAssignments[slotId];

            if (assignment) {
                const moduleId = getAssignmentId(assignment);
                const moduleTemplate = equipmentLibrary.find(e => e.id == moduleId);
                
                if (moduleTemplate && moduleTemplate.slots) {
                    const subAssignments = getSubAssignments(assignment);
                    const subPath = findBestSlotPath(moduleTemplate, subAssignments, droppedType);
                    
                    if (subPath) {
                        return [slotId, ...subPath]; // Prepend current slot to path
                    }
                }
            }
        }
        return null;
    };

    // --- RECURSIVE STATE BUILDER ---
    // Reconstructs the assignments object with the new item inserted at the deep path
    const buildAssignmentsWithPath = (currentAssignments, path, newModuleId) => {
        const [head, ...tail] = path;
        
        // Base case: We are at the target slot
        if (tail.length === 0) {
            return {
                ...currentAssignments,
                [head]: { id: newModuleId, assignments: {} }
            };
        }

        // Recursive step: Traverse down
        const existingSlotData = currentAssignments[head];
        const existingId = getAssignmentId(existingSlotData);
        const existingSubs = getSubAssignments(existingSlotData);

        return {
            ...currentAssignments,
            [head]: {
                id: existingId, // Keep the parent module
                assignments: buildAssignmentsWithPath(existingSubs, tail, newModuleId) // Recurse
            }
        };
    };

    const handleDragStart = (e) => {
        setIsDragging(true);
        onDragStart(e, item, false); 
    };

    const handleDragEnd = () => setIsDragging(false);
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };

    const handleUpdate = (updatedData) => {
        onUpdate(item.id, updatedData);
        setIsEditModalOpen(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedItemData = e.dataTransfer.getData('application/json');
        
        if (!draggedItemData) return;

        try {
            const draggedItem = JSON.parse(draggedItemData);
            
            if (draggedItem.isNew && draggedItem.item.is_module) {
                const currentAssignments = item.module_assignments || {};
                
                // --- NEW RECURSIVE LOGIC ---
                const path = findBestSlotPath(template, currentAssignments, draggedItem.item.module_type);

                if (path) {
                    const newAssignments = buildAssignmentsWithPath(currentAssignments, path, draggedItem.item.id);
                    
                    handleUpdate({ module_assignments: newAssignments });
                    toast.success(`Installed ${draggedItem.item.model_number} into ${path.length > 1 ? 'nested slot' : 'slot'}.`);
                } else {
                    toast.error(`No compatible, empty slots available (checked chassis and all sub-modules).`);
                }
            }
        } catch (error) {
            console.error("Failed to parse dragged item data:", error);
        }
    };

    const bottomPosition = (item.ru_position - 1) * 25;
    const itemHeight = (template.ru_height || 1) * 25;
    
    const widthClass = template.width === 'half' ? 'w-1/2' : template.width === 'third' ? 'w-1/3' : 'w-full';
    
    const positionClass = (() => {
        if (!item.rack_side) return 'left-0';
        if (item.rack_side.endsWith('-right')) return template.width === 'third' ? 'left-2/3' : 'left-1/2';
        if (item.rack_side.endsWith('-middle')) return 'left-1/3';
        return 'left-0';
    })();

    const hasSlots = template.slots && template.slots.length > 0;
    const assignments = item.module_assignments || {};
    const totalModuleCount = countModules(assignments);

    return (
        <>
            <div
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`
                    absolute ${widthClass} ${positionClass} bg-blue-500/30 border border-blue-400
                    rounded-sm text-white text-xs flex flex-col items-center justify-center
                    p-1 cursor-grab group transition-opacity
                    ${isDragging ? 'opacity-0' : 'opacity-100'}
                `}
                style={{ height: `${itemHeight}px`, bottom: `${bottomPosition}px`, zIndex: 20 }}
            >
                {/* TOOLTIP: Recursive list of modules */}
                {hasSlots && totalModuleCount > 0 && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-56 bg-gray-900 border border-gray-600 rounded shadow-xl p-2 hidden group-hover:block z-50 pointer-events-none">
                        <div className="text-[10px] text-gray-300 mb-1 border-b border-gray-500/50 pb-1 font-bold shadow-sm">Installed Modules</div>
                        {renderTooltipTree(template.slots, assignments)}
                    </div>
                )}

                <span className="font-bold text-center truncate px-2 pointer-events-none">{item.instance_name}</span>
                
                {/* ACTION BAR (Transparent) */}
                <div className="flex items-center absolute right-1 top-1/2 -translate-y-1/2 bg-transparent rounded px-1 z-30">
                    {onOpenNotes && (
                        <div className="relative">
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenNotes(); }}
                                className="p-1 text-gray-300 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <MessageSquare size={14} />
                            </button>
                            {item.has_notes && <div className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></div>}
                        </div>
                    )}
                    
                    {hasSlots && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsConfigureModalOpen(true); }}
                            className={`p-1 transition-opacity opacity-0 group-hover:opacity-100 relative ${totalModuleCount > 0 ? 'text-green-400' : 'text-gray-300 hover:text-green-400'}`}
                        >
                            <Settings size={14} />
                            {totalModuleCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-green-500 text-black text-[9px] font-bold h-3.5 w-3.5 flex items-center justify-center rounded-full shadow-sm">
                                    {totalModuleCount}
                                </span>
                            )}
                        </button>
                    )}

                    <button onClick={(e) => { e.stopPropagation(); setIsEditModalOpen(true); }} className="p-1 text-gray-300 hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Edit size={14} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="p-1 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
            
            <EditInstanceModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} onSubmit={handleUpdate} item={item} />
            
            {hasSlots && (
                <ConfigureModulesModal
                    isOpen={isConfigureModalOpen}
                    onClose={() => setIsConfigureModalOpen(false)}
                    chassisInstance={item}
                    equipmentLibrary={equipmentLibrary}
                    onSave={onUpdate}
                />
            )}
        </>
    );
};

export default PlacedEquipmentItem;