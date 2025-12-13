import React, { useState } from 'react';
import Modal from './Modal';
import InputField from './InputField';

const NewVlanModal = ({ isOpen, onClose, onSubmit }) => {
    const [name, setName] = useState('');
    const [tag, setTag] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, tag: parseInt(tag, 10) });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New VLAN">
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField
                    label="VLAN Name"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                    placeholder="e.g., Lighting"
                />
                <InputField
                    label="VLAN Tag (ID)"
                    name="tag"
                    type="number"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    required
                    placeholder="e.g., 10"
                />
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-400 rounded-lg font-bold text-white">Create VLAN</button>
                </div>
            </form>
        </Modal>
    );
};

export default NewVlanModal;
