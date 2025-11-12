import React, { useState, useContext, useEffect } from 'react';
import Modal from './Modal';
import { api } from '../api/api';
import toast from 'react-hot-toast';
// CORRECTED: Import useShow hook
import { useShow } from '../contexts/ShowContext'; // CORRECTED: Path changed from ../context to ../contexts
import CableForm from './CableForm';
import BulkEditCableForm from './BulkEditCableForm';

const CabkeManagerModal = ({ isOpen, onClose, loom, onCablesUpdate }) => {
    // CORRECTED: Use the useShow hook
    const { showId, showData, saveShowFile } = useShow();
    
    const [cables, setCables] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedCables, setSelectedCables] = useState(new Set());
    const [view, setView] = useState('list'); // 'list', 'new', 'bulk-edit'

    useEffect(() => {
        if (loom && isOpen) {
            fetchCables();
            setSelectedCables(new Set());
            setView('list');
        }
    }, [loom, isOpen]);

    const fetchCables = async () => {
        if (!loom) return;
        setLoading(true);
        try {
            const fetchedCables = await api.getCablesForLoom(loom.id);
            setCables(fetchedCables);
        } catch (error) {
            toast.error(`Error fetching cables: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateCable = async (cableData) => {
        try {
            const newCable = await api.createCable({ ...cableData, loom_id: loom.id });
            const updatedCables = [...cables, newCable];
            setCables(updatedCables);
            onCablesUpdate(updatedCables);
            toast.success("Cable created!");
            setView('list');
        } catch (error) {
            toast.error(`Error creating cable: ${error.message}`);
        }
    };

    const handleUpdateCable = async (cableId, cableData) => {
        try {
            const updatedCable = await api.updateCable(cableId, cableData);
            const updatedCables = cables.map(c => c.id === cableId ? updatedCable : c);
            setCables(updatedCables);
            onCablesUpdate(updatedCables);
            toast.success("Cable updated!");
        } catch (error) {
            toast.error(`Error updating cable: ${error.message}`);
        }
    };

    const handleDeleteCable = async (cableId) => {
        if (!window.confirm("Are you sure you want to delete this cable?")) return;
        try {
            await api.deleteCable(cableId);
            const updatedCables = cables.filter(c => c.id !== cableId);
            setCables(updatedCables);
            onCablesUpdate(updatedCables);
            toast.success("Cable deleted!");
        } catch (error) {
            toast.error(`Error deleting cable: ${error.message}`);
        }
    };
    
    const handleBulkDelete = async () => {
        if (selectedCables.size === 0) {
            toast.error("No cables selected.");
            return;
        }
        if (!window.confirm(`Are you sure you want to delete ${selectedCables.size} cables?`)) return;

        try {
            const deletePromises = Array.from(selectedCables).map(id => api.deleteCable(id));
            await Promise.all(deletePromises);
            
            const updatedCables = cables.filter(c => !selectedCables.has(c.id));
            setCables(updatedCables);
            onCablesUpdate(updatedCables);
            setSelectedCables(new Set());
            toast.success(`${selectedCables.size} cables deleted!`);
        } catch (error) {
            toast.error(`Error deleting cables: ${error.message}`);
        }
    };
    
    const handleBulkUpdate = async (updateData) => {
         if (selectedCables.size === 0) {
            toast.error("No cables selected.");
            return;
        }
        
        try {
            const payload = {
                cable_ids: Array.from(selectedCables),
                updates: updateData
            };
            const updatedCablesList = await api.bulkUpdateCables(payload);
            
            // This is inefficient if the list is huge, but fine for now.
            // A better API would return all updated cables, and we could merge.
            await fetchCables(); 
            
            toast.success(`${selectedCables.size} cables updated!`);
            setSelectedCables(new Set());
            setView('list');
        } catch (error) {
            toast.error(`Error bulk updating cables: ${error.message}`);
        }
    };

    const toggleSelectCable = (cableId) => {
        setSelectedCables(prev => {
            const newSet = new Set(prev);
            if (newSet.has(cableId)) {
                newSet.delete(cableId);
            } else {
                newSet.add(cableId);
            }
            return newSet;
        });
    };

    const toggleSelectAll = () => {
        if (selectedCables.size === cables.length) {
            setSelectedCables(new Set());
        } else {
            setSelectedCables(new Set(cables.map(c => c.id)));
        }
    };

    const renderListView = () => (
        <>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Manage Cables for {loom?.name}</h3>
                <div>
                    {selectedCables.size > 0 && (
                        <>
                            <button 
                                onClick={() => setView('bulk-edit')}
                                className="mr-2 px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-400"
                            >
                                Edit ({selectedCables.size})
                            </button>
                            <button 
                                onClick={handleBulkDelete}
                                className="mr-2 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-400"
                            >
                                Delete ({selectedCables.size})
                            </button>
                        </>
                    )}
                    <button 
                        onClick={() => setView('new')}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-400"
                    >
                        + New Cable
                    </button>
                </div>
            </div>
            {loading ? <p>Loading cables...</p> : (
                <div className="max-h-[60vh] overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-800 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left">
                                    <input 
                                        type="checkbox"
                                        checked={selectedCables.size === cables.length && cables.length > 0}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th className="px-4 py-2 text-left">Label</th>
                                <th className="px-4 py-2 text-left">Type</th>
                                <th className="px-4 py-2 text-left">Length (ft)</th>
                                <th className="px-4 py-2 text-left">Origin</th>
                                <th className="px-4 py-2 text-left">Destination</th>
                                <th className="px-4 py-2 text-left">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-900 divide-y divide-gray-700">
                            {cables.map(cable => (
                                <tr key={cable.id} className="hover:bg-gray-800">
                                    <td className="px-4 py-2">
                                        <input 
                                            type="checkbox"
                                            checked={selectedCables.has(cable.id)}
                                            onChange={() => toggleSelectCable(cable.id)}
                                        />
                                    </td>
                                    <td className="px-4 py-2">{cable.label_content}</td>
                                    <td className="px-4 py-2">{cable.cable_type}</td>
                                    <td className="px-4 py-2">{cable.length_ft}</td>
                                    <td className="px-4 py-2" style={{color: cable.origin_color}}>{cable.origin.value}</td>
                                    <td className="px-4 py-2" style={{color: cable.destination_color}}>{cable.destination.value}</td>
                                    <td className="px-4 py-2">
                                        {/* We'll add edit/delete later. For now, focus on create/view */}
                                        <button onClick={() => handleDeleteCable(cable.id)} className="text-red-400 hover:text-red-300">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );

    const renderNewView = () => (
        <div>
            <h3 className="text-xl font-bold mb-4">New Cable for {loom?.name}</h3>
            <CableForm 
                onSubmit={handleCreateCable} 
                onCancel={() => setView('list')} 
            />
        </div>
    );
    
    const renderBulkEditView = () => (
        <div>
            <h3 className="text-xl font-bold mb-4">Bulk Edit {selectedCables.size} Cables</h3>
            <BulkEditCableForm 
                onSubmit={handleBulkUpdate}
                onCancel={() => setView('list')}
            />
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} wide>
            {view === 'list' && renderListView()}
            {view === 'new' && renderNewView()}
            {view === 'bulk-edit' && renderBulkEditView()}
        </Modal>
    );
};

export default CabkeManagerModal;