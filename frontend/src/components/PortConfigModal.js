import React, { useState, useEffect, useContext } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import SelectField from './SelectField';
import MultiSelect from './MultiSelect';
import { api } from '../api/api';
import toast from 'react-hot-toast';
// CORRECTED: Import useShow hook instead of ShowContext
import { useShow } from '../contexts/ShowContext';

const PortConfigModal = ({ isOpen, onClose, portNumber, portConfig, switchId, onSave }) => {
    const [portName, setPortName] = useState('');
    const [pvid, setPvid] = useState('');
    const [taggedVlans, setTaggedVlans] = useState([]);
    const [availableVlans, setAvailableVlans] = useState([]);
    
    // CORRECTED: Use the useShow hook
    const { showId } = useShow();

    useEffect(() => {
        if (isOpen) {
            setPortName(portConfig?.port_name || '');
            setPvid(portConfig?.pvid || '');
            setTaggedVlans(portConfig?.tagged_vlans || []);

            // Fetch available VLANs for the select options
            const fetchVlans = async () => {
                try {
                    const vlans = await api.getVlans(showId);
                    const vlanOptions = vlans.map(v => ({
                        value: v.vlan_id,
                        label: `${v.vlan_id} - ${v.name}`
                    }));
                    setAvailableVlans(vlanOptions);

                    // Ensure pvid is a string if it's a number
                    if (portConfig?.pvid) {
                        setPvid(String(portConfig.pvid));
                    }
                    
                    // Ensure taggedVlans are strings
                    if (portConfig?.tagged_vlans) {
                        setTaggedVlans(portConfig.tagged_vlans.map(String));
                    }

                } catch (error) {
                    toast.error("Failed to load available VLANs");
                    console.error("Failed to load VLANs:", error);
                }
            };
            
            fetchVlans();
        }
    }, [isOpen, portConfig, showId]);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        const configData = {
            port_name: portName,
            // Convert PVID back to a number, or null if empty
            pvid: pvid ? parseInt(pvid, 10) : null,
            // Convert tagged VLANs back to numbers
            tagged_vlans: taggedVlans.map(v => parseInt(v, 10))
        };
        
        onSave(portNumber, configData);
    };

    const vlanSelectOptions = availableVlans.map(v => ({
        value: String(v.value), // Ensure value is string for MultiSelect comparison
        label: v.label
    }));
    
    // Also add any currently tagged VLANs that might have been deleted from the main list
    taggedVlans.forEach(tv => {
        if (!vlanSelectOptions.find(v => v.value === String(tv))) {
            vlanSelectOptions.push({ value: String(tv), label: `${tv} (Deleted VLAN)` });
        }
    });

    // PVID options should only be from available VLANs
    const pvidOptions = [
        { value: '', label: 'None (Untagged)' },
        ...availableVlans.map(v => ({
            value: String(v.value), // Ensure value is string
            label: v.label
        }))
    ];
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Configure Port ${portNumber}`}>
            <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                    <InputField
                        label="Port Name / Description"
                        value={portName}
                        onChange={(e) => setPortName(e.target.value)}
                        placeholder="e.g., FOH_Network_A"
                    />
                    
                    <SelectField
                        label="PVID (Untagged VLAN)"
                        value={pvid}
                        onChange={(e) => setPvid(e.target.value)}
                        options={pvidOptions}
                    />

                    <MultiSelect
                        label="Tagged VLANs"
                        options={vlanSelectOptions}
                        selected={taggedVlans}
                        onChange={setTaggedVlans}
                        placeholder="Select tagged VLANs..."
                    />
                </div>
                
                <div className="flex justify-end mt-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="mr-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                    >
                        Save Configuration
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default PortConfigModal;