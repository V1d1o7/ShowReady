import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Trash2, Maximize2, GripVertical, Info } from 'lucide-react';
import { api } from '../api/api';
import toast from 'react-hot-toast';

// --- Visual Components for Connectors ---

// Generic Connector Icons (since no SVGs provided yet)
const ConnectorIcon = ({ type, label, size = 40, color = '#cbd5e1' }) => {
    // Basic visualization based on type hint
    const isXLR = type?.toLowerCase().includes('xlr');
    const isEthercon = type?.toLowerCase().includes('ether') || type?.toLowerCase().includes('rj45');
    const isBNC = type?.toLowerCase().includes('bnc');

    return (
        <div className="flex flex-col items-center justify-center" style={{ width: size, height: size }}>
            <div 
                className="relative flex items-center justify-center rounded-full border-2 bg-gray-800"
                style={{ 
                    width: size, 
                    height: size, 
                    borderColor: color,
                    color: color
                }}
            >
                {/* Visual Details */}
                {isXLR && (
                    <div className="flex gap-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                        <div className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                        <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                    </div>
                )}
                {isEthercon && (
                    <div className="w-1/2 h-1/2 border border-current rounded-sm opacity-70" />
                )}
                {isBNC && (
                    <div className="w-1/2 h-1/2 rounded-full border border-current opacity-70 flex items-center justify-center">
                        <div className="w-1 h-1 bg-current rounded-full" />
                    </div>
                )}
                {!isXLR && !isEthercon && !isBNC && (
                    <span className="text-[8px] font-bold uppercase truncate max-w-full px-1">{label?.substring(0,3)}</span>
                )}
                
                {/* Screw Holes (Visual flair) */}
                <div className="absolute -left-1 top-1/2 w-1 h-1 bg-gray-600 rounded-full" />
                <div className="absolute -right-1 top-1/2 w-1 h-1 bg-gray-600 rounded-full" />
            </div>
        </div>
    );
};

// --- Main Modal ---

