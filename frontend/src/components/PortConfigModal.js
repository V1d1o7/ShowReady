import React, { useState, useEffect, useContext } from 'react';
import Modal from './Modal';
import { ShowContext } from '../contexts/ShowContext';
import InputField from './InputField';
import NewVlanModal from './NewVlanModal';
import { api } from '../api/api';
import toast from 'react-hot-toast';
import { PlusCircle } from 'lucide-react';

const PortConfigModal = ({ isOpen, onClose, portNumber, portConfig, onSave, switchId }) => {
    const { showId, vlans, onVlansUpdate } = useContext(ShowContext);
    const [isVlanModalOpen, setIsVlanModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        port_name: '',
        pvid: '',
        tagged_vlans: [],
        igmp_enabled: false,
    });

    useEffect(() => {
        if (portConfig) {
            setFormData({
                port_name: portConfig.port_name || '',
                pvid: portConfig.pvid || '',
                tagged_vlans: portConfig.tagged_vlans || [],
                igmp_enabled: portConfig.igmp_enabled || false,
            });
        } else {
             setFormData({ port_name: '', pvid: '', tagged_vlans: [], igmp_enabled: false });
        }
    }, [portConfig]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };
    
    const handleMultiSelectChange = (e) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option => parseInt(option.value, 10));
        setFormData(prev => ({
            ...prev,
            tagged_vlans: selectedOptions
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const dataToSave = {
            ...formData,
            pvid: formData.pvid ? parseInt(formData.pvid, 10) : null,
        };
        onSave(portNumber, dataToSave);
    };

    const handleCreateVlan = async (vlanData) => {
        try {
            const newVlan = await api.createVlan(showId, vlanData);
            onVlansUpdate([...vlans, newVlan]); // Update context
            toast.success("VLAN created successfully!");
            setIsVlanModalOpen(false);
        } catch (error) {
            toast.error(`Failed to create VLAN: ${error.message}`);
        }
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={`Configure Port ${portNumber}`}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <InputField
                        label="Port Name / Description"
                        name="port_name"
                        value={formData.port_name}
                        onChange={handleChange}
                        placeholder="e.g., Uplink to Core"
                    />

                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label htmlFor="pvid" className="block text-sm font-medium text-gray-300">
                                PVID (Untagged VLAN)
                            </label>
                            <button type="button" onClick={() => setIsVlanModalOpen(true)} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                <PlusCircle size={14} /> New VLAN
                            </button>
                        </div>
                        <select
                            id="pvid"
                            name="pvid"
                            value={formData.pvid}
                            onChange={handleChange}
                            className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg"
                        >
                            <option value="">None</option>
                            {vlans.map(vlan => (
                                <option key={vlan.id} value={vlan.tag}>{vlan.tag} - {vlan.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="tagged_vlans" className="block text-sm font-medium text-gray-300 mb-1.5">
                            Tagged VLANs
                        </label>
                        <select
                            id="tagged_vlans"
                            name="tagged_vlans"
                            multiple
                            value={formData.tagged_vlans.map(String)}
                            onChange={handleMultiSelectChange}
                            className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg h-32"
                        >
                            {vlans.map(vlan => (
                                <option key={vlan.id} value={vlan.tag}>{vlan.tag} - {vlan.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="igmp_enabled"
                            name="igmp_enabled"
                            checked={formData.igmp_enabled}
                            onChange={handleChange}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="igmp_enabled" className="ml-2 block text-sm text-gray-300">
                            Enable IGMP Snooping
                        </label>
                    </div>

                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-400 rounded-lg font-bold text-white">Save Port</button>
                    </div>
                </form>
            </Modal>

            <NewVlanModal
                isOpen={isVlanModalOpen}
                onClose={() => setIsVlanModalOpen(false)}
                onSubmit={handleCreateVlan}
            />
        </>
    );
};

export default PortConfigModal;
