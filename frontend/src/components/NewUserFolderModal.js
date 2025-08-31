import React, { useState } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import FolderOptions from './FolderOptions';

const NewUserFolderModal = ({ isOpen, onClose, onSubmit, userFolderTree }) => {
    const [name, setName] = useState('');
    const [parentId, setParentId] = useState('');
    const [prefix, setPrefix] = useState('');


    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, parent_id: parentId || null, nomenclature_prefix: prefix || null });
        setName('');
        setParentId('');
        setPrefix('');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Folder in Your Library">
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField label="Folder Name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
                <InputField label="Nomenclature Prefix (Optional)" type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g., KVM" />
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Parent Folder (Optional)</label>
                    <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                        <option value="">None (Root Level)</option>
                        <FolderOptions folders={userFolderTree} />
                    </select>
                </div>
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Create</button>
                </div>
            </form>
        </Modal>
    );
};

export default NewUserFolderModal;