const PanelBuilderModal = ({ isOpen, onClose, rackItem, onUpdate }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [children, setChildren] = useState([]);
    const [library, setLibrary] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('connectors'); // 'connectors' or 'modules'
    
    // Drag state
    const [draggedItem, setDraggedItem] = useState(null);

    // --- Data Fetching ---
    
    useEffect(() => {
        if (isOpen && rackItem) {
            fetchPanelData();
        }
    }, [isOpen, rackItem]);

    const fetchPanelData = async () => {
        setIsLoading(true);
        try {
            const [fetchedLibrary, fetchedChildren] = await Promise.all([
                api.getLibrary(),
                api.getEquipmentChildren(rackItem.id)
            ]);
            
            // Flatten library and filter for connectors/modules
            const allEquipment = fetchedLibrary.equipment || [];
            setLibrary(allEquipment);
            setChildren(fetchedChildren || []);
        } catch (error) {
            console.error("Error fetching panel data:", error);
            toast.error("Failed to load panel details");
        } finally {
            setIsLoading(false);
        }
    };

    // --- Filtering Library ---
    
    const filteredLibrary = useMemo(() => {
        return library.filter(item => {
            const matchesSearch = item.model_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                  item.manufacturer.toLowerCase().includes(searchQuery.toLowerCase());
            
            if (activeTab === 'connectors') {
                return matchesSearch && item.is_connector;
            } else {
                return matchesSearch && item.is_module;
            }
        });
    }, [library, searchQuery, activeTab]);

    // --- Drag & Drop Handlers ---

    const handleDragStart = (e, item) => {
        e.dataTransfer.setData('application/json', JSON.stringify(item));
        setDraggedItem(item);
    };

    const handleDrop = async (e, slotId) => {
        e.preventDefault();
        const item = draggedItem; // Or parse from dataTransfer if needed
        
        if (!item) return;

        // Check if slot is occupied
        const isOccupied = children.some(c => c.parent_slot_id === slotId);
        if (isOccupied) {
            toast.error("Slot is already occupied");
            return;
        }

        try {
            // Optimistic Update
            const tempId = `temp-${Date.now()}`;
            const optimisticChild = {
                id: tempId,
                instance_name: item.model_number,
                parent_slot_id: slotId,
                equipment_templates: item,
                parent_item_id: rackItem.id
            };
            setChildren(prev => [...prev, optimisticChild]);

            // API Call
            const newChild = await api.addEquipmentToRack(rackItem.rack_id, {
                template_id: item.id,
                instance_name: item.model_number,
                parent_item_id: rackItem.id,
                parent_slot_id: slotId,
                rack_side: rackItem.rack_side,
                ru_position: 0 // Irrelevant for children
            });

            // Replace temp with real
            setChildren(prev => prev.map(c => c.id === tempId ? newChild : c));
            toast.success("Added to panel");
            if (onUpdate) onUpdate(); // Notify parent to refresh if needed
            
        } catch (error) {
            console.error("Drop failed:", error);
            toast.error("Failed to add connector");
            setChildren(prev => prev.filter(c => !c.id.startsWith('temp')));
        } finally {
            setDraggedItem(null);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleRemoveChild = async (childId) => {
        try {
            await api.deleteEquipmentFromRack(childId);
            setChildren(prev => prev.filter(c => c.id !== childId));
            toast.success("Removed");
            if (onUpdate) onUpdate();
        } catch (error) {
            console.error("Remove failed:", error);
            toast.error("Failed to remove item");
        }
    };

    // --- Render Logic ---

    if (!isOpen || !rackItem) return null;

    const template = rackItem.equipment_templates;
    // Fallback slots if none defined in DB (Phase 1 convenience)
    const slots = template.slots && template.slots.length > 0 
        ? template.slots 
        : (template.model_number.includes('16') 
            ? Array.from({length: 16}, (_, i) => ({ name: `${i+1}`, id: `hole-${i+1}` })) 
            : Array.from({length: 5}, (_, i) => ({ name: `Bay ${i+1}`, id: `bay-${i+1}` })) // Default UCP assumption
          );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-gray-900 w-[95vw] h-[90vh] rounded-xl border border-gray-700 shadow-2xl flex flex-col overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-900/50 rounded-lg text-indigo-400">
                            <Maximize2 size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Panel Builder</h2>
                            <p className="text-sm text-gray-400">{rackItem.instance_name} ({template.manufacturer} {template.model_number})</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex flex-grow overflow-hidden">
                    
                    {/* Left Sidebar: Library */}
                    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
                        <div className="p-4 border-b border-gray-700">
                            <div className="flex gap-2 mb-4 bg-gray-700 p-1 rounded-lg">
                                <button 
                                    onClick={() => setActiveTab('connectors')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${activeTab === 'connectors' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Connectors
                                </button>
                                <button 
                                    onClick={() => setActiveTab('modules')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${activeTab === 'modules' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Modules
                                </button>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Search library..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-gray-900 text-white pl-9 pr-4 py-2 rounded-lg text-sm border border-gray-700 focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        </div>
                        <div className="flex-grow overflow-y-auto p-2 space-y-2">
                            {filteredLibrary.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 text-sm">
                                    No items found. Create items with "Is Connector" or "Is Module" checked in the Equipment Library.
                                </div>
                            ) : (
                                filteredLibrary.map(item => (
                                    <div 
                                        key={item.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, item)}
                                        className="flex items-center gap-3 p-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg cursor-grab active:cursor-grabbing border border-transparent hover:border-gray-600 transition-all group"
                                    >
                                        <GripVertical size={16} className="text-gray-500" />
                                        <ConnectorIcon type={item.model_number} label={item.model_number} size={32} />
                                        <div className="flex-grow min-w-0">
                                            <div className="font-medium text-gray-200 truncate">{item.model_number}</div>
                                            <div className="text-xs text-gray-500 truncate">{item.manufacturer}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Main Stage: The Panel */}
                    <div className="flex-grow bg-[#1a1d24] relative flex flex-col items-center justify-center p-12 overflow-auto">
                        
                        {/* Panel Visualization Container */}
                        <div className="relative bg-gray-800 rounded-lg shadow-2xl border border-gray-700"
                             style={{ 
                                 width: '100%', 
                                 maxWidth: '1200px', 
                                 // Aspect Ratio for 19" rack. 1U is approx 1.75". 19/1.75 ~= 10.8
                                 aspectRatio: template.ru_height === 1 ? '10.8 / 1' : `10.8 / ${template.ru_height}`,
                                 minHeight: template.ru_height * 100 // Minimum visual height
                             }}
                        >
                            {/* Mounting Ears (Visual) */}
                            <div className="absolute top-0 bottom-0 left-0 w-8 border-r border-gray-700 bg-gray-700/30 flex flex-col justify-between py-2 items-center">
                                <div className="w-3 h-2 rounded-full bg-black/50" />
                                <div className="w-3 h-2 rounded-full bg-black/50" />
                            </div>
                            <div className="absolute top-0 bottom-0 right-0 w-8 border-l border-gray-700 bg-gray-700/30 flex flex-col justify-between py-2 items-center">
                                <div className="w-3 h-2 rounded-full bg-black/50" />
                                <div className="w-3 h-2 rounded-full bg-black/50" />
                            </div>

                            {/* The Faceplate */}
                            <div className="absolute inset-y-0 left-8 right-8 flex items-center justify-evenly px-4">
                                {slots.map((slot, index) => {
                                    // Is there something in this slot?
                                    const occupant = children.find(c => c.parent_slot_id === slot.name || c.parent_slot_id === slot.id);
                                    const slotLabel = slot.name || `${index + 1}`;
                                    
                                    return (
                                        <div 
                                            key={index}
                                            className={`
                                                relative flex flex-col items-center justify-center transition-all duration-200
                                                ${occupant ? '' : 'border-2 border-dashed border-gray-700 hover:border-indigo-500 hover:bg-gray-800/50'}
                                            `}
                                            style={{
                                                // If UCP (wide slots), give them width. If D-Series (holes), give them fixed size
                                                width: template.model_number.includes('16') ? '50px' : '18%', 
                                                height: template.model_number.includes('16') ? '60px' : '80%',
                                                borderRadius: '4px'
                                            }}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDrop(e, slotLabel)}
                                        >
                                            {occupant ? (
                                                <div className="group relative w-full h-full flex items-center justify-center">
                                                    {/* Render Occupant */}
                                                    <ConnectorIcon 
                                                        type={occupant.equipment_templates?.model_number} 
                                                        label={occupant.instance_name} 
                                                        size={template.model_number.includes('16') ? 40 : 60} 
                                                    />
                                                    
                                                    {/* Hover Actions */}
                                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                                        {occupant.instance_name}
                                                    </div>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleRemoveChild(occupant.id); }}
                                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ) : (
                                                // Empty Slot Visual
                                                <span className="text-gray-700 text-xs font-mono font-bold select-none pointer-events-none">
                                                    {slotLabel}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Helper Text */}
                        <div className="mt-8 flex items-center gap-2 text-gray-500 text-sm bg-gray-800/50 px-4 py-2 rounded-full border border-gray-700">
                            <Info size={16} />
                            <span>Drag connectors or modules from the library onto the open slots.</span>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default PanelBuilderModal;