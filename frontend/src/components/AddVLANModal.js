import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';

const AddVLANModal = ({ isOpen, onClose, onSubmit, vlan }) => {
    const [name, setName] = useState('');
    const [tag, setTag] = useState('');
    const [error, setError] = useState('');

    const isEditMode = vlan != null;

    useEffect(() => {
        if (isOpen) {
            if (isEditMode) {
                setName(vlan.name);
                setTag(vlan.tag.toString());
            } else {
                setName('');
                setTag('');
            }
            setError('');
        }
    }, [isOpen, vlan, isEditMode]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim() || !tag) {
            setError('Both VLAN Name and Tag are required.');
            return;
        }
        const tagAsInt = parseInt(tag, 10);
        if (isNaN(tagAsInt) || tagAsInt <= 0) {
            setError('VLAN Tag must be a positive number.');
            return;
        }
        onSubmit({ name, tag: tagAsInt });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? 'Edit VLAN' : 'Add New VLAN'}>
            <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                    <InputField
                        label="VLAN Name"
                        id="vlan-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Camera Network"
                        autoFocus
                    />
                    <InputField
                        label="VLAN Tag"
                        id="vlan-tag"
                        type="number"
                        value={tag}
                        onChange={(e) => setTag(e.target.value)}
                        placeholder="e.g., 101"
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
                        className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors"
                    >
                        {isEditMode ? 'Save Changes' : 'Add VLAN'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default AddVLANModal;