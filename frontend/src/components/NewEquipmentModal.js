import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import EquipmentForm from './EquipmentForm';
import EquipmentPortManager from './EquipmentPortManager';

const NewEquipmentModal = ({ isOpen, onClose, onSubmit, folderTree }) => {
    const initialFormState = {
        model_number: '',
        manufacturer: '',
        ru_height: 1,
        width: 'full',
        depth: 0.0,
        power_consumption_watts: 0,
        folder_id: '',
        has_ip_address: false,
        is_module: false,
        is_adapter: false,
        module_type: '',
        slots: [],
        has_slots: false, // Initial state for the toggle
        is_patch_panel: false,
        screw_type: ''
    };
    const [formData, setFormData] = useState(initialFormState);
    const [ports, setPorts] = useState([]);

    useEffect(() => {
        if (isOpen) {
            setFormData(initialFormState);
            setPorts([]);
        }
    }, [isOpen]);

    const handleSaveEquipment = () => {
        const dataToSubmit = {
            ...formData,
            ru_height: formData.is_module ? 0 : parseInt(formData.ru_height, 10),
            power_consumption_watts: parseInt(formData.power_consumption_watts || 0, 10),
            folder_id: formData.folder_id || null,
            ports: ports,
        };

        if (dataToSubmit.is_module) {
            dataToSubmit.ru_height = 0;
            delete dataToSubmit.width;
        } else {
            delete dataToSubmit.module_type;
        }
        
        onSubmit(dataToSubmit);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Equipment Template">
            <div className="p-6 max-h-[70vh] overflow-y-auto">
                <div className="space-y-4">
                    <EquipmentForm
                        formData={formData}
                        onFormChange={setFormData}
                        folderTree={folderTree}
                        isNew={true}
                        isAdmin={true}
                    />

                    {/* Port Management Section */}
                    <div className="border-t border-gray-700 pt-4">
                        <EquipmentPortManager ports={ports} setPorts={setPorts} />
                    </div>

                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-white">Cancel</button>
                        <button type="button" onClick={handleSaveEquipment} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Create Equipment</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default NewEquipmentModal;