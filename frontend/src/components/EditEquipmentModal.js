import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import { Plus } from 'lucide-react';
import PortManagerModal from './PortManagerModal';
import ToggleSwitch from './ToggleSwitch';

const EditEquipmentModal = ({ isOpen, onClose, onSubmit, equipment }) => {
    const [formData, setFormData] = useState({ model_number: '', manufacturer: '', ru_height: 1, width: 'full', has_ip_address: false });
    const [ports, setPorts] = useState([]);
    const [isPortModalOpen, setIsPortModalOpen] = useState(false);

    useEffect(() => {
        if (equipment) {
            setFormData({
                model_number: equipment.model_number || '',
                manufacturer: equipment.manufacturer || '',
                ru_height: equipment.ru_height || 1,
                width: equipment.width || 'full',
                has_ip_address: equipment.has_ip_address || false,
            });
            setPorts(equipment.ports || []);
        }
    }, [equipment]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const dataToSubmit = { 
            ...formData, 
            ru_height: parseInt(formData.ru_height, 10),
            ports: ports
        };
        onSubmit(dataToSubmit);
    };

    if (!equipment) return null;

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={`Edit Equipment: ${equipment.model_number}`}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <InputField label="Model Number" name="model_number" value={formData.model_number} onChange={handleChange} required autoFocus />
                    <InputField label="Manufacturer" name="manufacturer" value={formData.manufacturer} onChange={handleChange} required />
                    <div className="grid grid-cols-2 gap-4">
                        <InputField label="RU Height" name="ru_height" type="number" min="1" value={formData.ru_height} onChange={handleChange} required />
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">Width</label>
                            <select name="width" value={formData.width} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                                <option value="full">Full</option>
                                <option value="half">Half</option>
                            </select>
                        </div>
                    </div>
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

                    <div className="border-t border-gray-700 pt-4">
                        <h3 className="text-md font-bold text-white mb-2">Ports ({ports.length})</h3>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {ports.map((port) => (
                                <div key={port.id} className="flex items-center gap-2 px-3 py-1 text-xs bg-gray-700 rounded-full">
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
                        <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Save Changes</button>
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

export default EditEquipmentModal;