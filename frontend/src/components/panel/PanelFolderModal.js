import React, { useState } from 'react';
import Modal from '../Modal';
import InputField from '../InputField';
import FolderOptions from '../FolderOptions';

const PanelFolderModal = ({ isOpen, onClose, onCreate, folderTree }) => {
    const [folderName, setFolderName] = useState('');
    const [parentId, setParentId] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onCreate({ name: folderName, parent_id: parentId || null });
        setFolderName('');
        setParentId('');
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="New Panel Folder">
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <InputField label="Folder Name" value={folderName} onChange={(e) => setFolderName(e.target.value)} required autoFocus />
                
                {folderTree && (
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Parent Folder (Optional)</label>
                        <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
                            <option value="">None (Root Level)</option>
                            <FolderOptions folders={folderTree} />
                        </select>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-bold">Cancel</button>
                    <button type="submit" className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400">Create</button>
                </div>
            </form>
        </Modal>
    );
};

export default PanelFolderModal;