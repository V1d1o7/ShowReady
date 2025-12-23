import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Select from 'react-select';
import toast from 'react-hot-toast';

// --- Helper: Normalize assignment data ---
const getAssignmentId = (val) => (val && typeof val === 'object' ? val.id : val);
const getSubAssignments = (val) => (val && typeof val === 'object' && val.assignments ? val.assignments : {});

// --- Recursive Row Component ---
const SlotRow = ({ slot, currentAssignment, onChange, equipmentLibrary, depth = 0 }) => {
    // 1. Identify what is currently in this slot
    const assignedId = getAssignmentId(currentAssignment);
    
    // FIX: Restored the definition of assignedModule that I accidentally deleted
    const assignedModule = assignedId ? equipmentLibrary.find(e => e.id == assignedId) : null;
    
    // 2. Filter options for this specific slot (Case-insensitive & Safe)
    const getOptions = () => {
        const acceptedType = slot.accepted_module_type;
        
        const compatible = (equipmentLibrary || []).filter(item => {
            // Loose check for is_module (handles 1, true, "true") or ru_height 0 fallback
            const isModule = item.is_module == true || item.is_module === 'true' || item.is_module === 1 || item.ru_height === 0;
            
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
    const selectedOption = options.find(opt => opt.value == assignedId);

    // 3. Handle change
    const handleSelect = (option) => {
        const newVal = option ? option.value : null;
        
        if (!newVal) {
            onChange(null);
            return;
        }
        
        // Preserve sub-assignments if the module hasn't changed
        const existingSub = assignedId === newVal ? getSubAssignments(currentAssignment) : {};
        
        onChange({ id: newVal, assignments: existingSub });
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
        onChange(newAssignment);
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
                <div className="w-2/3">
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
const ConfigureModulesModal = ({ isOpen, onClose, chassisInstance, equipmentLibrary, onSave, droppedModule }) => {
    const [assignments, setAssignments] = useState({});

    useEffect(() => {
        if (isOpen) {
            // 1. Load initial assignments
            const initialAssignments = chassisInstance?.module_assignments || {};
            setAssignments(initialAssignments);
            
            // 2. Handle Auto-Slotting (If triggered by drag-drop)
            if (droppedModule && chassisInstance?.equipment_templates?.slots) {
                const firstCompatibleEmptySlot = chassisInstance.equipment_templates.slots.find(slot => {
                    const slotId = slot.id || slot.name;
                    // Check if slot key exists in assignments
                    const isSlotOccupied = initialAssignments[slotId];
                    const acceptedType = slot.accepted_module_type;
                    
                    // Use loose, case-insensitive matching
                    const moduleType = (droppedModule.module_type || "").toLowerCase().trim();
                    const slotType = (acceptedType || "").toLowerCase().trim();
                    
                    const isTypeCompatible = !acceptedType || slotType === moduleType;
                    
                    return !isSlotOccupied && isTypeCompatible;
                });

                if (firstCompatibleEmptySlot) {
                    const slotId = firstCompatibleEmptySlot.id || firstCompatibleEmptySlot.name;
                    
                    const newAssignments = { 
                        ...initialAssignments, 
                        [slotId]: droppedModule.id // Simple assignment for top level
                    };
                    setAssignments(newAssignments);
                    toast.success(`Dropped ${droppedModule.model_number} into ${firstCompatibleEmptySlot.name}.`);
                    return; // Skip setting default state
                } else {
                    toast.error(`No compatible empty slot found for ${droppedModule.model_number}.`);
                }
            }
        }
    }, [chassisInstance, droppedModule, isOpen, equipmentLibrary]);

    const handleSave = () => {
        onSave(chassisInstance.id, { module_assignments: assignments });
        toast.success('Configuration saved!');
        onClose();
    };

    if (!isOpen || !chassisInstance?.equipment_templates?.slots) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Configure ${chassisInstance.equipment_templates.model_number}`}>
            <div className="p-6 max-h-[80vh] overflow-y-auto">
                <div className="space-y-2">
                    {chassisInstance.equipment_templates.slots.map((slot, index) => {
                        // Robust ID logic to match what is used in assignment keys
                        const slotId = slot.id || slot.name || index.toString();
                        return (
                            <SlotRow
                                key={slotId}
                                slot={slot}
                                currentAssignment={assignments[slotId]}
                                onChange={(val) => setAssignments(prev => ({ ...prev, [slotId]: val }))}
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

export default ConfigureModulesModal;