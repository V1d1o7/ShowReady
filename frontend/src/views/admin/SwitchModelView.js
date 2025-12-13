import React, { useState, useEffect } from 'react';
import { api } from '../../api/api';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import InputField from '../../components/InputField';
import toast from 'react-hot-toast';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';

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
            toast.error("Failed to fetch switch models.");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchModels();
    }, []);

    const handleOpenModal = (model = null) => {
        setEditingModel(model);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditingModel(null);
        setIsModalOpen(false);
    };

    const handleSave = async (modelData) => {
        try {
            if (editingModel) {
                await api.updateSwitchModel(editingModel.id, modelData);
                toast.success("Switch model updated!");
            } else {
                await api.createSwitchModel(modelData);
                toast.success("New switch model created!");
            }
            fetchModels();
            handleCloseModal();
        } catch (error) {
            toast.error(`Failed to save model: ${error.message}`);
        }
    };

    const handleDelete = async (modelId) => {
        if (window.confirm("Are you sure you want to delete this model? This action cannot be undone.")) {
            try {
                await api.deleteSwitchModel(modelId);
                toast.success("Switch model deleted.");
                fetchModels();
            } catch (error) {
                toast.error(`Failed to delete model: ${error.message}`);
            }
        }
    };

    return (
        <div className="p-8">
            <Card>
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">Manage Switch Models</h1>
                    <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-400 rounded-lg font-bold">
                        <PlusCircle size={20} />
                        New Model
                    </button>
                </div>

                {isLoading ? <p>Loading models...</p> : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full bg-gray-800">
                            <thead>
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Manufacturer</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Model Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Ports</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Driver Type</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {models.map(model => (
                                    <tr key={model.id}>
                                        <td className="px-6 py-4 whitespace-nowrap">{model.manufacturer}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">{model.model_name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">{model.port_count}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">{model.netmiko_driver_type}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={() => handleOpenModal(model)} className="text-indigo-400 hover:text-indigo-300 mr-4"><Edit size={18} /></button>
                                            <button onClick={() => handleDelete(model.id)} className="text-red-400 hover:text-red-300"><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {isModalOpen && (
                <SwitchModelFormModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onSave={handleSave}
                    model={editingModel}
                />
            )}
        </div>
    );
};

const SwitchModelFormModal = ({ isOpen, onClose, onSave, model }) => {
    const [formData, setFormData] = useState({
        manufacturer: model?.manufacturer || '',
        model_name: model?.model_name || '',
        port_count: model?.port_count || 24,
        netmiko_driver_type: model?.netmiko_driver_type || '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={model ? "Edit Switch Model" : "Create New Switch Model"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField name="manufacturer" label="Manufacturer" value={formData.manufacturer} onChange={handleChange} placeholder="e.g., Netgear" />
                <InputField name="model_name" label="Model Name" value={formData.model_name} onChange={handleChange} placeholder="e.g., GS724Tv4" required />
                <InputField name="port_count" label="Port Count" type="number" value={formData.port_count} onChange={handleChange} required />
                <InputField name="netmiko_driver_type" label="Netmiko Driver Type" value={formData.netmiko_driver_type} onChange={handleChange} placeholder="e.g., netgear_prosafe" required />
                
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-400 rounded-lg font-bold text-white">Save</button>
                </div>
            </form>
        </Modal>
    );
};

export default SwitchModelView;
