import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import EquipmentForm from './EquipmentForm';
import EquipmentPortManager from './EquipmentPortManager';

const EditEquipmentModal = ({ isOpen, onClose, onSubmit, equipment }) => {
    const [formData, setFormData] = useState({});
    const [ports, setPorts] = useState([]);

    useEffect(() => {
        if (equipment) {
            setFormData({
                model_number: equipment.model_number || '',
                manufacturer: equipment.manufacturer || '',
                ru_height: equipment.ru_height || 1,
                width: equipment.width || 'full',
                depth: equipment.depth || 0.0,
                power_consumption_watts: equipment.power_consumption_watts || 0,
                has_ip_address: equipment.has_ip_address || false,
                is_module: equipment.is_module || false,
                is_adapter: equipment.is_adapter || false,
                module_type: equipment.module_type || '',
                slots: equipment.slots || [],
                has_slots: (equipment.slots && equipment.slots.length > 0) || false,
                is_patch_panel: equipment.is_patch_panel || false
            });
            setPorts(equipment.ports || []);
        }
    }, [equipment]);

    const handleSaveEquipment = () => {
        const dataToSubmit = { 
            ...formData, 
            ru_height: formData.is_module ? 0 : parseInt(formData.ru_height, 10),
            power_consumption_watts: parseInt(formData.power_consumption_watts || 0, 10),
            ports: ports
        };
        // Clean up data based on module type
        if (dataToSubmit.is_module) {
            dataToSubmit.ru_height = 0;
            delete dataToSubmit.width;
        } else {
            delete dataToSubmit.module_type;
        }
        onSubmit(dataToSubmit);
    };

    if (!equipment) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit Equipment: ${equipment.model_number}`}>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
                <div className="space-y-4">
                    <EquipmentForm
                        formData={formData}
                        onFormChange={setFormData}
                        isNew={false}
                        isAdmin={true}
                    />

                    <div className="border-t border-gray-700 pt-4">
                        <EquipmentPortManager ports={ports} setPorts={setPorts} />
                    </div>

                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-white">Cancel</button>
                        <button type="button" onClick={handleSaveEquipment} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Save Changes</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default EditEquipmentModal;