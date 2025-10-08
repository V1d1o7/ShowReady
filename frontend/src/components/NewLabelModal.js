import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import ColorPicker from './ColorPicker';

const NewLabelModal = ({ isOpen, onClose, onSubmit, labelFields, initialData }) => {
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        } else {
            const defaultState = labelFields.reduce((acc, field) => {
                acc[field.name] = field.type === 'color' ? '#FFFFFF' : '';
                return acc;
            }, {});
            setFormData(defaultState);
        }
    }, [isOpen, labelFields, initialData]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleColorChange = (name, color) => {
        setFormData(prev => ({ ...prev, [name]: color }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={initialData ? "Edit Label" : "Add New Label"}>
            <form onSubmit={handleSubmit}>
                {labelFields.map(field => {
                    if (field.type === 'color') {
                        return (
                            <div key={field.name} className="mb-4">
                                <label className="block text-sm font-bold text-gray-300 mb-2">{field.label}</label>
                                <ColorPicker
                                    color={formData[field.name] || '#FFFFFF'}
                                    onChange={(color) => handleColorChange(field.name, color)}
                                />
                            </div>
                        );
                    }
                    if (field.type === 'textarea') {
                        return (
                            <div key={field.name} className="mb-4">
                                <label className="block text-sm font-bold text-gray-300 mb-2">{field.label}</label>
                                <textarea
                                    name={field.name}
                                    value={formData[field.name] || ''}
                                    onChange={handleChange}
                                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    rows="3"
                                />
                            </div>
                        );
                    }
                    return (
                        <InputField
                            key={field.name}
                            label={field.label}
                            type={field.type}
                            name={field.name}
                            value={formData[field.name] || ''}
                            onChange={handleChange}
                            autoFocus={labelFields.indexOf(field) === 0}
                        />
                    );
                })}
                <div className="flex justify-end gap-4 mt-6">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">{initialData ? "Save" : "Create"}</button>
                </div>
            </form>
        </Modal>
    );
};

export default NewLabelModal;