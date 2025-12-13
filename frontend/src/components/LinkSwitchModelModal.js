import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { api } from '../api/api';
import toast from 'react-hot-toast';

const LinkSwitchModelModal = ({ isOpen, onClose, equipment, onLink }) => {
    const [switchModels, setSwitchModels] = useState([]);
    const [selectedModelId, setSelectedModelId] = useState('');

    useEffect(() => {
        if (isOpen) {
            const fetchModels = async () => {
                try {
                    const models = await api.getSwitchModels();
                    setSwitchModels(models);
                    setSelectedModelId(equipment?.switch_model_id || '');
                } catch (error) {
                    console.error("Failed to fetch switch models", error);
                    toast.error("Failed to load switch models.");
                }
            };
            fetchModels();
        }
    }, [isOpen, equipment]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await onLink(equipment.id, selectedModelId || null);
            toast.success("Link updated successfully!");
            onClose();
        } catch (error) {
            console.error("Failed to link switch model", error);
            toast.error(`Error: ${error.message}`);
        }
    };

    if (!equipment) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Configure: ${equipment.model_number}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">
                        Select Switch Model Template
                    </label>
                    <p className="text-xs text-gray-400 mb-2">
                        Linking a model makes this equipment "configurable" in the Switch Config feature.
                    </p>
                    <select
                        value={selectedModelId}
                        onChange={(e) => setSelectedModelId(e.target.value)}
                        className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg"
                    >
                        <option value="">None (Not a configurable switch)</option>
                        {switchModels.map(model => (
                            <option key={model.id} value={model.id}>
                                {model.manufacturer} - {model.model_name} ({model.port_count} ports)
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Save Link</button>
                </div>
            </form>
        </Modal>
    );
};

export default LinkSwitchModelModal;
