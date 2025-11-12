import React, { useState, useEffect } from 'react';
import { api } from '../../api/api';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import InputField from '../../components/InputField';
import toast, { Toaster } from 'react-hot-toast';
import { Plus, Edit, Trash2 } from 'lucide-react';

const SwitchModelModal = ({ isOpen, onClose, onSave, model }) => {
    const [formData, setFormData] = useState({
        manufacturer: '',
        model_name: '',
        port_count: 0,
        netmiko_driver_type: ''
    });

    useEffect(() => {
        if (model) {
            setFormData({
                manufacturer: model.manufacturer || '',
                model_name: model.model_name || '',
                port_count: model.port_count || 0,
                netmiko_driver_type: model.netmiko_driver_type || ''
            });
        } else {
            setFormData({ manufacturer: '', model_name: '', port_count: 0, netmiko_driver_type: '' });
        }
    }, [model]);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? parseInt(value, 10) : value
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={model ? "Edit Switch Model" : "Create New Switch Model"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField label="Manufacturer" name="manufacturer" value={formData.manufacturer} onChange={handleChange} />
                <InputField label="Model Name" name="model_name" value={formData.model_name} onChange={handleChange} required />
                <InputField label="Port Count" name="port_count" type="number" value={formData.port_count} onChange={handleChange} required />
                <InputField label="Netmiko Driver Type" name="netmiko_driver_type" value={formData.netmiko_driver_type} onChange={handleChange} required placeholder="e.g., netgear_prosafe" />
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-400 rounded-lg font-bold text-white">Save Model</button>
                </div>
            </form>
        </Modal>
    );
};

const SwitchModelView = () => {
    const [models, setModels] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingModel, setEditingModel] = useState(null);

    const fetchModels = async () => {
        setIsLoading(true);
        try {
            const data = await api.getSwitchModels();
            setModels(data);
        } catch (error) {
            toast.error(`Failed to fetch switch models: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchModels();
    }, []);

    const handleSave = async (formData) => {
        try {
            if (editingModel) {
                // Update
                const updatedModel = await api.updateSwitchModel(editingModel.id, formData);
                setModels(models.map(m => m.id === updatedModel.id ? updatedModel : m));
                toast.success("Model updated successfully!");
            } else {
                // Create
                const newModel = await api.createSwitchModel(formData);
                setModels([...models, newModel]);
                toast.success("Model created successfully!");
            }
        } catch (error) {
            toast.error(`Failed to save model: ${error.message}`);
        } finally {
            setIsModalOpen(false);
            setEditingModel(null);
        }
    };

    const handleDelete = async (modelId) => {
        if (window.confirm("Are you sure you want to delete this model?")) {
            try {
                await api.deleteSwitchModel(modelId);
                setModels(models.filter(m => m.id !== modelId));
                toast.success("Model deleted successfully!");
            } catch (error) {
                toast.error(`Failed to delete model: ${error.message}`);
            }
        }
    };
    
    return (
        <div className="p-6">
            <Toaster position="bottom-center" />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Switch Model Templates</h1>
                <button onClick={() => { setEditingModel(null); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-400">
                    <Plus size={18} /> Create New
                </button>
            </div>
            
            <Card>
                {isLoading ? (
                    <p>Loading models...</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="py-2 px-4 text-left">Manufacturer</th>
                                    <th className="py-2 px-4 text-left">Model Name</th>
                                    <th className="py-2 px-4 text-left">Port Count</th>
                                    <th className="py-2 px-4 text-left">Driver</th>
                                    <th className="py-2 px-4 text-left">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {models.map(model => (
                                    <tr key={model.id} className="hover:bg-gray-800">
                                        <td className="py-2 px-4">{model.manufacturer}</td>
                                        <td className="py-2 px-4">{model.model_name}</td>
                                        <td className="py-2 px-4">{model.port_count}</td>
                                        <td className="py-2 px-4 font-mono text-sm">{model.netmiko_driver_type}</td>
                                        <td className="py-2 px-4">
                                            <button onClick={() => { setEditingModel(model); setIsModalOpen(true); }} className="p-1 text-gray-400 hover:text-amber-400 mr-2">
                                                <Edit size={16} />
                                            </button>
                                            <button onClick={() => handleDelete(model.id)} className="p-1 text-gray-400 hover:text-red-400">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {isModalOpen && (
                <SwitchModelModal
                    isOpen={isModalOpen}
                    onClose={() => { setIsModalOpen(false); setEditingModel(null); }}
                    onSave={handleSave}
                    model={editingModel}
                />
            )}
        </div>
    );
};

export default SwitchModelView;
