import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';

const GenerateScriptModal = ({ isOpen, onClose, onSubmit }) => {
    const [interfaceName, setInterfaceName] = useState('');
    const [virtualSwitchName, setVirtualSwitchName] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            // Pre-fill from local storage
            const savedInterface = localStorage.getItem('vlan_interface_name') || '';
            const savedSwitch = localStorage.getItem('vlan_virtual_switch_name') || '';
            setInterfaceName(savedInterface);
            setVirtualSwitchName(savedSwitch);
            setError('');
        }
    }, [isOpen]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!interfaceName.trim() || !virtualSwitchName.trim()) {
            setError('Both Interface Name and Virtual Switch Name are required.');
            return;
        }
        
        // Save to local storage
        localStorage.setItem('vlan_interface_name', interfaceName);
        localStorage.setItem('vlan_virtual_switch_name', virtualSwitchName);
        
        onSubmit({ interfaceName, virtualSwitchName });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Generate VLAN Script">
            <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                    <InputField
                        label="Interface Name"
                        id="interface-name"
                        value={interfaceName}
                        onChange={(e) => setInterfaceName(e.target.value)}
                        placeholder="e.g., Ethernet"
                        autoFocus
                    />
                    <InputField
                        label="Virtual Switch Name"
                        id="virtual-switch-name"
                        value={virtualSwitchName}
                        onChange={(e) => setVirtualSwitchName(e.target.value)}
                        placeholder="e.g., VLAN-Switch"
                    />
                </div>
                {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
                <div className="flex justify-end gap-3 mt-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-500 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-500 transition-colors"
                    >
                        Generate & Download
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default GenerateScriptModal;