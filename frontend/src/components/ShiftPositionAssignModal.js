import React, { useState, useEffect } from 'react';
import { UserCheck, Trash2, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/api';
import { SHIFT_STATUS_STYLES, SHIFT_ATTENDANCE_OPTIONS, formatTimeRange } from './CrewStatusBadge';
import useHotkeys from '../hooks/useHotkeys';
import { getDisplayName } from '../utils/rosterName';

const fullName = (roster) => getDisplayName(roster);

// One assigned person's row: attendance status, an optional override of the shift's own
// call/end time (e.g. called an hour early), and unassign.
const AssignmentRow = ({ assignment, shift, readOnly, onChanged }) => {
    const [editingOverride, setEditingOverride] = useState(false);
    const [callTime, setCallTime] = useState(assignment.call_time ? assignment.call_time.slice(0, 5) : '');
    const [endTime, setEndTime] = useState(assignment.end_time ? assignment.end_time.slice(0, 5) : '');
    const [notes, setNotes] = useState(assignment.notes || '');
    const [busy, setBusy] = useState(false);

    const handleStatusChange = async (e) => {
        setBusy(true);
        try {
            await api.updateShiftAssignmentStatus(assignment.id, e.target.value);
            onChanged();
        } catch (error) {
            toast.error(`Failed to update attendance: ${error.message}`);
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async () => {
        setBusy(true);
        try {
            await api.deleteShiftAssignment(assignment.id);
            toast.success('Removed');
            onChanged();
        } catch (error) {
            toast.error(`Failed to remove: ${error.message}`);
        } finally {
            setBusy(false);
        }
    };

    const handleSaveOverride = async () => {
        setBusy(true);
        try {
            await api.updateShiftAssignment(assignment.id, { call_time: callTime || null, end_time: endTime || null, notes: notes || null });
            setEditingOverride(false);
            onChanged();
        } catch (error) {
            toast.error(`Failed to save: ${error.message}`);
        } finally {
            setBusy(false);
        }
    };

    const effectiveTime = formatTimeRange(assignment.call_time || shift.call_time, assignment.end_time || shift.end_time);

    return (
        <div className="border border-gray-700 rounded-md p-2.5">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{fullName(assignment.roster)}</div>
                    <div className="text-xs text-gray-500">
                        {effectiveTime || 'No call time set'}{assignment.call_time && ' (override)'}
                    </div>
                </div>
                {!readOnly && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <select
                            value={assignment.status || 'scheduled'}
                            onChange={handleStatusChange}
                            disabled={busy}
                            className="bg-gray-900 border border-gray-600 rounded-md px-2 py-1 text-xs text-white"
                        >
                            {SHIFT_ATTENDANCE_OPTIONS.map(v => <option key={v} value={v}>{SHIFT_STATUS_STYLES[v].label}</option>)}
                        </select>
                        <button type="button" onClick={() => setEditingOverride(prev => !prev)} className="text-gray-500 hover:text-amber-400" title="Override call/end time">
                            <Pencil size={14} />
                        </button>
                        <button type="button" onClick={handleRemove} disabled={busy} className="text-gray-500 hover:text-red-400" title="Unassign">
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            </div>
            {editingOverride && (
                <div className="mt-2 pt-2 border-t border-gray-700 grid grid-cols-2 gap-2">
                    <input type="time" value={callTime} onChange={(e) => setCallTime(e.target.value)}
                        className="bg-gray-900 border border-gray-600 rounded-md p-1.5 text-white text-xs" />
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                        className="bg-gray-900 border border-gray-600 rounded-md p-1.5 text-white text-xs" />
                    <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note for this person"
                        className="col-span-2 bg-gray-900 border border-gray-600 rounded-md p-1.5 text-white text-xs" />
                    <div className="col-span-2 flex justify-end gap-3">
                        <button type="button" onClick={() => setEditingOverride(false)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                        <button type="button" onClick={handleSaveOverride} disabled={busy} className="text-xs font-semibold text-amber-400 hover:text-amber-300">Save override</button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Opened by clicking a position pill on the shift board: shows who's currently filling
// that one position on that one shift, and (when editable) lets you assign the next person
// into it. Doubles as the read-only "who's working this" view for viewers.
//
// `presetRoster` is set when opened by dragging a name from GlobalRosterDrawer straight onto
// this position pill — the person is already known, so the picker is replaced with their name.
const ShiftPositionAssignModal = ({ isOpen, onClose, shift, position, readOnly, onChanged, presetRoster }) => {
    const [rosterOptions, setRosterOptions] = useState([]);
    const [selectedRosterId, setSelectedRosterId] = useState('');
    const [positionLabel, setPositionLabel] = useState('');
    const [rateType, setRateType] = useState('hourly');
    const [rate, setRate] = useState(0);
    const [templates, setTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [sendEmail, setSendEmail] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    useHotkeys({ escape: () => { if (isOpen) onClose(); } });

    useEffect(() => {
        if (!isOpen) return;
        setSelectedRosterId(presetRoster?.id || '');
        setPositionLabel(presetRoster?.position || position?.position || '');
        setRateType('hourly');
        setRate(0);
        setSendEmail(true);
        if (!presetRoster) {
            api.getRoster().then(data => setRosterOptions((data || []).filter(r => !r.erased_at))).catch(() => setRosterOptions([]));
        }
        api.getEmailTemplates('CREW').then(data => {
            setTemplates(data || []);
            const def = (data || []).find(t => t.is_default) || (data || [])[0];
            setSelectedTemplateId(def?.id || '');
        }).catch(() => setTemplates([]));
    }, [isOpen, position, presetRoster]);

    if (!isOpen || !shift || !position) return null;

    const activeAssignments = (position.assignments || []).filter(a => a.status !== 'cancelled');
    const assignedRosterIds = new Set(activeAssignments.map(a => a.roster?.id));
    const availableOptions = rosterOptions
        .filter(r => !assignedRosterIds.has(r.id))
        .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
    const isFull = position.filled_count >= position.required_count;

    const handleAssign = async (e) => {
        e.preventDefault();
        if (!selectedRosterId) {
            toast.error("Pick who you're assigning.");
            return;
        }
        setIsSubmitting(true);
        try {
            await api.assignToPosition(shift.id, position.id, {
                roster_id: selectedRosterId,
                position: positionLabel,
                rate_type: rateType,
                hourly_rate: rateType === 'hourly' ? parseFloat(rate) : 0,
                daily_rate: rateType === 'daily' ? parseFloat(rate) : 0,
                template_id: selectedTemplateId || null,
                notify: sendEmail,
            });
            toast.success('Assigned');
            onChanged();
            onClose();
        } catch (error) {
            console.error('Failed to assign:', error);
            toast.error(`Failed to assign: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg shadow-xl border border-gray-700 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-white mb-1">{position.position}</h3>
                <p className="text-sm text-gray-500 mb-5">
                    {shift.label ? `${shift.label} — ` : ''}{shift.shift_date} · {position.filled_count}/{position.required_count} filled
                </p>

                <div className="space-y-2 mb-5">
                    {activeAssignments.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">Nobody assigned yet.</p>
                    ) : (
                        activeAssignments.map(a => (
                            <AssignmentRow key={a.id} assignment={a} shift={shift} readOnly={readOnly} onChanged={onChanged} />
                        ))
                    )}
                </div>

                {!readOnly ? (
                    <form onSubmit={handleAssign} className="border-t border-gray-700 pt-4 space-y-3">
                        {isFull && <p className="text-xs text-amber-400">This position is already fully staffed — assigning another person will overfill it.</p>}
                        {presetRoster ? (
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Crew Member</label>
                                <div className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white">
                                    {getDisplayName(presetRoster)}
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Crew Member</label>
                                <select value={selectedRosterId} onChange={(e) => setSelectedRosterId(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none">
                                    <option value="">-- Select --</option>
                                    {availableOptions.map(r => (
                                        <option key={r.id} value={r.id}>{getDisplayName(r)}{r.position ? ` (${r.position})` : ''}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-400 mb-1">Rate Type</label>
                                <select value={rateType} onChange={(e) => setRateType(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none">
                                    <option value="hourly">Hourly</option>
                                    <option value="daily">Daily</option>
                                </select>
                            </div>
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-400 mb-1">Rate ($)</label>
                                <input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} onFocus={(e) => e.target.select()}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                            </div>
                        </div>
                        <div>
                            <label className="flex items-center gap-2 text-sm text-gray-400 mb-1 cursor-pointer">
                                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="accent-amber-500" />
                                Send confirmation email
                            </label>
                            {sendEmail && (
                                <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none">
                                    {templates.length === 0 && <option value="">No CREW templates set up</option>}
                                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (Default)' : ''}</option>)}
                                </select>
                            )}
                            {!sendEmail && (
                                <p className="text-xs text-gray-500">
                                    No email now — send everyone's assignment confirmation later from the Crew tab once the schedule is set.
                                </p>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-600 transition-colors">Close</button>
                            <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 px-4 py-2 rounded-md font-bold text-black bg-emerald-500 hover:bg-emerald-400 transition-colors disabled:opacity-50">
                                <UserCheck size={16} /> {isSubmitting ? 'Assigning...' : (sendEmail ? 'Assign & Notify' : 'Assign')}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="flex justify-end pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-600 transition-colors">Close</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ShiftPositionAssignModal;
