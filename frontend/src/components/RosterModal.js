import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import useHotkeys from '../hooks/useHotkeys';

const RosterModal = ({ isOpen, onClose, onSubmit, member, customFields, onManageFields }) => {
    const [formData, setFormData] = useState({});

    useHotkeys({
        'escape': onClose,
    });

    useEffect(() => {
        if (member) {
            setFormData(member);
        } else {
            setFormData({});
        }
    }, [member]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCustomFieldChange = (fieldName, value) => {
        setFormData(prev => ({
            ...prev,
            custom_fields: {
                ...prev.custom_fields,
                [fieldName]: value
            }
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
        if (!member) { // Only clear form if it's a new member, not an edit
            setFormData({});
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={member ? "Edit Roster Member" : "Add Roster Member"}>
            <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" name="first_name" placeholder="First Name" value={formData.first_name || ''} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2" />
                        <input type="text" name="last_name" placeholder="Last Name" value={formData.last_name || ''} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2" />
                    </div>
                    <input type="text" name="position" placeholder="Position" value={formData.position || ''} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2" />
                    <input type="email" name="email" placeholder="Email" value={formData.email || ''} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2" />
                    <input type="tel" name="phone_number" placeholder="Phone Number" value={formData.phone_number || ''} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2" />
                    
                    {customFields.map(field => (
                        <div key={field.id}>
                            <label className="text-sm text-gray-400">{field.field_name}</label>
                            <input
                                type={field.field_type === 'number' ? 'number' : 'text'}
                                value={formData.custom_fields ? formData.custom_fields[field.field_name] || '' : ''}
                                onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-md p-2"
                            />
                        </div>
                    ))}
                </div>
                <div className="mt-6 flex justify-end gap-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600">Cancel</button>
                    <button type="submit" className="px-4 py-2 rounded-md bg-amber-500 text-black hover:bg-amber-400">Save</button>
                </div>
            </form>
        </Modal>
    );
};

export default RosterModal;
