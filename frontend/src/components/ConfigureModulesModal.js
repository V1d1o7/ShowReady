import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Select from 'react-select';
import toast from 'react-hot-toast';

const ConfigureModulesModal = ({ isOpen, onClose, chassisInstance, equipmentLibrary, onSave, droppedModule }) => {
    const [moduleAssignments, setModuleAssignments] = useState({});

    // Custom Select Styles
    const customStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: '#374151',
            borderColor: state.isFocused ? '#3B82F6' : '#4B5563',
            color: 'white',
            minHeight: '38px',
            boxShadow: 'none',
            '&:hover': { borderColor: '#6B7280' }
        }),
        menu: (base) => ({
            ...base,
            backgroundColor: '#1F2937',
            zIndex: 100
        }),
        option: (base, state) => ({
            ...base,
            backgroundColor: state.isFocused ? '#374151' : '#1F2937',
            color: 'white',
            cursor: 'pointer',
            ':active': { backgroundColor: '#4B5563' }
        }),
        singleValue: (base) => ({ ...base, color: 'white' }),
        input: (base) => ({ ...base, color: 'white' }),
        placeholder: (base) => ({ ...base, color: '#9CA3AF' })
    };

    useEffect(() => {
        const initialAssignments = chassisInstance?.module_assignments || {};
        setModuleAssignments(initialAssignments);

        // Auto-select logic for Drag & Drop
        if (droppedModule && chassisInstance?.equipment_templates?.slots) {
            const firstCompatibleEmptySlot = chassisInstance.equipment_templates.slots.find(slot => {
                const slotId = slot.id || "0";
                const isSlotEmpty = !initialAssignments[slotId];
                const acceptedType = slot.accepted_module_type;
                const moduleType = droppedModule.module_type;
                const isCompatible = !acceptedType || acceptedType === moduleType;
                return isSlotEmpty && isCompatible;
            });

            if (firstCompatibleEmptySlot) {
                const slotId = firstCompatibleEmptySlot.id || "0";
                const newAssignments = { ...initialAssignments, [slotId]: droppedModule.id };
                setModuleAssignments(newAssignments);
                toast.success(`Dropped ${droppedModule.model_number} into ${firstCompatibleEmptySlot.name}.`);
            } else {
                toast.error(`No compatible empty slot found for ${droppedModule.model_number}.`);
            }
        }
    }, [chassisInstance, droppedModule, isOpen]);

    const chassisTemplate = chassisInstance?.equipment_templates;

    // FIX: Safely filter equipmentLibrary to ensure dropdowns populate
    const getModuleOptionsForSlot = (slot) => {
        const acceptedType = slot.accepted_module_type;
        
        const compatibleModules = (equipmentLibrary || []).filter(item => {
            if (!item.is_module) return false;
            // Match type if restriction exists, otherwise allow all modules
            return !acceptedType || item.module_type === acceptedType;
        });

        const options = compatibleModules.map(mod => ({
            value: mod.id,
            label: `${mod.manufacturer} - ${mod.model_number}`
        }));
        
        return [{ value: null, label: 'Empty' }, ...options];
    };

    const handleSelectChange = (slotId, selectedOption) => {
        setModuleAssignments(prev => ({
            ...prev,
            [slotId]: selectedOption ? selectedOption.value : null,
        }));
    };

    const handleSave = () => {
        const finalAssignments = Object.entries(moduleAssignments).reduce((acc, [key, value]) => {
            if (value) acc[key] = value;
            return acc;
        }, {});
        
        onSave(chassisInstance.id, { module_assignments: finalAssignments });
        toast.success('Module configuration saved!');
        onClose();
    };

    if (!isOpen || !chassisTemplate || !chassisTemplate.slots) {
        return null;
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Configure Modules for ${chassisTemplate.model_number}`}>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
                <div className="space-y-4">
                    {chassisTemplate.slots.map((slot, index) => {
                        const slotId = slot.id || index.toString();
                        const moduleOptions = getModuleOptionsForSlot(slot);
                        const selectedValue = moduleAssignments[slotId] || null;
                        const selectedOption = moduleOptions.find(opt => opt.value == selectedValue);

                        return (
                            <div key={slotId} className="flex items-center justify-between gap-4">
                                <label className="font-bold text-white whitespace-nowrap w-1/3 text-right">
                                    {slot.name} 
                                    <span className="text-gray-400 text-xs ml-1 font-normal block">
                                        {slot.accepted_module_type ? `(${slot.accepted_module_type})` : '(Universal)'}
                                    </span>
                                </label>
                                <div className="w-2/3">
                                    <Select
                                        styles={customStyles}
                                        options={moduleOptions}
                                        value={selectedOption}
                                        onChange={option => handleSelectChange(slotId, option)}
                                        classNamePrefix="react-select"
                                        isClearable
                                        placeholder="Select a module..."
                                        menuPortalTarget={document.body} 
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-8 flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400"
                    >
                        Save
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ConfigureModulesModal;