import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import EquipmentForm from './EquipmentForm';
import { Plus } from 'lucide-react';
import PortManagerModal from './PortManagerModal';

const NewEquipmentModal = ({ isOpen, onClose, onSubmit, folderTree }) => {
    const initialFormState = {
        model_number: '',
        manufacturer: '',
        ru_height: 1,
        width: 'full',
        folder_id: '',
        has_ip_address: false,
        is_module: false,
        module_type: '',
        slots: []
    };
    const [formData, setFormData] = useState(initialFormState);
    const [ports, setPorts] = useState([]);
    const [isPortModalOpen, setIsPortModalOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setFormData(initialFormState);
            setPorts([]);
        }
    }, [isOpen]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const dataToSubmit = {
            ...formData,
            ru_height: formData.is_module ? 0 : parseInt(formData.ru_height, 10),
            folder_id: formData.folder_id || null,
            ports: ports,
        };

        if (dataToSubmit.is_module) {
            delete dataToSubmit.slots;
            delete dataToSubmit.ru_height;
            delete dataToSubmit.width;
        } else {
            delete dataToSubmit.module_type;
        }
        
        onSubmit(dataToSubmit);
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title="Create New Equipment Template">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <EquipmentForm
                        formData={formData}
                        onFormChange={setFormData}
                        folderTree={folderTree}
                        isNew={true}
                    />

                    {/* Port Management Section */}
                    <div className="border-t border-gray-700 pt-4">
                        <h3 className="text-md font-bold text-white mb-2">Ports ({ports.length})</h3>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {ports.map((port, index) => (
                                <div key={index} className="flex items-center gap-2 px-3 py-1 text-xs bg-gray-700 rounded-full">
                                    <span>{port.label} ({port.connector_type})</span>
                                </div>
                            ))}
                        </div>
                        <button onClick={(e) => { e.preventDefault(); setIsPortModalOpen(true); }} className="flex items-center justify-center gap-2 w-full px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors text-sm">
                            <Plus size={16} /> Manage Ports
                        </button>
                    </div>

                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Create Equipment</button>
                    </div>
                </form>
            </Modal>
            <PortManagerModal
                isOpen={isPortModalOpen}
                onClose={() => setIsPortModalOpen(false)}
                ports={ports}
                setPorts={setPorts}
            />
        </>
    );
};

export default NewEquipmentModal;
