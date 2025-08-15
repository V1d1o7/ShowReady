import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';

const EditFolderModal = ({ isOpen, onClose, onSubmit, folder }) => {
    const [name, setName] = useState('');
    const [prefix, setPrefix] = useState('');

    useEffect(() => {
        if (folder) {
            setName(folder.name || '');
            setPrefix(folder.nomenclature_prefix || '');
        }
    }, [folder]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, nomenclature_prefix: prefix || null });
    };

    if (!folder) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit Folder: ${folder.name}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField 
                    label="Folder Name" 
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    required 
                    autoFocus 
                />
                <InputField 
                    label="Nomenclature Prefix (Optional)" 
                    type="text" 
                    value={prefix} 
                    onChange={(e) => setPrefix(e.target.value)} 
                    placeholder="e.g., KVM" 
                />
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

export default EditFolderModal;