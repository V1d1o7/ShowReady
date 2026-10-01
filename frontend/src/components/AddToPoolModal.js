import React, { useState, useEffect } from 'react';
import { api } from '../api/api';
import { UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import ShiftDateListEditor from './ShiftDateListEditor';
import { getDisplayName } from '../utils/rosterName';

// Adds someone straight to the show's available list, e.g. they said yes by text.
// `excludeRosterIds` are people already in the list as available.
const AddToPoolModal = ({ isOpen, onClose, onAdded, showId, excludeRosterIds = [] }) => {
    const [roster, setRoster] = useState([]);
    const [isLoadingRoster, setIsLoadingRoster] = useState(false);
    const [selectedRosterId, setSelectedRosterId] = useState('');
    const [shifts, setShifts] = useState([{ shift_date: '', call_time: '', end_time: '', notes: '' }]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSelectedRosterId('');
            setShifts([{ shift_date: '', call_time: '', end_time: '', notes: '' }]);
            setIsLoadingRoster(true);
            api.getRoster()
                .then(data => setRoster((data || []).filter(m => m.status === 'active' && !m.erased_at)))
                .catch(err => console.error('Failed to fetch roster:', err))
                .finally(() => setIsLoadingRoster(false));

            const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
            window.addEventListener('keydown', handleEsc);
            return () => window.removeEventListener('keydown', handleEsc);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const options = roster
        .filter(m => !excludeRosterIds.includes(m.id))
        .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedRosterId) return;
        setIsSubmitting(true);
        try {
            await api.addToAvailabilityPool(showId, {
                roster_id: selectedRosterId,
                shifts: shifts
                    .filter(s => s.shift_date)
                    .map(s => ({ shift_date: s.shift_date, call_time: s.call_time || null, end_time: s.end_time || null, notes: s.notes || null })),
            });
            toast.success('Added to the available list');
            if (onAdded) onAdded();
            onClose();
        } catch (error) {
            console.error('Failed to add to pool:', error);
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg shadow-xl border border-gray-700 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-white mb-1">Add to Available List</h3>
                <p className="text-sm text-gray-500 mb-6">For someone who told you they're available outside of the email check. No email is sent.</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Person</label>
                        {isLoadingRoster ? (
                            <div className="text-gray-500 text-sm">Loading roster...</div>
                        ) : (
                            <select
                                value={selectedRosterId}
                                onChange={(e) => setSelectedRosterId(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                autoFocus
                            >
                                <option value="">-- Select a member --</option>
                                {options.map(m => (
                                    <option key={m.id} value={m.id}>{getDisplayName(m)}{m.position ? ` (${m.position})` : ''}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <ShiftDateListEditor shifts={shifts} onChange={setShifts} label="Dates They're Available (optional)" />

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-600 transition-colors">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !selectedRosterId}
                            className="flex items-center gap-2 px-4 py-2 rounded-md font-bold text-black bg-amber-500 hover:bg-amber-400 transition-colors disabled:opacity-50"
                        >
                            <UserPlus size={16} /> {isSubmitting ? 'Adding...' : 'Add'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddToPoolModal;
