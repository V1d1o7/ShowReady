import React, { useState, useEffect, useCallback } from 'react';
import { useShow } from '../contexts/ShowContext';
import { useModal } from '../contexts/ModalContext';
import { useToast } from '../contexts/ToastContext'; // Import useToast
import { api } from '../api/api';
import { Plus, Info, Download, Trash2 } from 'lucide-react';
import AddVLANModal from '../components/AddVLANModal';
import GenerateScriptModal from '../components/GenerateScriptModal';
import VlanInstructionsModal from '../components/VlanInstructionsModal';

const VLANView = () => {
    const { showName } = useShow();
    const { showConfirmationModal } = useModal();
    const { addToast } = useToast(); // Use the toast context
    const [vlans, setVlans] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedVlans, setSelectedVlans] = useState(new Set());
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

    const fetchVlans = useCallback(async () => {
        if (!showName) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.getVlans(showName);
            setVlans(data.sort((a, b) => a.tag - b.tag));
        } catch (err) {
            setError(err.message);
            addToast(`Failed to fetch VLANs: ${err.message}`, 'error');
            console.error("Failed to fetch VLANs:", err);
        } finally {
            setIsLoading(false);
        }
    }, [showName, addToast]);

    useEffect(() => {
        fetchVlans();
    }, [fetchVlans]);

    const handleSelectVlan = (vlanId) => {
        setSelectedVlans(prev => {
            const newSelection = new Set(prev);
            if (newSelection.has(vlanId)) {
                newSelection.delete(vlanId);
            } else {
                newSelection.add(vlanId);
            }
            return newSelection;
        });
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedVlans(new Set(vlans.map(v => v.id)));
        } else {
            setSelectedVlans(new Set());
        }
    };

    const handleDeleteVlan = (vlanId) => {
        showConfirmationModal('Are you sure you want to delete this VLAN?', async () => {
            try {
                await api.deleteVlan(vlanId);
                addToast('VLAN deleted successfully', 'success');
                fetchVlans();
            } catch (err) {
                const errorMessage = `Failed to delete VLAN: ${err.message}`;
                setError(errorMessage);
                addToast(errorMessage, 'error');
                console.error(errorMessage);
            }
        });
    };

    const handleCreateVlan = async (vlanData) => {
        try {
            await api.createVlan(showName, vlanData);
            addToast('VLAN created successfully', 'success');
            fetchVlans();
            setIsAddModalOpen(false);
        } catch (err) {
            const errorMessage = `Failed to create VLAN: ${err.message}`;
            setError(errorMessage);
            addToast(errorMessage, 'error');
            console.error(errorMessage);
        }
    };

    const handleGenerateScript = async ({ interfaceName, virtualSwitchName }) => {
        if (selectedVlans.size === 0) {
            addToast("Please select at least one VLAN to include in the script.", 'error');
            return;
        }

        try {
            const payload = {
                interface_name: interfaceName,
                virtual_switch_name: virtualSwitchName,
                vlan_ids: Array.from(selectedVlans),
            };
            const blob = await api.generateVlanScript(showName, payload);
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'vlan_setup.ps1';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            addToast('PowerShell script generated successfully.', 'success');
            setIsScriptModalOpen(false);
            setIsInfoModalOpen(true); 
            
        } catch (err) {
            const errorMessage = `Failed to generate script: ${err.message}`;
            setError(errorMessage);
            addToast(errorMessage, 'error');
            console.error(errorMessage);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 h-full flex flex-col">
            <header className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-white">VLAN Management</h1>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsInfoModalOpen(true)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                        aria-label="Show VLAN script instructions"
                    >
                        <Info size={20} />
                    </button>
                    <button 
                        onClick={() => setIsScriptModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-500 transition-colors"
                    >
                        <Download size={18} /> WIN VLAN Script
                    </button>
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors"
                    >
                        <Plus size={18} /> New VLAN
                    </button>
                </div>
            </header>

            <div className="flex-grow overflow-y-auto bg-gray-800 rounded-lg shadow-md">
                {isLoading ? (
                    <div className="text-center py-16 text-gray-400">Loading VLANs...</div>
                ) : error && vlans.length === 0 ? (
                    <div className="text-center py-16 text-red-400">Error: {error}</div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-800 sticky top-0">
                            <tr>
                                <th scope="col" className="p-4 w-12 text-left">
                                    <input
                                        type="checkbox"
                                        className="bg-gray-700 border-gray-500 rounded text-amber-500 focus:ring-amber-500"
                                        onChange={handleSelectAll}
                                        checked={!isLoading && vlans.length > 0 && selectedVlans.size === vlans.length}
                                        disabled={isLoading || vlans.length === 0}
                                    />
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    VLAN Name
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    VLAN Tag
                                </th>
                                <th scope="col" className="relative px-6 py-3 w-20">
                                    <span className="sr-only">Delete</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {vlans.length > 0 ? vlans.map((vlan) => (
                                <tr key={vlan.id} className="hover:bg-gray-700">
                                    <td className="p-4">
                                        <input
                                            type="checkbox"
                                            className="bg-gray-700 border-gray-500 rounded text-amber-500 focus:ring-amber-500"
                                            checked={selectedVlans.has(vlan.id)}
                                            onChange={() => handleSelectVlan(vlan.id)}
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{vlan.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{vlan.tag}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button onClick={() => handleDeleteVlan(vlan.id)} className="text-red-500 hover:text-red-400" aria-label={`Delete VLAN ${vlan.name}`}>
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="4" className="text-center py-10 text-gray-400">
                                        No VLANs found. Click "New VLAN" to add one.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
            <AddVLANModal 
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSubmit={handleCreateVlan}
            />
            <GenerateScriptModal
                isOpen={isScriptModalOpen}
                onClose={() => setIsScriptModalOpen(false)}
                onSubmit={handleGenerateScript}
            />
            <VlanInstructionsModal
                isOpen={isInfoModalOpen}
                onClose={() => setIsInfoModalOpen(false)}
            />
        </div>
    );
};

export default VLANView;