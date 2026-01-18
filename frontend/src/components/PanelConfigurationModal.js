import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Select from 'react-select';
import toast from 'react-hot-toast';
import { api } from '../api/api';

// --- Helper: Normalize assignment data ---
const getAssignmentId = (val) => (val && typeof val === 'object' ? val.id : val);
const getSubAssignments = (val) => (val && typeof val === 'object' && val.assignments ? val.assignments : {});

// --- Recursive Row Component ---
const SlotRow = ({ slot, currentAssignment, moduleInstance, onAssignmentChange, onSignalLabelChange, equipmentLibrary, depth = 0 }) => {
    // 1. Identify what is currently in this slot
    const assignedId = getAssignmentId(currentAssignment);
    
    // FIX: Restored the definition of assignedModule that I accidentally deleted
    const assignedModule = assignedId ? equipmentLibrary.find(e => e.id === assignedId) : null;
    
    // 2. Filter options for this specific slot (Case-insensitive & Safe)
    const getOptions = () => {
        const acceptedType = slot.accepted_module_type;
        
        const compatible = (equipmentLibrary || []).filter(item => {
            // Loose check for is_module (handles 1, true, "true") or ru_height 0 fallback
            const isModule = item.is_module === true || item.is_module === 'true' || item.is_module === 1 || item.ru_height === 0;
            
            if (!isModule) {
                return false;
            }
            
            // If no restriction on the slot, allow all modules
            if (!acceptedType) return true;
            
            // Normalize strings for comparison (case-insensitive)
            const itemType = (item.module_type || "").toLowerCase().trim();
            const slotType = (acceptedType || "").toLowerCase().trim();
            
            return itemType === slotType;
        });

        const options = compatible.map(mod => ({
            value: mod.id,
            label: `${mod.manufacturer} - ${mod.model_number}`
        }));

        return [{ value: null, label: 'Empty' }, ...options];
    };

    const options = getOptions();
    // Loose check for value (handles string vs number ID mismatch)
    const selectedOption = options.find(opt => opt.value === assignedId);

    // 3. Handle change
    const handleSelect = (option) => {
        const newModuleId = option ? option.value : null;

        // If a module is being removed
        if (!newModuleId) {
            onAssignmentChange(null);
            return;
        }

        // If a new module is selected
        if (assignedId !== newModuleId) {
            onAssignmentChange(newModuleId);
        }
    };

    // 4. Handle sub-slot changes (Recursion logic)
    const handleSubChange = (subSlotId, subValue) => {
        const currentId = getAssignmentId(currentAssignment);
        const currentSub = getSubAssignments(currentAssignment);
        
        const newAssignment = {
            id: currentId,
            assignments: {
                ...currentSub,
                [subSlotId]: subValue
            }
        };
        onAssignmentChange(newAssignment);
    };

    // Styles for nested levels
    const customStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: '#374151',
            borderColor: state.isFocused ? '#3B82F6' : '#4B5563',
            color: 'white',
            minHeight: '30px',
            fontSize: '12px',
            boxShadow: 'none',
            '&:hover': { borderColor: '#6B7280' }
        }),
        menu: (base) => ({ ...base, backgroundColor: '#1F2937', zIndex: 100 + depth }),
        option: (base, state) => ({
            ...base,
            backgroundColor: state.isFocused ? '#374151' : '#1F2937',
            color: 'white',
            cursor: 'pointer',
            fontSize: '12px',
            ':active': { backgroundColor: '#4B5563' }
        }),
        singleValue: (base) => ({ ...base, color: 'white' }),
        input: (base) => ({ ...base, color: 'white' }),
        placeholder: (base) => ({ ...base, color: '#9CA3AF' }),
        menuPortal: (base) => ({ ...base, zIndex: 9999 })
    };

    return (
        <div className="flex flex-col">
            <div className="flex items-center justify-between gap-4 py-1" style={{ paddingLeft: `${depth * 20}px` }}>
                <label className="font-bold text-white whitespace-nowrap w-1/3 text-right text-xs">
                    {depth > 0 && <span className="text-gray-500 mr-1">↳</span>}
                    {slot.name}
                    <span className="text-gray-400 text-[10px] ml-1 font-normal inline-block">
                        {slot.accepted_module_type ? `(${slot.accepted_module_type})` : ''}
                    </span>
                </label>
                <div className="w-2/3 flex items-center gap-2">
                    <input
                        type="text"
                        placeholder="Signal Label"
                        value={moduleInstance ? moduleInstance.signal_label || '' : ''}
                        onChange={(e) => onSignalLabelChange(e.target.value)}
                        disabled={!assignedId}
                        className="w-1/2 p-1.5 bg-gray-700 border border-gray-600 rounded-md text-xs disabled:bg-gray-800 disabled:cursor-not-allowed"
                    />
                    <div className="w-1/2">
                        <Select
                            styles={customStyles}
                            options={options}
                            value={selectedOption}
                            onChange={handleSelect}
                            classNamePrefix="react-select"
                            isClearable
                            placeholder="Select Module..."
                            menuPortalTarget={document.body}
                        />
                    </div>
                </div>
            </div>

            {/* RECURSION: If the assigned module has its own slots, render them below */}
            {assignedModule && assignedModule.slots && assignedModule.slots.length > 0 && (
                <div className="border-l-2 border-gray-700 ml-[33%] pl-2 mt-1 mb-2">
                    {assignedModule.slots.map((subSlot, index) => {
                        // Robust ID: Use ID if present, else Name, else Index
                        const subSlotId = subSlot.id || subSlot.name || index.toString();
                        const subAssignment = getSubAssignments(currentAssignment)[subSlotId];
                        
                        return (
                            <SlotRow
                                key={subSlotId}
                                slot={subSlot}
                                currentAssignment={subAssignment}
                                onChange={(val) => handleSubChange(subSlotId, val)}
                                equipmentLibrary={equipmentLibrary} // Pass library down
                                depth={depth + 1}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// --- Main Modal Component ---
const PanelConfigurationModal = ({ isOpen, onClose, chassisInstance, equipmentLibrary, onSave, droppedModule }) => {
    const [assignments, setAssignments] = useState({});
    const [moduleInstances, setModuleInstances] = useState({});
    const [originalModuleInstances, setOriginalModuleInstances] = useState({});

    useEffect(() => {
        if (isOpen && chassisInstance) {
            const fetchModuleInstances = async () => {
                const initialAssignments = chassisInstance.module_assignments || {};
                setAssignments(initialAssignments);

                const allInstanceIds = Object.values(initialAssignments).filter(Boolean);
                if (allInstanceIds.length === 0) {
                    setModuleInstances({});
                    setOriginalModuleInstances({});
                    return;
                }

                try {
                    // This is a placeholder; a real implementation might need a dedicated bulk-fetch endpoint
                    const instancePromises = allInstanceIds.map(id => api.getEquipmentInstance(id));
                    const instances = await Promise.all(instancePromises);
                    
                    const instanceMap = instances.reduce((acc, instance) => {
                        acc[instance.id] = instance;
                        return acc;
                    }, {});

                    setModuleInstances(instanceMap);
                    setOriginalModuleInstances(instanceMap);
                } catch (error) {
                    console.error("Failed to fetch module instances:", error);
                    toast.error("Could not load module details.");
                }
            };

            fetchModuleInstances();
        }
    }, [isOpen, chassisInstance]);

    const handleSave = async () => {
        const changedInstances = Object.values(moduleInstances).filter(
            instance => JSON.stringify(instance) !== JSON.stringify(originalModuleInstances[instance.id])
        );

        try {
            for (const instance of changedInstances) {
                await api.updateSignalLabel(instance.id, { signal_label: instance.signal_label });
            }
            onSave(chassisInstance.id, { module_assignments: assignments });
            toast.success('Configuration saved!');
            onClose();
        } catch (error) {
            console.error("Failed to save changes:", error);
            toast.error("Failed to save one or more changes.");
        }
    };

    const handleAssignmentChange = async (slotId, newModuleId) => {
        const oldModuleInstanceId = assignments[slotId];

        // If there was an old module, delete it
        if (oldModuleInstanceId) {
            try {
                await api.removeModuleInstance(oldModuleInstanceId);
                setModuleInstances(prev => {
                    const newInstances = { ...prev };
                    delete newInstances[oldModuleInstanceId];
                    return newInstances;
                });
            } catch (error) {
                toast.error(`Failed to remove old module: ${error.message}`);
                return; // Stop if we can't remove the old one
            }
        }

        // If a new module is selected, create it
        if (newModuleId) {
            try {
                const newInstance = await api.addModuleToInstance(chassisInstance.id, {
                    template_id: newModuleId,
                    slot_name: slotId
                });
                setAssignments(prev => ({ ...prev, [slotId]: newInstance.id }));
                setModuleInstances(prev => ({ ...prev, [newInstance.id]: newInstance }));
            } catch (error) {
                toast.error(`Failed to add new module: ${error.message}`);
            }
        } else {
            // If empty, just clear the assignment
            setAssignments(prev => {
                const newAssignments = { ...prev };
                delete newAssignments[slotId];
                return newAssignments;
            });
        }
    };

     const handleSignalLabelChange = (instanceId, newLabel) => {
        setModuleInstances(prev => ({
            ...prev,
            [instanceId]: {
                ...prev[instanceId],
                signal_label: newLabel
            }
        }));
    };


    if (!isOpen || !chassisInstance?.equipment_templates?.slots) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Configure ${chassisInstance.equipment_templates.model_number}`}>
            <div className="p-6 max-h-[80vh] overflow-y-auto">
                <div className="space-y-2">
                    {chassisInstance.equipment_templates.slots.map((slot, index) => {
                        // Robust ID logic to match what is used in assignment keys
                        const slotId = slot.id || slot.name || index.toString();
                        const assignedInstanceId = assignments[slotId];
                        const moduleInstance = moduleInstances[assignedInstanceId];

                        return (
                            <SlotRow
                                key={slotId}
                                slot={slot}
                                currentAssignment={assignedInstanceId}
                                moduleInstance={moduleInstance}
                                onAssignmentChange={(newModuleId) => handleAssignmentChange(slotId, newModuleId)}
                                onSignalLabelChange={(newLabel) => handleSignalLabelChange(assignedInstanceId, newLabel)}
                                equipmentLibrary={equipmentLibrary}
                            />
                        );
                    })}
                </div>
                <div className="mt-8 flex justify-end gap-4 border-t border-gray-700 pt-4">
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

export default PanelConfigurationModal;