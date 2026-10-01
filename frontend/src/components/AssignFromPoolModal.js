import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/api';
import { UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatTimeRange, getFillState, formatFillStatus, FILL_STYLES } from './CrewStatusBadge';
import useHotkeys from '../hooks/useHotkeys';
import { getDisplayName } from '../utils/rosterName';

const formatDateLabel = (dateStr) => {
    const parsed = new Date(`${dateStr}T00:00:00`);
    return isNaN(parsed.getTime()) ? dateStr : parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

// Promotes someone out of the availability pool into one or more of the show's existing
// (already-created) open shift positions — shifts have to exist first now, so this no longer
// invents dated shifts on the fly the way it used to; it just narrows the show's shift board
// down to the dates this person said they're available for.
const AssignFromPoolModal = ({ isOpen, onClose, onAssigned, response, existingCrew, showId }) => {
    const [position, setPosition] = useState('');
    const [rateType, setRateType] = useState('hourly');
    const [rate, setRate] = useState(0);
    const [shifts, setShifts] = useState([]);
    const [selectedPositionIds, setSelectedPositionIds] = useState(() => new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [sendEmail, setSendEmail] = useState(true);
    useHotkeys({ escape: () => { if (isOpen) onClose(); } });

    useEffect(() => {
        if (isOpen) {
            setSendEmail(true);
            api.getEmailTemplates('CREW')
                .then(data => {
                    setTemplates(data || []);
                    const defaultTemplate = (data || []).find(t => t.is_default) || (data || [])[0];
                    setSelectedTemplateId(defaultTemplate?.id || '');
                })
                .catch(() => setTemplates([]));
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && response && showId) {
            const existingRateType = existingCrew?.rate_type || 'hourly';
            setPosition(existingCrew?.position || response.position || '');
            setRateType(existingRateType);
            setRate((existingRateType === 'daily' ? existingCrew?.daily_rate : existingCrew?.hourly_rate) || 0);
            setSelectedPositionIds(new Set());
            api.getShifts(showId).then(data => setShifts(data || [])).catch(() => setShifts([]));
        }
    }, [isOpen, response, existingCrew, showId]);

    const availableDates = useMemo(() => new Set(
        (response?.date_statuses || []).filter(d => d.status === 'available').map(d => d.shift_date)
    ), [response]);

    // Prefer exactly the dates they said yes to. Fall back to every shift on the show when
    // there's no per-date breakdown (e.g. a response from before per-date answers existed).
    const matchingShifts = useMemo(() => {
        if (!response) return [];
        const filtered = response.date_statuses?.length > 0
            ? shifts.filter(s => availableDates.has(s.shift_date))
            : shifts;
        return filtered.slice().sort((a, b) => a.shift_date.localeCompare(b.shift_date));
    }, [shifts, response, availableDates]);

    if (!isOpen || !response) return null;

    const togglePosition = (positionId) => {
        setSelectedPositionIds(prev => {
            const next = new Set(prev);
            if (next.has(positionId)) next.delete(positionId); else next.add(positionId);
            return next;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (selectedPositionIds.size === 0) {
            toast.error("Select at least one shift position to assign.");
            return;
        }

        setIsSubmitting(true);
        try {
            await api.assignFromAvailability(response.id, {
                shift_position_ids: [...selectedPositionIds],
                position,
                rate_type: rateType,
                hourly_rate: rateType === 'hourly' ? parseFloat(rate) : 0,
                daily_rate: rateType === 'daily' ? parseFloat(rate) : 0,
                template_id: selectedTemplateId || null,
                notify: sendEmail,
            });
            toast.success(`${getDisplayName(response)} assigned`);
            if (onAssigned) onAssigned();
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
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl shadow-xl border border-gray-700 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-white mb-1">Assign {getDisplayName(response)}</h3>
                <p className="text-sm text-gray-500 mb-6">
                    {existingCrew
                        ? "Already on this show's crew — pick which positions to fill and this emails them the details."
                        : "Confirming this creates their crew assignment and emails them the details."}
                </p>

                <form onSubmit={handleSubmit}>
                    <div className="flex gap-4">
                        <div className="flex-[2]">
                            <label className="block text-sm font-medium text-gray-400 mb-1">Position on Show</label>
                            <input
                                type="text"
                                value={position}
                                onChange={(e) => setPosition(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                placeholder="e.g. A1, V1, Camera Op"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-400 mb-1">Rate Type</label>
                            <select
                                value={rateType}
                                onChange={(e) => setRateType(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                            >
                                <option value="hourly">Hourly</option>
                                <option value="daily">Daily</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-400 mb-1">Rate ($)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={rate}
                                onChange={(e) => setRate(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="border-t border-gray-700 pt-4 mt-4">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Shift Positions to Fill</label>
                        {matchingShifts.length === 0 ? (
                            <p className="text-sm text-gray-500 italic">
                                No shifts exist yet on the dates they're available for — create one on the Schedule tab first.
                            </p>
                        ) : (
                            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                                {matchingShifts.map(shift => (
                                    <div key={shift.id} className="border border-gray-700 rounded-md p-2.5">
                                        <div className="text-xs font-semibold text-gray-300 mb-1.5">
                                            {formatDateLabel(shift.shift_date)}{shift.label ? ` — ${shift.label}` : ''}
                                            {formatTimeRange(shift.call_time, shift.end_time) && ` · ${formatTimeRange(shift.call_time, shift.end_time)}`}
                                        </div>
                                        <div className="space-y-1">
                                            {(shift.positions || []).map(p => {
                                                const state = getFillState(p.filled_count, p.required_count);
                                                const checked = selectedPositionIds.has(p.id);
                                                return (
                                                    <label key={p.id} className={`flex items-center gap-2 px-2 py-1 rounded-md border cursor-pointer ${checked ? 'border-amber-400 bg-amber-500/10' : 'border-transparent hover:bg-gray-700/40'}`}>
                                                        <input type="checkbox" checked={checked} onChange={() => togglePosition(p.id)} className="accent-amber-500" />
                                                        <span className="text-xs font-bold uppercase tracking-wide w-24 flex-shrink-0">{p.position}</span>
                                                        <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${FILL_STYLES[state]}`}>{formatFillStatus(p.filled_count, p.required_count)}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-gray-700 pt-4 mt-4">
                        <label className="flex items-center gap-2 text-sm text-gray-400 mb-1 cursor-pointer">
                            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="accent-amber-500" />
                            Send confirmation email
                        </label>
                        {sendEmail ? (
                            <select
                                value={selectedTemplateId}
                                onChange={(e) => setSelectedTemplateId(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                            >
                                {templates.length === 0 && <option value="">No CREW templates set up</option>}
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (Default)' : ''}</option>
                                ))}
                            </select>
                        ) : (
                            <p className="text-xs text-gray-500">
                                No email now — send everyone's assignment confirmation later from the Crew tab once the schedule is set.
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 mt-8">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-600 transition-colors">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-4 py-2 rounded-md font-bold text-black bg-emerald-500 hover:bg-emerald-400 transition-colors disabled:opacity-50"
                        >
                            <UserCheck size={16} /> {isSubmitting ? 'Assigning...' : (sendEmail ? 'Assign & Notify' : 'Assign')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AssignFromPoolModal;
