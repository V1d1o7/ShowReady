import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import InputField from '../InputField';

const PanelLabelModal = ({ isOpen, onClose, instance, onSave }) => {
    const [label, setLabel] = useState('');

    useEffect(() => {
        if (isOpen && instance) {
            setLabel(instance.label || '');
        }
    }, [isOpen, instance]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(label);
    };

    if (!isOpen) return null;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Configure ${instance?.template?.name || 'Port'}`}
        >
            <form onSubmit={handleSubmit} className="p-6">
                <InputField 
                    label="Port Label" 
                    value={label} 
                    onChange={(e) => setLabel(e.target.value)}
                    autoFocus
                />
                <div className="mt-6 flex justify-end gap-3">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="px-4 py-2 text-gray-400 hover:text-white font-bold"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400"
                    >
                        Save Changes
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default PanelLabelModal;