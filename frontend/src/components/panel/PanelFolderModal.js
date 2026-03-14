import React, { useState } from 'react';
import Modal from '../Modal';
import InputField from '../InputField';

const PanelFolderModal = ({ isOpen, onClose, onCreate }) => {
    const [folderName, setFolderName] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onCreate(folderName);
        setFolderName('');
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="New Folder">
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <InputField label="Folder Name" value={folderName} onChange={(e) => setFolderName(e.target.value)} required autoFocus />
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                    <button type="submit" className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400">Create</button>
                </div>
            </form>
        </Modal>
    );
};

export default PanelFolderModal;