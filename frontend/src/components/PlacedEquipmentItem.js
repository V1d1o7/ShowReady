import React, { useState } from 'react';
import { Trash2, Edit, MessageSquare, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import EditInstanceModal from './EditInstanceModal';
import PanelConfigurationModal from './PanelConfigurationModal';
import ConfigureModulesModal from './ConfigureModulesModal';

const PlacedEquipmentItem = ({ item, onDelete, onDragStart, onUpdate, onOpenNotes, equipmentLibrary }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isConfigureModalOpen, setIsConfigureModalOpen] = useState(false);
    const template = item.equipment_templates || {};

    const renderPanelPreview = () => {
        if (!template.is_patch_panel || !item.children || item.children.length === 0) {
            return <span className="font-bold text-center truncate px-2 pointer-events-none">{item.instance_name}</span>;
        }

        const slots = template.slots || [];
        const assignments = item.module_assignments || {};
        
        // Create a map of slot name -> child instance
        const childrenBySlotName = {};
        Object.entries(assignments).forEach(([slotName, childId]) => {
            const child = item.children.find(c => c.id === childId);
            if (child) {
                childrenBySlotName[slotName] = child;
            }
        });

        return (
            <div className="w-full h-full flex flex-wrap items-center justify-center p-1 overflow-hidden">
                {slots.map(slot => {
                    const child = childrenBySlotName[slot.name];
                    const label = child ? (child.signal_label || child.equipment_templates?.model_number || 'Module') : slot.name;
                    const bgColor = child ? 'bg-green-500/50' : 'bg-gray-500/30';

                    return (
                        <div key={slot.id} className={`flex-grow h-full min-w-[20px] m-0.5 flex items-center justify-center rounded-sm ${bgColor}`}>
                            <span className="text-white text-[8px] font-semibold truncate px-1">{label}</span>
                        </div>
                    );
                })}
            </div>
        );
    };

    const handleDragStart = (e) => {
        const fullItem = { ...item, equipment_templates: template };
        setIsDragging(true);
        // Pass the full item object, including the nested template data
        onDragStart(e, fullItem, false); 
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

        const draggedItem = JSON.parse(draggedItemData);
        if (draggedItem.isNew && draggedItem.item.is_module) {
            // Instead of complex logic, just open the configuration modal
            setIsConfigureModalOpen(true);
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

    const isPatchPanel = template.is_patch_panel;
    // Check if it has slots, even if it's not a patch panel
    const hasSlots = template.slots && template.slots.length > 0;
    const canConfigure = isPatchPanel || hasSlots;
    
    const totalModuleCount = item.children ? item.children.length : 0;

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
                {renderPanelPreview()}
                
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
                    
                    {canConfigure && (
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
            
            {isConfigureModalOpen && (
                isPatchPanel ? (
                    <PanelConfigurationModal
                        isOpen={true}
                        onClose={() => setIsConfigureModalOpen(false)}
                        chassisInstance={item}
                        onSave={onUpdate}
                        equipmentLibrary={equipmentLibrary}
                    />
                ) : (
                    <ConfigureModulesModal
                        isOpen={true}
                        onClose={() => setIsConfigureModalOpen(false)}
                        chassisInstance={item}
                        onSave={onUpdate}
                        equipmentLibrary={equipmentLibrary}
                    />
                )
            )}
        </>
    );
};

export default PlacedEquipmentItem;