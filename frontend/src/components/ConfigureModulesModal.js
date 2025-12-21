import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Select from 'react-select';
import toast from 'react-hot-toast';

const ConfigureModulesModal = ({ isOpen, onClose, chassisInstance, equipmentLibrary, onSave, droppedModule }) => {
    const [moduleAssignments, setModuleAssignments] = useState({});

    useEffect(() => {
        const initialAssignments = chassisInstance?.module_assignments || {};
        if (droppedModule && chassisInstance?.equipment_templates?.slots) {
            const firstCompatibleEmptySlot = chassisInstance.equipment_templates.slots.find(slot => {
                const isSlotEmpty = !initialAssignments[slot.id];
                const acceptedType = slot.accepted_module_type;
                const moduleType = droppedModule.module_type;
                const isCompatible = !acceptedType || acceptedType === moduleType;
                return isSlotEmpty && isCompatible;
            });

            if (firstCompatibleEmptySlot) {
                const newAssignments = { ...initialAssignments, [firstCompatibleEmptySlot.id]: droppedModule.id };
                setModuleAssignments(newAssignments);
                toast.success(`Dropped ${droppedModule.model_number} into ${firstCompatibleEmptySlot.name}.`);
                return;
            } else {
                toast.error(`No compatible empty slot found for ${droppedModule.model_number}.`);
            }
        }
        setModuleAssignments(initialAssignments);
    }, [chassisInstance, droppedModule, isOpen]); // Re-run when modal opens

    const chassisTemplate = chassisInstance?.equipment_templates;

    const getModuleOptionsForSlot = (slot) => {
        const acceptedType = slot.accepted_module_type;
        const compatibleModules = equipmentLibrary.filter(item => {
            if (!item.is_module) return false;
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
            if (value) {
                acc[key] = value;
            }
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
                    {chassisTemplate.slots.map(slot => {
                        const moduleOptions = getModuleOptionsForSlot(slot);
                        const selectedValue = moduleAssignments[slot.id] || null;
                        const selectedOption = moduleOptions.find(opt => opt.value === selectedValue);

                        return (
                            <div key={slot.id} className="flex items-center justify-between">
                                <label className="font-bold text-white pr-4">
                                    {slot.name} 
                                    <span className="text-gray-400 text-sm ml-2">
                                        {slot.accepted_module_type ? `(${slot.accepted_module_type})` : '(Universal)'}
                                    </span>
                                </label>
                                <div className="w-2/3">
                                    <Select
                                        options={moduleOptions}
                                        value={selectedOption}
                                        onChange={option => handleSelectChange(slot.id, option)}
                                        className="text-black"
                                        classNamePrefix="react-select"
                                        isClearable
                                        placeholder="Select a module..."
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
