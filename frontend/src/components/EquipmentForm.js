import React, { useState } from 'react';
import InputField from './InputField';
import ToggleSwitch from './ToggleSwitch';
import FolderOptions from './FolderOptions';
import Modal from './Modal';
import { Plus, Trash2, List, CheckSquare, Square, Edit, Copy } from 'lucide-react';
import { generateLabels } from '../utils/patternHelper';

const EquipmentForm = ({ formData, onFormChange, folderTree, isNew, isAdmin = false }) => {
    const [selectedSlotIds, setSelectedSlotIds] = useState([]);
    
    // Slot Modals state
    const [isSlotRangeModalOpen, setIsSlotRangeModalOpen] = useState(false);
    const [slotRangeData, setSlotRangeData] = useState({ pattern: '', start: 1, count: 1, accepted_module_type: '' });

    const [isSlotBulkModalOpen, setIsSlotBulkModalOpen] = useState(false);
    const [slotBulkData, setSlotBulkData] = useState({ pattern: '', start: 1, accepted_module_type: '' });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        const newValue = type === 'checkbox' ? checked : value;

        const newFormData = { ...formData, [name]: newValue };

        // If 'is_module' is being toggled, adjust other fields
        if (name === 'is_module') {
            if (newValue) {
                // When it IS a module, it has no dimensions
                newFormData.ru_height = 0;
                newFormData.width = 'full'; // Default non-visual width
            } else {
                // When it is NOT a module, reset to a sensible default
                newFormData.ru_height = 1;
            }
        }

        onFormChange(newFormData);
    };

    const slots = formData.slots || [];

    const handleSlotChange = (id, field, value) => {
        const newSlots = slots.map(s => s.id === id ? { ...s, [field]: value } : s);
        onFormChange({ ...formData, slots: newSlots });
    };

    const addSlot = () => {
        // FIX: Ensure every slot has a unique ID so drag-and-drop works in Panel Builder!
        const newSlots = [...slots, { id: crypto.randomUUID(), name: '', accepted_module_type: '' }];
        onFormChange({ ...formData, slots: newSlots });
    };

    const toggleSlotSelection = (id) => {
        setSelectedSlotIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
    };

    const toggleAllSlots = () => {
        if (selectedSlotIds.length === slots.length && slots.length > 0) {
            setSelectedSlotIds([]);
        } else {
            setSelectedSlotIds(slots.map(s => s.id));
        }
    };

    const handleDeleteSelectedSlots = () => {
        onFormChange({ ...formData, slots: slots.filter(s => !selectedSlotIds.includes(s.id)) });
        setSelectedSlotIds([]);
    };

    const handleDuplicateSelectedSlots = () => {
        const toDuplicate = slots.filter(s => selectedSlotIds.includes(s.id));
        const newSlots = toDuplicate.map(s => ({
            ...s,
            id: crypto.randomUUID(),
            name: `${s.name} (Copy)`
        }));
        onFormChange({ ...formData, slots: [...slots, ...newSlots] });
    };

    const handleAddSlotRange = (e) => {
        e.preventDefault();
        const labels = generateLabels(slotRangeData.pattern, slotRangeData.start, slotRangeData.count);
        const newSlots = labels.map(label => ({
            id: crypto.randomUUID(),
            name: label,
            accepted_module_type: slotRangeData.accepted_module_type
        }));
        onFormChange({ ...formData, slots: [...slots, ...newSlots] });
        setIsSlotRangeModalOpen(false);
        setSlotRangeData({ pattern: '', start: 1, count: 1, accepted_module_type: '' });
    };

    const handleBulkEditSlots = (e) => {
        e.preventDefault();
        let newLabels = [];
        if (slotBulkData.pattern) {
            newLabels = generateLabels(slotBulkData.pattern, slotBulkData.start, selectedSlotIds.length);
        }

        let labelIndex = 0;
        const updatedSlots = slots.map(s => {
            if (selectedSlotIds.includes(s.id)) {
                return {
                    ...s,
                    name: slotBulkData.pattern ? newLabels[labelIndex++] : s.name,
                    accepted_module_type: slotBulkData.accepted_module_type !== '' ? slotBulkData.accepted_module_type : s.accepted_module_type
                };
            }
            return s;
        });

        onFormChange({ ...formData, slots: updatedSlots });
        setIsSlotBulkModalOpen(false);
        setSelectedSlotIds([]);
        setSlotBulkData({ pattern: '', start: 1, accepted_module_type: '' });
    };

    return (
        <>
            <InputField label="Model Number" name="model_number" value={formData.model_number} onChange={handleChange} required autoFocus />
            <InputField label="Manufacturer" name="manufacturer" value={formData.manufacturer} onChange={handleChange} required />

            {formData.is_module ? (
                <InputField label="Module Type" name="module_type" value={formData.module_type || ''} onChange={handleChange} placeholder="e.g., vfc_card" />
            ) : (
                <>
                    <div className="grid grid-cols-3 gap-4">
                        <InputField label="RU Height" name="ru_height" type="number" min="0" value={formData.ru_height} onChange={handleChange} required />
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">Width</label>
                            <select name="width" value={formData.width} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                                <option value="full">Full</option>
                                <option value="half">Half</option>
                                <option value="third">Third</option>
                            </select>
                        </div>
                        <InputField label="Depth (in)" name="depth" type="number" min="0" step="0.01" value={formData.depth || ''} onChange={handleChange} />
                    </div>
                    {/* Power Consumption Row */}
                    <div className="mt-4">
                        <InputField 
                            label="Power Consumption (Watts)" 
                            name="power_consumption_watts" 
                            type="number" 
                            min="0" 
                            value={formData.power_consumption_watts || 0} 
                            onChange={handleChange} 
                        />
                    </div>
                </>
            )}
            
            <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="flex items-center justify-between">
                    <label htmlFor="has_ip_address" className="block text-sm font-medium text-gray-300">
                        Device is IP Addressable
                    </label>
                    <ToggleSwitch
                        id="has_ip_address"
                        name="has_ip_address"
                        checked={formData.has_ip_address}
                        onChange={handleChange}
                    />
                </div>
                <div className="flex items-center justify-between">
                    <label htmlFor="is_module" className="block text-sm font-medium text-gray-300">
                        Is this a Module?
                    </label>
                    <ToggleSwitch
                        id="is_module"
                        name="is_module"
                        checked={formData.is_module}
                        onChange={handleChange}
                    />
                </div>
                {/* Adapter Toggle */}
                <div className="flex items-center justify-between">
                    <label htmlFor="is_adapter" className="block text-sm font-medium text-gray-300">
                        Is this an Adapter?
                    </label>
                    <ToggleSwitch
                        id="is_adapter"
                        name="is_adapter"
                        checked={formData.is_adapter}
                        onChange={handleChange}
                    />
                </div>
                {/* Has Slots / Modules Toggle */}
                <div className="flex items-center justify-between">
                    <label htmlFor="has_slots" className="block text-sm font-medium text-gray-300">
                        Has Slots / Modules
                    </label>
                    <ToggleSwitch
                        id="has_slots"
                        name="has_slots"
                        checked={formData.has_slots} 
                        onChange={(e) => onFormChange({ ...formData, has_slots: e.target.checked })}
                    />
                </div>
                {/* Is Patch Panel Toggle */}
                <div className="flex items-center justify-between">
                    <label htmlFor="is_patch_panel" className="block text-sm font-medium text-gray-300">
                        Is this a Patch Panel?
                    </label>
                    <ToggleSwitch
                        id="is_patch_panel"
                        name="is_patch_panel"
                        checked={formData.is_patch_panel}
                        onChange={handleChange}
                    />
                </div>
            </div>

            {folderTree && (
                <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Parent Folder (Optional)</label>
                    <select name="folder_id" value={formData.folder_id} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                        <option value="">None (Root Level)</option>
                        <FolderOptions folders={folderTree} />
                    </select>
                </div>
            )}

            {formData.has_slots && (
                <div className="border-t border-gray-700 pt-4 mt-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-md font-bold text-white">Slots Configuration</h3>
                        <div className="flex gap-2">
                            <button type="button" onClick={addSlot} className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white">
                                <Plus size={14} /> Add Slot
                            </button>
                            <button type="button" onClick={() => setIsSlotRangeModalOpen(true)} className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white">
                                <List size={14} /> Add Range
                            </button>
                        </div>
                    </div>

                    {slots.length > 0 && (
                        <div className="flex items-center gap-2 mb-2 p-2 bg-gray-800 rounded border border-gray-700">
                            <button type="button" onClick={toggleAllSlots} className="p-1 text-gray-400 hover:text-white">
                                {selectedSlotIds.length === slots.length ? <CheckSquare size={16} /> : <Square size={16} />}
                            </button>
                            <span className="text-xs text-gray-400 font-bold">{selectedSlotIds.length} Selected</span>
                            
                            {selectedSlotIds.length > 0 && (
                                <div className="flex gap-2 ml-auto">
                                    <button type="button" onClick={() => setIsSlotBulkModalOpen(true)} className="text-gray-400 hover:text-blue-400" title="Bulk Edit">
                                        <Edit size={16} />
                                    </button>
                                    <button type="button" onClick={handleDuplicateSelectedSlots} className="text-gray-400 hover:text-green-400" title="Duplicate">
                                        <Copy size={16} />
                                    </button>
                                    <button type="button" onClick={handleDeleteSelectedSlots} className="text-gray-400 hover:text-red-400" title="Delete">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {slots.map((slot) => (
                            <div key={slot.id} className={`flex items-center gap-2 p-2 rounded border ${selectedSlotIds.includes(slot.id) ? 'bg-gray-700 border-amber-500' : 'bg-gray-800 border-gray-700'}`}>
                                <button type="button" onClick={() => toggleSlotSelection(slot.id)} className="text-gray-400 hover:text-white flex-shrink-0">
                                    {selectedSlotIds.includes(slot.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                                </button>
                                <div className="grid grid-cols-2 gap-2 flex-1">
                                    <InputField
                                        placeholder="Slot Name"
                                        value={slot.name}
                                        onChange={(e) => handleSlotChange(slot.id, 'name', e.target.value)}
                                    />
                                    <InputField
                                        placeholder="Accepted Module Type"
                                        value={slot.accepted_module_type || ''}
                                        onChange={(e) => handleSlotChange(slot.id, 'accepted_module_type', e.target.value)}
                                    />
                                </div>
                                <button type="button" onClick={() => {
                                    onFormChange({ ...formData, slots: slots.filter(s => s.id !== slot.id) });
                                }} className="p-2 text-gray-400 hover:text-red-500 flex-shrink-0">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Slot Range Modal */}
            {isSlotRangeModalOpen && (
                <Modal isOpen={isSlotRangeModalOpen} onClose={() => setIsSlotRangeModalOpen(false)} title="Add Slot Range" maxWidth="max-w-md">
                    <form onSubmit={handleAddSlotRange} className="p-4 space-y-4">
                        <InputField label="Pattern (use {n}, {nn}, {a}, {A})" value={slotRangeData.pattern} onChange={(e) => setSlotRangeData({...slotRangeData, pattern: e.target.value})} placeholder="e.g. VFC Slot {A}" required />
                        <div className="grid grid-cols-2 gap-4">
                            <InputField label="Start From" type="number" value={slotRangeData.start} onChange={(e) => setSlotRangeData({...slotRangeData, start: parseInt(e.target.value, 10)})} required />
                            <InputField label="Count" type="number" min="1" value={slotRangeData.count} onChange={(e) => setSlotRangeData({...slotRangeData, count: parseInt(e.target.value, 10)})} required />
                        </div>
                        <InputField label="Accepted Module Type (optional)" value={slotRangeData.accepted_module_type} onChange={(e) => setSlotRangeData({...slotRangeData, accepted_module_type: e.target.value})} placeholder="e.g., vfc_card" />
                        
                        <div className="flex justify-end gap-2 pt-4">
                            <button type="button" onClick={() => setIsSlotRangeModalOpen(false)} className="px-4 py-2 bg-gray-700 rounded text-white font-bold">Cancel</button>
                            <button type="submit" className="px-4 py-2 bg-amber-500 rounded text-black font-bold">Generate Range</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Bulk Edit Slots Modal */}
            {isSlotBulkModalOpen && (
                <Modal isOpen={isSlotBulkModalOpen} onClose={() => setIsSlotBulkModalOpen(false)} title={`Bulk Edit ${selectedSlotIds.length} Slots`} maxWidth="max-w-md">
                    <form onSubmit={handleBulkEditSlots} className="p-4 space-y-4">
                        <p className="text-xs text-gray-400">Leave fields blank to keep existing values.</p>
                        <InputField label="New Pattern (use {n}, {nn}, {a}, {A})" value={slotBulkData.pattern} onChange={(e) => setSlotBulkData({...slotBulkData, pattern: e.target.value})} placeholder="e.g. Bay {nn}" />
                        {slotBulkData.pattern && (
                            <InputField label="Start Number/Letter" type="number" value={slotBulkData.start} onChange={(e) => setSlotBulkData({...slotBulkData, start: parseInt(e.target.value, 10)})} />
                        )}
                        <InputField label="New Accepted Module Type" value={slotBulkData.accepted_module_type} onChange={(e) => setSlotBulkData({...slotBulkData, accepted_module_type: e.target.value})} />
                        
                        <div className="flex justify-end gap-2 pt-4">
                            <button type="button" onClick={() => setIsSlotBulkModalOpen(false)} className="px-4 py-2 bg-gray-700 rounded text-white font-bold">Cancel</button>
                            <button type="submit" className="px-4 py-2 bg-amber-500 rounded text-black font-bold">Apply Edit</button>
                        </div>
                    </form>
                </Modal>
            )}
        </>
    );
};

export default EquipmentForm;