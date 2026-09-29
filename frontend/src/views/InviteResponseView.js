import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/api';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { formatShiftDate, formatTimeRange } from '../components/CrewStatusBadge';
import toast, { Toaster } from 'react-hot-toast';

// The email's Decline button is a one-click backend link — no page involved,
// it just redirects here afterward to show the "declined" state below.
// The Accept button lands here live: this page is the actual per-date picker,
// since a single click can't carry "which dates" for a multi-day call.
const InviteResponseView = () => {
    const { token } = useParams();
    const [invite, setInvite] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selections, setSelections] = useState({}); // shift_date -> boolean
    const [isSaving, setIsSaving] = useState(false);
    const [justSaved, setJustSaved] = useState(false);

    const fetchInvite = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.getPublicAvailability(token);
            setInvite(data);
            const initial = {};
            (data.date_statuses || []).forEach(d => { initial[d.shift_date] = d.status !== 'unavailable'; });
            setSelections(initial);
        } catch (err) {
            setError(err.message || 'This link is invalid.');
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchInvite();
    }, [fetchInvite]);

    const anyChecked = useMemo(() => Object.values(selections).some(Boolean), [selections]);

    const toggleDate = (dateKey) => setSelections(prev => ({ ...prev, [dateKey]: !prev[dateKey] }));

    const handleSubmit = async () => {
        setIsSaving(true);
        try {
            const dates = (invite.shifts || []).map(s => ({ shift_date: s.shift_date, available: !!selections[s.shift_date] }));
            const updated = await api.respondToAvailability(token, dates);
            setInvite(updated);
            setJustSaved(true);
            toast.success('Your availability was saved.');
        } catch (err) {
            toast.error(err.message || 'Failed to save your response.');
        } finally {
            setIsSaving(false);
        }
    };

    const Shell = ({ children }) => (
        <div className="min-h-screen w-full overflow-y-auto bg-gray-900 text-gray-300 flex items-start sm:items-center justify-center p-6">
            <Toaster position="top-center" toastOptions={{ style: { background: '#1F2937', color: '#F9FAFB', border: '1px solid #374151' } }} />
            <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-8 text-center">
                {children}
            </div>
        </div>
    );

    if (isLoading) {
        return <Shell><div className="text-gray-400">Loading...</div></Shell>;
    }

    if (error) {
        return (
            <Shell>
                <AlertTriangle size={40} className="mx-auto text-amber-500 mb-4" />
                <h1 className="text-xl font-bold text-white mb-2">Link Not Found</h1>
                <p className="text-gray-400">{error}</p>
            </Shell>
        );
    }

    if (invite.status === 'declined') {
        return (
            <Shell>
                <XCircle size={40} className="mx-auto text-gray-500 mb-4" />
                <h1 className="text-xl font-bold text-white mb-2">Thanks for Letting Us Know</h1>
                <p className="text-gray-400">
                    We've noted that you're not available for <span className="text-white font-medium">{invite.show_name}</span>.
                </p>
            </Shell>
        );
    }

    if (!invite.shifts || invite.shifts.length === 0) {
        return (
            <Shell>
                <CheckCircle size={40} className="mx-auto text-emerald-400 mb-4" />
                <h1 className="text-xl font-bold text-white mb-2">Thanks{invite.first_name ? `, ${invite.first_name}` : ''}!</h1>
                <p className="text-gray-400">
                    We've marked you as available for <span className="text-white font-medium">{invite.show_name}</span>.
                    We'll follow up if you're selected for the call.
                </p>
            </Shell>
        );
    }

    return (
        <Shell>
            <h1 className="text-xl font-bold text-white mb-1">
                {invite.first_name ? `Hey ${invite.first_name},` : 'Hey there,'}
            </h1>
            <p className="text-gray-400 mb-1">
                Which of these dates work for <span className="text-white font-medium">{invite.show_name}</span>?
            </p>
            <p className="text-xs text-gray-500 mb-5">Uncheck anything you can't do, then save.</p>

            <div className="space-y-2 text-left mb-6">
                {invite.shifts.map(shift => {
                    const checked = !!selections[shift.shift_date];
                    const timeRange = formatTimeRange(shift.call_time, shift.end_time);
                    return (
                        <label
                            key={shift.shift_date}
                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                checked ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-gray-900 border-gray-700'
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleDate(shift.shift_date)}
                                className="mt-0.5 accent-emerald-500"
                            />
                            <span className="flex-1">
                                <span className="block text-white font-medium">{formatShiftDate(shift.shift_date)}</span>
                                {timeRange && <span className="block text-xs text-gray-400">{timeRange}</span>}
                                {shift.notes && <span className="block text-xs text-gray-500 mt-0.5">{shift.notes}</span>}
                            </span>
                        </label>
                    );
                })}
            </div>

            <button
                onClick={handleSubmit}
                disabled={isSaving}
                className="w-full py-2.5 rounded-lg font-bold text-black bg-emerald-500 hover:bg-emerald-400 transition-colors disabled:opacity-50"
            >
                {isSaving ? 'Saving...' : anyChecked ? 'Save My Availability' : "Save — None of These Work"}
            </button>

            {justSaved && (
                <p className="text-xs text-emerald-400 mt-3">
                    Saved — you can come back and change this anytime before you're assigned.
                </p>
            )}
        </Shell>
    );
};

export default InviteResponseView;
