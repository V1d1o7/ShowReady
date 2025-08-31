import React, { useState } from 'react';
import Modal from './Modal';
import InputField from './InputField';

const NewShowModal = ({ isOpen, onClose, onSubmit }) => {
    const [inputValue, setInputValue] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onSubmit(inputValue); setInputValue(''); };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Show">
            <form onSubmit={handleSubmit}>
                <InputField label="Enter a name for the new show:" type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} autoFocus />
                <div className="flex justify-end gap-4 mt-6">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">Create</button>
                </div>
            </form>
        </Modal>
    );
};

export default NewShowModal;