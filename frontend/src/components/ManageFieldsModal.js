import React, { useState } from 'react';
import Modal from './Modal';
import { api } from '../api/api';

const ManageFieldsModal = ({ isOpen, onClose, customFields, onUpdate }) => {
    const [newFieldName, setNewFieldName] = useState('');
    const [newFieldType, setNewFieldType] = useState('text');

    const handleAddField = async () => {
        if (!newFieldName) return;
        await api.createCustomRosterField({ field_name: newFieldName, field_type: newFieldType });
        setNewFieldName('');
        onUpdate();
    };

    const handleDeleteField = async (fieldId) => {
        await api.deleteCustomRosterField(fieldId);
        onUpdate();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Manage Custom Fields">
            <div className="space-y-4">
                <div>
                    <h4 className="font-bold mb-2">Existing Fields</h4>
                    <ul>
                        {customFields.map(field => (
                            <li key={field.id} className="flex justify-between items-center py-1">
                                <span>{field.field_name} ({field.field_type})</span>
                                <button onClick={() => handleDeleteField(field.id)} className="text-red-500 hover:text-red-400">Delete</button>
                            </li>
                        ))}
                    </ul>
                </div>
                <div>
                    <h4 className="font-bold mb-2">Add New Field</h4>
                    <div className="flex gap-2">
                        <input type="text" value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} placeholder="Field Name" className="flex-grow bg-gray-800 border border-gray-700 rounded-md p-2" />
                        <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-md p-2">
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                        </select>
                        <button onClick={handleAddField} className="px-4 py-2 rounded-md bg-amber-500 text-black">Add</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default ManageFieldsModal;
