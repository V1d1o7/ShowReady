import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import useHotkeys from '../hooks/useHotkeys';
import InputField from './InputField';
import MultiSelect from './MultiSelect';

const EMPTY_FORM = {
    first_name: '',
    last_name: '',
    preferred_first_name: '',
    preferred_last_name: '',
    pronouns: '',
    position: '',
    email: '',
    phone_number: '',
    tags: [],
    status: 'active',
    custom_fields: {},
};

const RosterModal = ({ isOpen, onClose, onSubmit, member, allTags, customFieldDefs = [] }) => {
    const [formData, setFormData] = useState({});
    const firstNameRef = useRef(null);

    useHotkeys({
        'escape': onClose,
    });

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                firstNameRef.current?.focus();
            }, 50);
        }
    }, [isOpen]);

    useEffect(() => {
        if (member) {
            setFormData({
                ...EMPTY_FORM,
                ...member,
                tags: member.tags || [],
                custom_fields: member.custom_fields || {},
            });
        } else {
            setFormData(EMPTY_FORM);
        }
    }, [member, isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleTagsChange = (newTags) => {
        setFormData(prev => ({ ...prev, tags: newTags }));
    };

    const handleCustomFieldChange = (key, value) => {
        setFormData(prev => ({ ...prev, custom_fields: { ...(prev.custom_fields || {}), [key]: value } }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    const tagOptions = Array.isArray(allTags) ? allTags.map(tag => ({ value: tag, label: tag })) : [];

    if (member?.erased_at) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Personal Data Erased">
                <p className="text-gray-300 text-sm">
                    This crew member's personal data was erased on {new Date(member.erased_at).toLocaleDateString()} and can no longer be edited.
                    Their show assignment and pay history remain intact.
                </p>
                <div className="mt-6 flex justify-end">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600">Close</button>
                </div>
            </Modal>
        );
    }

    const renderCustomFieldInput = (def) => {
        const value = formData.custom_fields?.[def.key] ?? (def.field_type === 'yesno' ? false : '');

        if (def.field_type === 'yesno') {
            return (
                <label key={def.id} className="flex items-center gap-2 text-sm text-gray-300 mt-1">
                    <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => handleCustomFieldChange(def.key, e.target.checked)}
                        className="w-4 h-4 rounded accent-amber-500"
                    />
                    {def.label}
                </label>
            );
        }

        if (def.field_type === 'dropdown') {
            return (
                <div key={def.id}>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">{def.label}</label>
                    <select
                        value={value}
                        onChange={(e) => handleCustomFieldChange(def.key, e.target.value)}
                        className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                    >
                        <option value="">Select...</option>
                        {(def.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </div>
            );
        }

        const inputType = def.field_type === 'number' ? 'number' : def.field_type === 'date' ? 'date' : 'text';
        return (
            <InputField
                key={def.id}
                label={def.label}
                type={inputType}
                value={value}
                onChange={(e) => handleCustomFieldChange(def.key, e.target.value)}
            />
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={member ? "Edit Crew Profile" : "Add Roster Member"} maxWidth="max-w-2xl">
            <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Basic Info</h3>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InputField
                                ref={firstNameRef}
                                name="first_name"
                                placeholder="First Name"
                                value={formData.first_name || ''}
                                onChange={handleChange}
                            />
                            <InputField name="last_name" placeholder="Last Name" value={formData.last_name || ''} onChange={handleChange} />
                        </div>
                        <div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InputField name="preferred_first_name" placeholder="Preferred First Name" value={formData.preferred_first_name || ''} onChange={handleChange} />
                                <InputField name="preferred_last_name" placeholder="Preferred Last Name" value={formData.preferred_last_name || ''} onChange={handleChange} />
                            </div>
                            <p className="text-xs text-gray-500 mt-1.5">Leave blank to use the legal name above. When set, this name is used everywhere instead.</p>
                        </div>
                        <InputField name="pronouns" placeholder="Pronouns (e.g. she/her, they/them)" value={formData.pronouns || ''} onChange={handleChange} />
                        <InputField name="position" placeholder="Position" value={formData.position || ''} onChange={handleChange} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InputField type="email" name="email" placeholder="Email" value={formData.email || ''} onChange={handleChange} />
                            <InputField type="tel" name="phone_number" placeholder="Phone Number" value={formData.phone_number || ''} onChange={handleChange} />
                        </div>
                        <MultiSelect
                            label="Tags"
                            options={tagOptions}
                            value={formData.tags || []}
                            onChange={handleTagsChange}
                            isCreatable={true}
                            placeholder="Select or type to create tags..."
                        />
                        {member && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Status</label>
                                <select
                                    name="status"
                                    value={formData.status || 'active'}
                                    onChange={handleChange}
                                    className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                {customFieldDefs.length > 0 && (
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Custom Fields</h3>
                        <div className="space-y-4">
                            {customFieldDefs.map(renderCustomFieldInput)}
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-4 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600">Cancel</button>
                    <button type="submit" className="px-4 py-2 rounded-md bg-amber-500 text-black hover:bg-amber-400">Save</button>
                </div>
            </form>
        </Modal>
    );
};

export default RosterModal;
