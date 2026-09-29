import React, { useState, useEffect } from 'react';
import { api } from '../api/api';
import { UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import ShiftDateListEditor from './ShiftDateListEditor';

const AssignFromPoolModal = ({ isOpen, onClose, onAssigned, response, existingCrew }) => {
    const [position, setPosition] = useState('');
    const [rateType, setRateType] = useState('hourly');
    const [rate, setRate] = useState(0);
    const [shifts, setShifts] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');

    useEffect(() => {
        if (isOpen) {
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
        if (isOpen && response) {
            const existingRateType = existingCrew?.rate_type || 'hourly';
            setPosition(existingCrew?.position || response.position || '');
            setRateType(existingRateType);
            setRate((existingRateType === 'daily' ? existingCrew?.daily_rate : existingCrew?.hourly_rate) || 0);

            // Prefer exactly the dates they said yes to. Fall back to the full
            // candidate list when there's no per-date breakdown (e.g. a response
            // from before per-date answers existed).
            const availableDates = new Set(
                (response.date_statuses || []).filter(d => d.status === 'available').map(d => d.shift_date)
            );
            const candidateShifts = response.date_statuses?.length > 0
                ? (response.shifts || []).filter(s => availableDates.has(s.shift_date))
                : (response.shifts || []);

            setShifts(
                candidateShifts.length > 0
                    ? candidateShifts.map(s => ({ shift_date: s.shift_date, call_time: s.call_time || '', end_time: s.end_time || '', notes: s.notes || '' }))
                    : [{ shift_date: '', call_time: '', end_time: '', notes: '' }]
            );
        }
    }, [isOpen, response, existingCrew]);

    if (!isOpen || !response) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        const validShifts = shifts
            .filter(s => s.shift_date)
            .map(s => ({ shift_date: s.shift_date, call_time: s.call_time || null, end_time: s.end_time || null, notes: s.notes || null }));

        if (validShifts.length === 0) {
            toast.error("Select at least one date to assign.");
            return;
        }

        setIsSubmitting(true);
        try {
            await api.assignFromAvailability(response.id, {
                shifts: validShifts,
                position,
                rate_type: rateType,
                hourly_rate: rateType === 'hourly' ? parseFloat(rate) : 0,
                daily_rate: rateType === 'daily' ? parseFloat(rate) : 0,
                template_id: selectedTemplateId || null,
            });
            toast.success(`${response.first_name} ${response.last_name} assigned`);
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
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg shadow-xl border border-gray-700 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-white mb-1">Assign {response.first_name} {response.last_name}</h3>
                <p className="text-sm text-gray-500 mb-6">
                    {existingCrew
                        ? "Already on this show's crew — this adds these dates to their existing assignment and emails them the details."
                        : "Confirming this creates their crew assignment and emails them the details."}
                </p>

                <form onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Position on Show</label>
                            <input
                                type="text"
                                value={position}
                                onChange={(e) => setPosition(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                placeholder="e.g. A1, V1, Camera Op"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
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
                            <div>
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
                    </div>

                    <div className="border-t border-gray-700 pt-4 mt-4">
                        <ShiftDateListEditor shifts={shifts} onChange={setShifts} label="Dates to Assign" />
                        <p className="text-xs text-gray-500 mt-2">Pre-filled from the dates they said they're available for — remove any you don't need.</p>
                    </div>

                    <div className="border-t border-gray-700 pt-4 mt-4">
                        <label className="block text-sm font-medium text-gray-400 mb-1">Confirmation Email Template</label>
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
                            <UserCheck size={16} /> {isSubmitting ? 'Assigning...' : 'Assign & Notify'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AssignFromPoolModal;
