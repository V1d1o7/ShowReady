import React, { useState } from 'react';
import { X, Plus, Trash2, GripVertical, Check, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/api';
import InputField from './InputField';
import ConfirmationModal from './ConfirmationModal';
import useHotkeys from '../hooks/useHotkeys';

const FIELD_TYPE_LABELS = {
    text: 'Text',
    number: 'Number',
    date: 'Date',
    yesno: 'Yes/No',
    dropdown: 'Dropdown',
};

const SUGGESTED_FIELDS = [
    { label: 'Address', field_type: 'text' },
    { label: 'Shirt Size', field_type: 'text' },
    { label: 'Emergency Contact Name', field_type: 'text' },
    { label: 'Emergency Contact Phone', field_type: 'text' },
];

const CustomFieldManagerDrawer = ({ isOpen, onClose, fields, onFieldsChanged }) => {
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [newType, setNewType] = useState('text');
    const [newOptions, setNewOptions] = useState([]);
    const [optionInput, setOptionInput] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [editingField, setEditingField] = useState(null);
    const [editLabel, setEditLabel] = useState('');
    const [editOptions, setEditOptions] = useState([]);
    const [editOptionInput, setEditOptionInput] = useState('');
    // Guarded on confirmDelete/editingField so Escape closes whichever's open first, not
    // both it and this drawer at once.
    useHotkeys({ escape: () => { if (isOpen && !confirmDelete && !editingField) onClose(); } });

    if (!isOpen) return null;

    const resetAddForm = () => {
        setIsAddOpen(false);
        setNewLabel('');
        setNewType('text');
        setNewOptions([]);
        setOptionInput('');
    };

    const handleAddOption = () => {
        const trimmed = optionInput.trim();
        if (trimmed && !newOptions.includes(trimmed)) {
            setNewOptions([...newOptions, trimmed]);
        }
        setOptionInput('');
    };

    const handleSaveField = async () => {
        if (!newLabel.trim()) {
            toast.error('Field label is required.');
            return;
        }
        if (newType === 'dropdown' && newOptions.length === 0) {
            toast.error('Add at least one dropdown option.');
            return;
        }
        try {
            await api.createRosterCustomField({ label: newLabel.trim(), field_type: newType, options: newOptions });
            toast.success('Custom field added');
            resetAddForm();
            onFieldsChanged();
        } catch (error) {
            toast.error(`Failed to add field: ${error.message}`);
        }
    };

    const handleAddSuggested = async (sugg) => {
        try {
            await api.createRosterCustomField({ label: sugg.label, field_type: sugg.field_type, options: [] });
            toast.success(`${sugg.label} added`);
            onFieldsChanged();
        } catch (error) {
            toast.error(`Failed to add field: ${error.message}`);
        }
    };

    const handleDeleteField = async (field) => {
        try {
            await api.deleteRosterCustomField(field.id);
            toast.success('Custom field deleted');
            onFieldsChanged();
        } catch (error) {
            toast.error(`Failed to delete field: ${error.message}`);
        } finally {
            setConfirmDelete(null);
        }
    };

    const handleStartEdit = (field) => {
        setIsAddOpen(false);
        setEditingField(field);
        setEditLabel(field.label);
        setEditOptions([...(field.options || [])]);
        setEditOptionInput('');
    };

    const handleCancelEdit = () => {
        setEditingField(null);
        setEditLabel('');
        setEditOptions([]);
        setEditOptionInput('');
    };

    const handleAddEditOption = () => {
        const trimmed = editOptionInput.trim();
        if (trimmed && !editOptions.includes(trimmed)) {
            setEditOptions([...editOptions, trimmed]);
        }
        setEditOptionInput('');
    };

    const handleSaveEdit = async () => {
        if (!editLabel.trim()) {
            toast.error('Field label is required.');
            return;
        }
        if (editingField.field_type === 'dropdown' && editOptions.length === 0) {
            toast.error('Add at least one dropdown option.');
            return;
        }
        try {
            await api.updateRosterCustomField(editingField.id, { label: editLabel.trim(), options: editOptions });
            toast.success('Custom field updated');
            handleCancelEdit();
            onFieldsChanged();
        } catch (error) {
            toast.error(`Failed to update field: ${error.message}`);
        }
    };

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black bg-opacity-60" onClick={onClose}></div>
            <div className="absolute top-0 right-0 bottom-0 w-full max-w-md bg-gray-800 border-l border-gray-700 shadow-xl flex flex-col">
                <div className="p-6 border-b border-gray-700">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white">Manage Custom Fields</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
                    </div>
                    <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                        Fields you add here appear on every crew member's profile and can be shown as columns in the roster list.
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                    <div className="pb-4 mb-3 border-b border-gray-700/60">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 px-1 mb-2">Suggested Fields</div>
                        <div className="flex flex-wrap gap-2 px-1">
                            {SUGGESTED_FIELDS.map(sugg => {
                                const existingField = fields.find(f => f.label.toLowerCase() === sugg.label.toLowerCase());
                                return (
                                    <button
                                        key={sugg.label}
                                        onClick={() => existingField ? setConfirmDelete(existingField) : handleAddSuggested(sugg)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                                            existingField
                                                ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400'
                                                : 'bg-transparent border-gray-600 text-gray-400 hover:border-amber-500 hover:text-amber-400'
                                        }`}
                                    >
                                        {existingField ? <Check size={12} /> : <Plus size={12} />}
                                        {sugg.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {fields.length > 0 && (
                        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 px-2 mb-1">Your Fields</div>
                    )}
                    {fields.map(field => (
                        editingField?.id === field.id ? (
                            <div key={field.id} className="mt-1 mb-2 p-4 bg-gray-900 border border-gray-700 rounded-lg space-y-4">
                                <InputField
                                    label="Field Label"
                                    value={editLabel}
                                    onChange={(e) => setEditLabel(e.target.value)}
                                />
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Field Type</label>
                                    <div className="w-full p-2 bg-gray-800/60 border border-gray-700 rounded-lg text-gray-500">
                                        {FIELD_TYPE_LABELS[field.field_type] || field.field_type}
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500">The field type can't be changed once created — delete and re-add it to use a different type.</p>
                                </div>

                                {field.field_type === 'dropdown' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Dropdown Options</label>
                                        <div className="flex flex-wrap gap-1.5 mb-2">
                                            {editOptions.map(opt => (
                                                <span key={opt} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-xs rounded-full bg-gray-700 text-gray-200">
                                                    {opt}
                                                    <button onClick={() => setEditOptions(editOptions.filter(o => o !== opt))} className="text-gray-400 hover:text-white">
                                                        <X size={11} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                value={editOptionInput}
                                                onChange={(e) => setEditOptionInput(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddEditOption(); } }}
                                                placeholder="Add an option..."
                                                className="flex-1 p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                                            />
                                            <button onClick={handleAddEditOption} className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold">Add</button>
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-end gap-3">
                                    <button onClick={handleCancelEdit} className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm">Cancel</button>
                                    <button onClick={handleSaveEdit} className="px-4 py-2 rounded-md bg-amber-500 text-black hover:bg-amber-400 text-sm font-bold">Save Changes</button>
                                </div>
                            </div>
                        ) : (
                            <div key={field.id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-gray-700">
                                <GripVertical size={14} className="text-gray-500 flex-shrink-0" />
                                <div className="flex-1 text-sm font-medium text-white">{field.label}</div>
                                <span className="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-400">{FIELD_TYPE_LABELS[field.field_type] || field.field_type}</span>
                                <button onClick={() => handleStartEdit(field)} className="p-1 text-gray-500 hover:text-amber-400"><Pencil size={14} /></button>
                                <button onClick={() => setConfirmDelete(field)} className="p-1 text-gray-500 hover:text-red-500"><Trash2 size={14} /></button>
                            </div>
                        )
                    ))}

                    {fields.length === 0 && !isAddOpen && (
                        <div className="text-center py-8 text-sm text-gray-500">No custom fields yet.</div>
                    )}

                    {!isAddOpen && !editingField && (
                        <button
                            onClick={() => setIsAddOpen(true)}
                            className="flex items-center justify-center gap-2 w-full mt-3 p-3 border-2 border-dashed border-gray-600 text-gray-400 rounded-lg font-semibold text-sm hover:border-amber-500 hover:text-amber-400 transition-colors"
                        >
                            <Plus size={15} /> Add Custom Field
                        </button>
                    )}

                    {isAddOpen && (
                        <div className="mt-3 p-4 bg-gray-900 border border-gray-700 rounded-lg space-y-4">
                            <InputField
                                label="Field Label"
                                placeholder="e.g. Driver's License #"
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                            />
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Field Type</label>
                                <select
                                    value={newType}
                                    onChange={(e) => setNewType(e.target.value)}
                                    className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                                >
                                    {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>

                            {newType === 'dropdown' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Dropdown Options</label>
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {newOptions.map(opt => (
                                            <span key={opt} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-xs rounded-full bg-gray-700 text-gray-200">
                                                {opt}
                                                <button onClick={() => setNewOptions(newOptions.filter(o => o !== opt))} className="text-gray-400 hover:text-white">
                                                    <X size={11} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            value={optionInput}
                                            onChange={(e) => setOptionInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddOption(); } }}
                                            placeholder="Add an option..."
                                            className="flex-1 p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                                        />
                                        <button onClick={handleAddOption} className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold">Add</button>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-3">
                                <button onClick={resetAddForm} className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm">Cancel</button>
                                <button onClick={handleSaveField} className="px-4 py-2 rounded-md bg-amber-500 text-black hover:bg-amber-400 text-sm font-bold">Save Field</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {confirmDelete && (
                <ConfirmationModal
                    message={`Delete the "${confirmDelete.label}" field? Values already stored under it on crew profiles will no longer be shown.`}
                    onConfirm={() => handleDeleteField(confirmDelete)}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}
        </div>
    );
};

export default CustomFieldManagerDrawer;
