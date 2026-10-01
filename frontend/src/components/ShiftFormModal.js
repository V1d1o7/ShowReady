import React, { useState, useEffect, useMemo } from 'react';
import { Trash2, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/api';
import ConfirmationModal from './ConfirmationModal';
import useHotkeys from '../hooks/useHotkeys';

const emptyPosition = () => ({ key: Math.random().toString(36).slice(2), id: null, position: '', required_count: 1, _deleted: false });

// Creates a shift (date/call/end time/label/notes) or edits an existing one, including its
// position headcount lines — the starting point for staffing, since every assignment now
// needs an existing shift + position to fill.
const ShiftFormModal = ({ isOpen, onClose, showId, dateKey, shift, onSaved }) => {
    const isEditing = !!shift;
    const [shiftDate, setShiftDate] = useState('');
    const [callTime, setCallTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [label, setLabel] = useState('');
    const [notes, setNotes] = useState('');
    const [positions, setPositions] = useState([emptyPosition()]);
    const [positionSuggestions, setPositionSuggestions] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    // Guarded on confirmingDelete so Escape closes the delete-confirmation dialog on top
    // first, rather than both it and this form at once (ConfirmationModal has its own
    // escape -> onCancel binding for that top layer).
    useHotkeys({ escape: () => { if (isOpen && !confirmingDelete) onClose(); } });

    useEffect(() => {
        if (!isOpen) return;
        setShiftDate(shift?.shift_date || dateKey || '');
        setCallTime(shift?.call_time ? shift.call_time.slice(0, 5) : '');
        setEndTime(shift?.end_time ? shift.end_time.slice(0, 5) : '');
        setLabel(shift?.label || '');
        setNotes(shift?.notes || '');
        setPositions(
            shift?.positions?.length > 0
                ? shift.positions.map(p => ({ key: p.id, id: p.id, position: p.position, required_count: p.required_count, _deleted: false }))
                : [emptyPosition()]
        );
        setConfirmingDelete(false);

        api.getRoster()
            .then(data => {
                const unique = [...new Set((data || []).map(r => r.position).filter(Boolean))].sort();
                setPositionSuggestions(unique);
            })
            .catch(() => setPositionSuggestions([]));
    }, [isOpen, shift, dateKey]);

    const visiblePositions = useMemo(() => positions.filter(p => !p._deleted), [positions]);

    if (!isOpen) return null;

    const updatePosition = (key, field, value) => {
        setPositions(prev => prev.map(p => (p.key === key ? { ...p, [field]: value } : p)));
    };

    const addPositionRow = () => setPositions(prev => [...prev, emptyPosition()]);

    const removePositionRow = (key) => {
        setPositions(prev => prev
            .map(p => (p.key === key ? { ...p, _deleted: true } : p))
            .filter(p => p.id || !p._deleted)); // a never-saved row just disappears; a saved one stays (flagged) so we know to delete it server-side
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const finalPositions = visiblePositions.filter(p => p.position.trim());
        if (!shiftDate) {
            toast.error('Pick a date for this shift.');
            return;
        }

        setIsSaving(true);
        try {
            const shiftPayload = {
                shift_date: shiftDate,
                call_time: callTime || null,
                end_time: endTime || null,
                label: label || null,
                notes: notes || null,
            };

            if (!isEditing) {
                await api.createShift(showId, {
                    ...shiftPayload,
                    positions: finalPositions.map(p => ({ position: p.position.trim(), required_count: Number(p.required_count) || 1 })),
                });
            } else {
                await api.updateShift(shift.id, shiftPayload);

                const toDelete = positions.filter(p => p.id && p._deleted);
                const toCreate = finalPositions.filter(p => !p.id);
                const toUpdate = finalPositions.filter(p => {
                    if (!p.id) return false;
                    const original = shift.positions.find(op => op.id === p.id);
                    return original && (original.position !== p.position.trim() || original.required_count !== Number(p.required_count));
                });

                await Promise.all([
                    ...toDelete.map(p => api.deleteShiftPosition(shift.id, p.id)),
                    ...toCreate.map(p => api.addShiftPosition(shift.id, { position: p.position.trim(), required_count: Number(p.required_count) || 1 })),
                    ...toUpdate.map(p => api.updateShiftPosition(shift.id, p.id, { position: p.position.trim(), required_count: Number(p.required_count) || 1 })),
                ]);
            }
            toast.success(isEditing ? 'Shift updated' : 'Shift created');
            onSaved();
            onClose();
        } catch (error) {
            console.error('Failed to save shift:', error);
            toast.error(`Failed to save: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        setIsSaving(true);
        try {
            await api.deleteShift(shift.id);
            toast.success('Shift deleted');
            onSaved();
            onClose();
        } catch (error) {
            console.error('Failed to delete shift:', error);
            toast.error(`Failed to delete: ${error.message}`);
        } finally {
            setIsSaving(false);
            setConfirmingDelete(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg shadow-xl border border-gray-700 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-white mb-1">{isEditing ? 'Edit Shift' : 'New Shift'}</h3>
                <p className="text-sm text-gray-500 mb-5">A shift is a call + headcount — staff into it from the shift board once saved.</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Date</label>
                            <input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} required
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Label (optional)</label>
                            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Load-In, Show Call..."
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Call Time</label>
                            <input type="time" value={callTime} onChange={(e) => setCallTime(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">End Time</label>
                            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Notes (optional)</label>
                        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Visible to everyone assigned"
                            className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                    </div>

                    <div className="border-t border-gray-700 pt-4">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-400">Positions Needed</label>
                            <button type="button" onClick={addPositionRow} className="flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300">
                                <Plus size={13} /> Add position
                            </button>
                        </div>
                        <datalist id="position-suggestions">
                            {positionSuggestions.map(p => <option key={p} value={p} />)}
                        </datalist>
                        <div className="space-y-2">
                            {visiblePositions.map(p => (
                                <div key={p.key} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={p.position}
                                        onChange={(e) => updatePosition(p.key, 'position', e.target.value)}
                                        list="position-suggestions"
                                        placeholder="e.g. Hands, Production Head"
                                        className="flex-1 bg-gray-900 border border-gray-600 rounded-md p-2 text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        value={p.required_count}
                                        onChange={(e) => updatePosition(p.key, 'required_count', e.target.value)}
                                        className="w-16 bg-gray-900 border border-gray-600 rounded-md p-2 text-white text-sm text-center focus:ring-2 focus:ring-amber-500 outline-none"
                                    />
                                    <button type="button" onClick={() => removePositionRow(p.key)} className="text-gray-500 hover:text-red-400 flex-shrink-0">
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <div>
                            {isEditing && (
                                <button type="button" onClick={() => setConfirmingDelete(true)} disabled={isSaving} className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 disabled:opacity-50">
                                    <Trash2 size={15} /> Delete Shift
                                </button>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-600 transition-colors">
                                Cancel
                            </button>
                            <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-md font-bold text-black bg-amber-500 hover:bg-amber-400 transition-colors disabled:opacity-50">
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {confirmingDelete && (
                <ConfirmationModal
                    message="Delete this shift? Everyone assigned to it will be unassigned, and any hours-tracker entries it autofilled will be cleared."
                    onConfirm={handleDelete}
                    onCancel={() => setConfirmingDelete(false)}
                />
            )}
        </div>
    );
};

export default ShiftFormModal;
