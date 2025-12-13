import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import useHotkeys from '../hooks/useHotkeys';
import InputField from './InputField';
import MultiSelect from './MultiSelect';

const RosterModal = ({ isOpen, onClose, onSubmit, member, allTags }) => {
    const [formData, setFormData] = useState({});

    useHotkeys({
        'escape': onClose,
    });

    useEffect(() => {
        if (member) {
            setFormData({
                ...member,
                tags: member.tags || []
            });
        } else {
            setFormData({
                first_name: '',
                last_name: '',
                position: '',
                email: '',
                phone_number: '',
                tags: []
            });
        }
    }, [member, isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleTagsChange = (selectedTags) => {
        setFormData(prev => ({ ...prev, tags: selectedTags }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    // Safeguard against undefined prop
    const tagOptions = Array.isArray(allTags) ? allTags.map(tag => ({ value: tag, label: tag })) : [];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={member ? "Edit Roster Member" : "Add Roster Member"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InputField name="first_name" placeholder="First Name" value={formData.first_name || ''} onChange={handleChange} />
                    <InputField name="last_name" placeholder="Last Name" value={formData.last_name || ''} onChange={handleChange} />
                </div>
                <InputField name="position" placeholder="Position" value={formData.position || ''} onChange={handleChange} />
                <InputField type="email" name="email" placeholder="Email" value={formData.email || ''} onChange={handleChange} />
                <InputField type="tel" name="phone_number" placeholder="Phone Number" value={formData.phone_number || ''} onChange={handleChange} />
                
                <MultiSelect
                    label="Tags"
                    options={tagOptions}
                    value={formData.tags || []}
                    onChange={handleTagsChange}
                    isCreatable={true}
                />
                
                <div className="mt-6 flex justify-end gap-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600">Cancel</button>
                    <button type="submit" className="px-4 py-2 rounded-md bg-amber-500 text-black hover:bg-amber-400">Save</button>
                </div>
            </form>
        </Modal>
    );
};

export default RosterModal;
