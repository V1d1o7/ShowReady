import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Select from 'react-select';
import toast from 'react-hot-toast';

const ConfigureModulesModal = ({ isOpen, onClose, chassisInstance, equipmentLibrary, onSave }) => {
    const [moduleAssignments, setModuleAssignments] = useState({});

    useEffect(() => {
        // Initialize state from the instance's current assignments
        if (chassisInstance?.module_assignments) {
            setModuleAssignments(chassisInstance.module_assignments);
        } else {
            setModuleAssignments({});
        }
    }, [chassisInstance]);

    const chassisTemplate = chassisInstance?.equipment_templates;

    const moduleOptions = React.useMemo(() => {
        const modules = equipmentLibrary.filter(item => item.is_module);
        const options = modules.map(mod => ({
            value: mod.id,
            label: `${mod.manufacturer} - ${mod.model_number}`
        }));
        // Add an "Empty" option to the top of the list
        return [{ value: null, label: 'Empty' }, ...options];
    }, [equipmentLibrary]);

    const handleSelectChange = (slotId, selectedOption) => {
        setModuleAssignments(prev => ({
            ...prev,
            [slotId]: selectedOption ? selectedOption.value : null,
        }));
    };

    const handleSave = () => {
        // Filter out any null/empty slots before saving
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
                        const selectedValue = moduleAssignments[slot.id] || null;
                        const selectedOption = moduleOptions.find(opt => opt.value === selectedValue);

                        return (
                            <div key={slot.id} className="flex items-center justify-between">
                                <label className="font-bold text-white pr-4">{slot.name}</label>
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
