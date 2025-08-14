import React, { useState } from 'react';
import Modal from './Modal';
import InputField from './InputField';

const NewRackModal = ({ isOpen, onClose, onSubmit }) => {
    const [rackName, setRackName] = useState('');
    const [ruHeight, setRuHeight] = useState(42);
    const handleSubmit = (e) => { e.preventDefault(); onSubmit({ rackName, ruHeight }); setRackName(''); setRuHeight(42); };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Rack">
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField label="Rack Name" type="text" value={rackName} onChange={(e) => setRackName(e.target.value)} required autoFocus />
                <InputField label="RU Height" type="number" value={ruHeight} onChange={(e) => setRuHeight(e.target.value)} required min="1" />
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">Create Rack</button>
                </div>
            </form>
        </Modal>
    );
};

export default NewRackModal;