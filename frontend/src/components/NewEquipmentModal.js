import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import EquipmentForm from './EquipmentForm';
import { Plus, Edit, Trash2 } from 'lucide-react';
import PortManagerModal from './PortManagerModal';

const NewEquipmentModal = ({ isOpen, onClose, onSubmit, folderTree }) => {
    const initialFormState = {
        model_number: '',
        manufacturer: '',
        ru_height: 1,
        width: 'full',
        depth: 0.0,
        folder_id: '',
        has_ip_address: false,
        is_module: false,
        module_type: '',
        slots: []
    };
    const [formData, setFormData] = useState(initialFormState);
    const [ports, setPorts] = useState([]);
    const [isPortModalOpen, setIsPortModalOpen] = useState(false);
    const [editingPort, setEditingPort] = useState(null);

    const handleDeletePort = (portId) => {
        setPorts(ports.filter(p => p.id !== portId));
    };

    const handleEditPort = (port) => {
        setEditingPort(port);
        setIsPortModalOpen(true);
    };

    const handleSavePort = (updatedPort) => {
        if (editingPort) {
            setPorts(ports.map(p => p.id === updatedPort.id ? updatedPort : p));
        } else {
            setPorts([...ports, updatedPort]);
        }
        setEditingPort(null);
    };


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
            dataToSubmit.ru_height = 0;
            // FIX: Allow modules to have slots!
            // delete dataToSubmit.slots;  <-- REMOVED THIS LINE
            delete dataToSubmit.width;
        } else {
            delete dataToSubmit.module_type;
        }
        
        onSubmit(dataToSubmit);
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title="Create New Equipment Template">
                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <EquipmentForm
                            formData={formData}
                            onFormChange={setFormData}
                            folderTree={folderTree}
                            isNew={true}
                            isAdmin={true}
                        />

                        {/* Port Management Section */}
                        <div className="border-t border-gray-700 pt-4">
                            <h3 className="text-md font-bold text-white mb-2">Ports ({ports.length})</h3>
                            <div className="space-y-2 mb-4">
                                {ports.map((port) => (
                                    <div key={port.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm bg-gray-700 rounded-lg">
                                        <span>{port.label} ({port.connector_type}) - {port.type}</span>
                                        <div className="flex items-center gap-2">
                                            <button onClick={(e) => { e.preventDefault(); handleEditPort(port); }} className="p-1 text-gray-400 hover:text-amber-400">
                                                <Edit size={14} />
                                            </button>
                                            <button onClick={(e) => { e.preventDefault(); handleDeletePort(port.id); }} className="p-1 text-gray-400 hover:text-red-400">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button onClick={(e) => { e.preventDefault(); setEditingPort(null); setIsPortModalOpen(true); }} className="flex items-center justify-center gap-2 w-full px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors text-sm">
                                <Plus size={16} /> Add New Port
                            </button>
                        </div>

                        <div className="flex justify-end gap-4 pt-4">
                            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                            <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Create Equipment</button>
                        </div>
                    </form>
                </div>
            </Modal>
            {isPortModalOpen && (
                <PortManagerModal
                    isOpen={isPortModalOpen}
                    onClose={() => { setIsPortModalOpen(false); setEditingPort(null); }}
                    onSave={handleSavePort}
                    existingPort={editingPort}
                />
            )}
        </>
    );
};

export default NewEquipmentModal;