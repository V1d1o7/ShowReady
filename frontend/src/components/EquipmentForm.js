import React from 'react';
import InputField from './InputField';
import ToggleSwitch from './ToggleSwitch';
import FolderOptions from './FolderOptions';
import { Plus, Trash2 } from 'lucide-react';

const EquipmentForm = ({ formData, onFormChange, folderTree, isNew, isAdmin = false }) => {
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

    const handleSlotChange = (index, field, value) => {
        const newSlots = [...(formData.slots || [])];
        newSlots[index][field] = value;
        onFormChange({ ...formData, slots: newSlots });
    };

    const addSlot = () => {
        const newSlots = [...(formData.slots || []), { name: '' }];
        onFormChange({ ...formData, slots: newSlots });
    };

    const removeSlot = (index) => {
        const newSlots = [...(formData.slots || [])];
        newSlots.splice(index, 1);
        onFormChange({ ...formData, slots: newSlots });
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

            <div className="border-t border-gray-700 pt-4 mt-4">
                <h3 className="text-md font-bold text-white mb-2">Slots Configuration</h3>
                <div className="space-y-2">
                    {(formData.slots || []).map((slot, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <InputField
                                placeholder={`Slot ${index + 1} Name`}
                                value={slot.name}
                                onChange={(e) => handleSlotChange(index, 'name', e.target.value)}
                                className="w-1/2"
                            />
                            <InputField
                                placeholder="Accepted Module Type"
                                value={slot.accepted_module_type || ''}
                                onChange={(e) => handleSlotChange(index, 'accepted_module_type', e.target.value)}
                                className="w-1/2"
                            />
                            <button onClick={() => removeSlot(index)} className="p-2 text-gray-400 hover:text-red-500 flex-shrink-0">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
                <button onClick={addSlot} type="button" className="mt-2 flex items-center justify-center gap-2 w-full px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors text-sm">
                    <Plus size={16} /> Add Slot
                </button>
            </div>
        </>
    );
};

export default EquipmentForm;