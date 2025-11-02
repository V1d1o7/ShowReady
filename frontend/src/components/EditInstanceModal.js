import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';

const EditInstanceModal = ({ isOpen, onClose, onSubmit, item }) => {
    const [name, setName] = useState('');
    const [ipAddress, setIpAddress] = useState('');

    const template = item?.equipment_templates || {};

    useEffect(() => {
        if (item) {
            setName(item.instance_name || '');
            setIpAddress(item.ip_address || '');
        }
    }, [item]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const dataToSubmit = { instance_name: name };
        if (template.has_ip_address) {
            dataToSubmit.ip_address = ipAddress;
        }
        onSubmit(dataToSubmit);
    };

    if (!isOpen || !item) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit: ${item.instance_name}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-gray-400 -mb-2">Model: {template.model_number}</p>
                <InputField
                    label="Instance Name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                />
                {template.has_ip_address && (
                    <InputField
                        label="IP Address"
                        type="text"
                        value={ipAddress}
                        onChange={(e) => setIpAddress(e.target.value)}
                        placeholder="e.g., 192.168.1.100"
                    />
                )}
                <div className="flex justify-end gap-4 pt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black"
                    >
                        Save Changes
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default EditInstanceModal;
