import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import FolderOptions from './FolderOptions';

const EditUserFolderModal = ({ isOpen, onClose, onSubmit, folder, userFolderTree }) => {
    const [name, setName] = useState('');
    const [prefix, setPrefix] = useState('');
    const [parentId, setParentId] = useState('');

    useEffect(() => {
        if (folder) {
            setName(folder.name || '');
            setPrefix(folder.nomenclature_prefix || '');
            setParentId(folder.parent_id || '');
        }
    }, [folder]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, nomenclature_prefix: prefix || null, parent_id: parentId || null });
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
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Parent Folder (Optional)</label>
                    <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                        <option value="">None (Root Level)</option>
                        <FolderOptions folders={userFolderTree} currentFolderId={folder.id} />
                    </select>
                </div>
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

export default EditUserFolderModal;