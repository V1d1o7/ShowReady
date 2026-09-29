import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { SHIFT_STATUS_STYLES, SHIFT_ATTENDANCE_OPTIONS, getShiftDisplayStatus } from './CrewStatusBadge';

const formatLongDate = (dateKey) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

// Add / edit / remove one person's shift on one date. When no `member` is passed
// (adding from the agenda), the user picks from `candidates`.
const ShiftEditModal = ({ isOpen, onClose, dateKey, member, candidates = [], existingShift, onSave, onDelete, onStatusChange, readOnly = false }) => {
    const [selectedId, setSelectedId] = useState('');
    const [callTime, setCallTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSelectedId(member?.id || '');
            setCallTime(existingShift?.call_time ? existingShift.call_time.slice(0, 5) : '');
            setEndTime(existingShift?.end_time ? existingShift.end_time.slice(0, 5) : '');
            setNotes(existingShift?.notes || '');
            setIsSaving(false);
            setIsUpdatingStatus(false);

            const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
            window.addEventListener('keydown', handleEsc);
            return () => window.removeEventListener('keydown', handleEsc);
        }
    }, [isOpen, member, existingShift, onClose]);

    if (!isOpen || !dateKey) return null;

    const target = member || candidates.find(c => c.id === selectedId);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!target) return;
        setIsSaving(true);
        try {
            await onSave(target, dateKey, { call_time: callTime || null, end_time: endTime || null, notes: notes || null });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        setIsSaving(true);
        try {
            await onDelete(target, dateKey);
        } finally {
            setIsSaving(false);
        }
    };

    const handleStatusChange = async (e) => {
        const newStatus = e.target.value;
        setIsUpdatingStatus(true);
        try {
            await onStatusChange(target, dateKey, newStatus);
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md shadow-xl border border-gray-700" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-white">
                    {member ? `${member.roster.first_name} ${member.roster.last_name}` : 'Add to Schedule'}
                </h3>
                <p className="text-sm text-gray-400 mb-5">{formatLongDate(dateKey)}</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!member && (
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Crew Member</label>
                            <select
                                value={selectedId}
                                onChange={(e) => setSelectedId(e.target.value)}
                                disabled={readOnly}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none disabled:opacity-60"
                                autoFocus
                            >
                                <option value="">-- Select --</option>
                                {candidates.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.roster.first_name} {c.roster.last_name}{c.position ? ` (${c.position})` : ''}
                                    </option>
                                ))}
                            </select>
                            {candidates.length === 0 && (
                                <p className="text-xs text-gray-500 mt-1">Everyone on the crew is already scheduled this day.</p>
                            )}
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Call Time (optional)</label>
                            <input
                                type="time"
                                value={callTime}
                                onChange={(e) => setCallTime(e.target.value)}
                                disabled={readOnly}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none disabled:opacity-60"
                                autoFocus={!!member}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">End Time (optional)</label>
                            <input
                                type="time"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                disabled={readOnly}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none disabled:opacity-60"
                            />
                        </div>
                    </div>
                    {existingShift && (
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Attendance</label>
                            <select
                                value={existingShift.status || 'scheduled'}
                                onChange={handleStatusChange}
                                disabled={readOnly || isUpdatingStatus}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none disabled:opacity-60"
                            >
                                {SHIFT_ATTENDANCE_OPTIONS.map(value => (
                                    <option key={value} value={value}>{SHIFT_STATUS_STYLES[value].label}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                {getShiftDisplayStatus(existingShift) === 'completed'
                                    ? 'This date has passed, so it shows as Completed automatically — no need to set that yourself. Only change this to flag a No-Show or Cancellation.'
                                    : 'Saves immediately, separate from the call/end time below. Once this date passes, it shows as Completed automatically unless flagged otherwise.'}
                            </p>
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Notes (optional)</label>
                        <input
                            type="text"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            disabled={readOnly}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none disabled:opacity-60"
                            placeholder="Load-in, show call, strike..."
                        />
                    </div>

                    {readOnly ? (
                        <p className="text-xs text-gray-500">You have view-only access to this show.</p>
                    ) : (
                        <p className="text-xs text-gray-500">Changes here don't send an email.</p>
                    )}

                    <div className="flex items-center justify-between pt-2">
                        <div>
                            {!readOnly && existingShift && (
                                <button type="button" onClick={handleDelete} disabled={isSaving} className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 disabled:opacity-50">
                                    <Trash2 size={15} /> Remove
                                </button>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-600 transition-colors">
                                {readOnly ? 'Close' : 'Cancel'}
                            </button>
                            {!readOnly && (
                                <button
                                    type="submit"
                                    disabled={isSaving || !target}
                                    className="px-4 py-2 rounded-md font-bold text-black bg-amber-500 hover:bg-amber-400 transition-colors disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : 'Save'}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ShiftEditModal;
