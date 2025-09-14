import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/api';
import { useModal } from '../contexts/ModalContext';
import { X, Plus, Edit, Trash2, FileText } from 'lucide-react';
import CableForm from './CableForm';

const CableManagerModal = ({ loom, onClose, onExport }) => {
    const { showConfirmationModal } = useModal();
    const [cables, setCables] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingCable, setEditingCable] = useState(null);

    const fetchCables = useCallback(async () => {
        if (!loom) return;
        try {
            setIsLoading(true);
            const fetchedCables = await api.getCablesForLoom(loom.id);
            setCables(fetchedCables);
        } catch (error) {
            console.error(`Failed to fetch cables for loom ${loom.name}:`, error);
        } finally {
            setIsLoading(false);
        }
    }, [loom]);

    useEffect(() => {
        fetchCables();
    }, [fetchCables]);
    
    const handleAddNewCable = () => {
        const newCable = {
            loom_id: loom.id,
            label_content: 'New Cable',
            cable_type: '',
            length_ft: null,
            origin: { type: 'rack', value: '', end: 'Male' },
            destination: { type: 'rack', value: '', end: 'Male' },
            origin_color: 'Blue',
            destination_color: 'Blue',
            is_rcvd: false,
            is_complete: false,
        };
        setEditingCable(newCable);
    };

    const handleSaveCable = async (cableToSave) => {
        try {
            if (cableToSave.id) {
                await api.updateCable(cableToSave.id, cableToSave);
            } else {
                await api.createCable(cableToSave);
            }
            setEditingCable(null);
            fetchCables();
        } catch (error) {
            console.error("Failed to save cable:", error);
        }
    };

    const handleDeleteCable = (cableId) => {
        showConfirmationModal(
            "Are you sure you want to delete this cable?",
            async () => {
                try {
                    await api.deleteCable(cableId);
                    fetchCables();
                } catch (error) {
                    console.error("Failed to delete cable:", error);
                }
            }
        );
    };
    
    const renderLocation = (location) => {
        if (!location) return 'N/A';
        return `${location.value || 'N/A'} (${location.end || 'N/A'})`
    }

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
                <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col border border-gray-700">
                    <header className="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                        <h2 className="text-2xl font-bold text-white">Cable Manager: {loom.name}</h2>
                    <div className="flex items-center gap-4">
                         <button onClick={() => onExport(loom)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600 transition-colors">
                            <FileText size={16}/> Export This Loom
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white">
                            <X size={24} />
                        </button>
                    </div>
                    </header>

                    <main className="flex-grow p-4 overflow-y-auto">
                        <div className="flex justify-end mb-4">
                            <button onClick={handleAddNewCable} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors">
                                <Plus size={16}/> Add New Cable
                            </button>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="border-b border-gray-700">
                                    <tr>
                                        <th className="p-3 font-bold text-gray-400 uppercase tracking-wider">Label</th>
                                        <th className="p-3 font-bold text-gray-400 uppercase tracking-wider">Type</th>
                                        <th className="p-3 font-bold text-gray-400 uppercase tracking-wider">Length</th>
                                        <th className="p-3 font-bold text-gray-400 uppercase tracking-wider">Origin</th>
                                        <th className="p-3 font-bold text-gray-400 uppercase tracking-wider">Destination</th>
                                        <th className="p-3 font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading ? (
                                        <tr><td colSpan="6" className="text-center py-8 text-gray-500">Loading cables...</td></tr>
                                    ) : cables.map((cable) => (
                                        <tr key={cable.id} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                                            <td className="p-3">{cable.label_content}</td>
                                            <td className="p-3">{cable.cable_type}</td>
                                            <td className="p-3">{cable.length_ft} ft</td>
                                            <td className="p-3">{renderLocation(cable.origin)}</td>
                                            <td className="p-3">{renderLocation(cable.destination)}</td>
                                            <td className="p-3 flex justify-end gap-2">
                                                <button onClick={() => setEditingCable(cable)} className="text-blue-400 hover:text-blue-300"><Edit size={16} /></button>
                                                <button onClick={() => handleDeleteCable(cable.id)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {cables.length === 0 && !isLoading && (
                                <div className="text-center py-8 text-gray-500">No cables in this loom.</div>
                            )}
                        </div>
                    </main>
                </div>
            </div>
            {editingCable && (
                <CableForm
                    cable={editingCable}
                    onSave={handleSaveCable}
                    onCancel={() => setEditingCable(null)}
                />
            )}
        </>
    );
};

export default CableManagerModal;
