import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';

const NamePromptModal = ({ isOpen, onClose, onSubmit, title, initialValue = '' }) => {
    const [name, setName] = useState(initialValue);

    useEffect(() => {
        if (isOpen) {
            setName(initialValue);
        }
    }, [isOpen, initialValue]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) {
            onSubmit(name);
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit}>
                <InputField
                    label="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                />
                <div className="flex justify-end gap-3 mt-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-700 rounded-lg hover:bg-gray-600 focus:outline-none"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 text-sm font-medium text-black bg-amber-500 rounded-lg hover:bg-amber-400 focus:outline-none"
                    >
                        Confirm
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default NamePromptModal;
