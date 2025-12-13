import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { api } from '../api/api';
import toast from 'react-hot-toast';

const ConfigureSwitchModal = ({ isOpen, onClose, equipment, onSave }) => {
    const [switchModels, setSwitchModels] = useState([]);
    const [selectedModelId, setSelectedModelId] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            const fetchModels = async () => {
                setIsLoading(true);
                try {
                    const models = await api.getSwitchModels();
                    setSwitchModels(models);
                    // Set the initial selected value if the equipment is already linked
                    setSelectedModelId(equipment.switch_model_id || '');
                } catch (error) {
                    console.error("Failed to fetch switch models", error);
                    toast.error("Could not load switch models.");
                } finally {
                    setIsLoading(false);
                }
            };
            fetchModels();
        }
    }, [isOpen, equipment]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(equipment.id, selectedModelId || null); // Pass null if '' to unlink
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Configure Switch Properties">
            <div className="mb-4">
                <p className="text-gray-400"><strong>Equipment:</strong> {equipment.manufacturer} {equipment.model_number}</p>
            </div>
            {isLoading ? (
                <p>Loading switch models...</p>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="switch-model-select" className="block text-sm font-medium text-gray-300 mb-1.5">
                            Switch Model Template
                        </label>
                        <select
                            id="switch-model-select"
                            value={selectedModelId}
                            onChange={(e) => setSelectedModelId(e.target.value)}
                            className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg"
                        >
                            <option value="">None (Not a configurable switch)</option>
                            {switchModels.map(model => (
                                <option key={model.id} value={model.id}>
                                    {model.manufacturer} {model.model_name} ({model.port_count} ports)
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-400 rounded-lg font-bold text-white">Save Configuration</button>
                    </div>
                </form>
            )}
        </Modal>
    );
};

export default ConfigureSwitchModal;
