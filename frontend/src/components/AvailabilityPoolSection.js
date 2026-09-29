import React, { useState, useMemo, useEffect } from 'react';
import { UserCheck, UserPlus, X, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/api';
import { formatShiftDate, formatShiftsSummary } from './CrewStatusBadge';
import AddToPoolModal from './AddToPoolModal';
import ConfirmationModal from './ConfirmationModal';

const DATE_STATUS_STYLES = {
    available: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    unavailable: 'bg-gray-700/50 text-gray-500 border-gray-600 line-through',
    pending: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
};

// Per-date pills once someone's given a partial answer; otherwise the plain
// "Jan 4, Jan 5" summary is clearer than a wall of identical green pills.
const DatesCell = ({ response }) => {
    const statuses = response.date_statuses || [];
    const isPartial = statuses.length > 0 && new Set(statuses.map(d => d.status)).size > 1;
    if (!isPartial) return <>{formatShiftsSummary(response.shifts)}</>;
    return (
        <div className="flex flex-wrap gap-1">
            {statuses.map(d => (
                <span
                    key={d.shift_date}
                    className={`px-1.5 py-0.5 rounded border text-[11px] ${DATE_STATUS_STYLES[d.status] || DATE_STATUS_STYLES.pending}`}
                    title={d.status}
                >
                    {formatShiftDate(d.shift_date)}
                </span>
            ))}
        </div>
    );
};

const TABS = [
    { key: 'available', label: 'Available', empty: 'No one is currently available and unassigned.' },
    { key: 'pending', label: 'Awaiting response', empty: 'Nobody is waiting on a reply.' },
    { key: 'declined', label: 'Declined', empty: 'No declines.' },
    { key: 'assigned', label: 'Assigned', empty: 'Nobody from this list has been assigned yet.' },
];

const categoryOf = (response) => (response.show_crew_id ? 'assigned' : response.status);

const CLEAR_PRESETS = [
    { key: 'declined', label: 'Declined', match: (r) => categoryOf(r) === 'declined' },
    { key: 'pending', label: 'No response yet', match: (r) => categoryOf(r) === 'pending' },
    { key: 'assigned', label: 'Already assigned', match: (r) => categoryOf(r) === 'assigned' },
];

// The show's running list of availability responses: assign from it, and keep it
// tidy. "Dismiss" only hides a row (undoable) — the response history is kept.
const AvailabilityPoolSection = ({ showId, pool, onChanged, onAssign, canEditShow = true }) => {
    const [activeTab, setActiveTab] = useState('available');
    const [selectedIds, setSelectedIds] = useState([]);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isClearMenuOpen, setIsClearMenuOpen] = useState(false);
    const [confirm, setConfirm] = useState(null);

    const counts = useMemo(() => {
        const result = { available: 0, pending: 0, declined: 0, assigned: 0 };
        pool.forEach(r => { result[categoryOf(r)] += 1; });
        return result;
    }, [pool]);

    const visibleRows = useMemo(() => pool.filter(r => categoryOf(r) === activeTab), [pool, activeTab]);

    // Selection can only ever refer to rows that are still on screen.
    useEffect(() => {
        const visibleIds = new Set(visibleRows.map(r => r.id));
        setSelectedIds(prev => (prev.every(id => visibleIds.has(id)) ? prev : prev.filter(id => visibleIds.has(id))));
    }, [visibleRows]);

    const availableRosterIds = useMemo(
        () => pool.filter(r => categoryOf(r) === 'available').map(r => r.roster_id),
        [pool]
    );

    const dismiss = async (ids, message) => {
        if (ids.length === 0) return;
        try {
            await api.dismissAvailability(showId, ids, true);
            onChanged();
            toast((t) => (
                <span className="flex items-center gap-3">
                    {message}
                    <button
                        className="font-bold text-amber-400 hover:text-amber-300"
                        onClick={async () => {
                            toast.dismiss(t.id);
                            try {
                                await api.dismissAvailability(showId, ids, false);
                                onChanged();
                            } catch (error) {
                                toast.error(`Couldn't undo: ${error.message}`);
                            }
                        }}
                    >
                        Undo
                    </button>
                </span>
            ), { duration: 7000 });
        } catch (error) {
            console.error('Failed to dismiss:', error);
            toast.error(`Failed to clear: ${error.message}`);
        }
    };

    const handleStatusChange = async (response, status) => {
        try {
            await api.updateAvailabilityStatus(response.id, status);
            onChanged();
        } catch (error) {
            console.error('Failed to update status:', error);
            toast.error(`Failed to update: ${error.message}`);
        }
    };

    const handleDismissSelected = () => {
        dismiss(selectedIds, `${selectedIds.length} removed from the list`);
        setSelectedIds([]);
    };

    const handleClearPreset = (preset) => {
        setIsClearMenuOpen(false);
        const ids = pool.filter(preset.match).map(r => r.id);
        dismiss(ids, `Cleared ${ids.length} ${preset.label.toLowerCase()}`);
    };

    const handleClearEverything = () => {
        setIsClearMenuOpen(false);
        setConfirm({
            message: `Clear all ${pool.length} entries from this list, including ${counts.available} available and unassigned? You can undo right after.`,
            onConfirm: () => {
                setConfirm(null);
                dismiss(pool.map(r => r.id), `Cleared ${pool.length} entries`);
            },
        });
    };

    const toggleOne = (id) => setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    const allSelected = visibleRows.length > 0 && selectedIds.length === visibleRows.length;
    const toggleAll = () => setSelectedIds(allSelected ? [] : visibleRows.map(r => r.id));

    return (
        <div className="mt-10">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                    <h2 className="text-lg font-bold text-white mb-1">Available for This Show</h2>
                    <p className="text-sm text-gray-500 max-w-xl">
                        Responses to availability checks for this show (sent from Roster). Assigning someone creates their
                        crew assignment. Clear out what you no longer need once your calls are filled.
                    </p>
                </div>
                {canEditShow && (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 text-white text-sm font-medium rounded-md hover:bg-gray-600 transition-colors"
                    >
                        <UserPlus size={15} /> Add person
                    </button>
                    <div className="relative">
                        <button
                            onClick={() => setIsClearMenuOpen(o => !o)}
                            disabled={pool.length === 0}
                            className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 text-white text-sm font-medium rounded-md hover:bg-gray-600 transition-colors disabled:opacity-50"
                        >
                            Clear <ChevronDown size={14} />
                        </button>
                        {isClearMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsClearMenuOpen(false)} />
                                <div className="absolute right-0 mt-1 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 py-1">
                                    {CLEAR_PRESETS.map(preset => {
                                        const count = pool.filter(preset.match).length;
                                        return (
                                            <button
                                                key={preset.key}
                                                onClick={() => handleClearPreset(preset)}
                                                disabled={count === 0}
                                                className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 disabled:text-gray-600 disabled:hover:bg-transparent"
                                            >
                                                <span>{preset.label}</span>
                                                <span className="text-xs text-gray-500">{count}</span>
                                            </button>
                                        );
                                    })}
                                    <div className="border-t border-gray-700 my-1" />
                                    <button
                                        onClick={handleClearEverything}
                                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700"
                                    >
                                        Everything ({pool.length})
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1 border-b border-gray-700 mb-4">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            activeTab === tab.key
                                ? 'border-amber-500 text-white'
                                : 'border-transparent text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        {tab.label} <span className="ml-1 text-xs text-gray-500">{counts[tab.key]}</span>
                    </button>
                ))}
            </div>

            {selectedIds.length > 0 && (
                <div className="flex items-center gap-4 mb-3 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm">
                    <span className="text-gray-300">{selectedIds.length} selected</span>
                    <button onClick={handleDismissSelected} className="text-amber-400 hover:text-amber-300 font-medium">Remove from list</button>
                    <button onClick={() => setSelectedIds([])} className="text-gray-500 hover:text-gray-300">Deselect</button>
                </div>
            )}

            {visibleRows.length === 0 ? (
                <div className="text-sm text-gray-500 py-6">
                    {pool.length === 0
                        ? 'Nothing here yet. Send an availability check from Roster, or use "Add person" for someone who told you they\'re available.'
                        : TABS.find(t => t.key === activeTab).empty}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-800">
                            <tr>
                                {canEditShow && (
                                    <th className="w-10 px-4 py-3">
                                        <input type="checkbox" className="accent-amber-500" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                                    </th>
                                )}
                                <th className="px-3 py-3 text-left text-sm font-semibold text-white">Name</th>
                                <th className="px-3 py-3 text-left text-sm font-semibold text-white">Call</th>
                                <th className="px-3 py-3 text-left text-sm font-semibold text-white">Dates</th>
                                <th className="px-3 py-3 text-left text-sm font-semibold text-white">Status</th>
                                {canEditShow && <th className="relative py-3 pl-3 pr-4"><span className="sr-only">Actions</span></th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 bg-gray-900">
                            {visibleRows.map(response => {
                                const isAssigned = !!response.show_crew_id;
                                return (
                                    <tr key={response.id} className="hover:bg-gray-800/50 transition-colors">
                                        {canEditShow && (
                                            <td className="px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    className="accent-amber-500"
                                                    checked={selectedIds.includes(response.id)}
                                                    onChange={() => toggleOne(response.id)}
                                                    aria-label={`Select ${response.first_name} ${response.last_name}`}
                                                />
                                            </td>
                                        )}
                                        <td className="px-3 py-3 text-sm font-medium text-white">{response.first_name} {response.last_name}</td>
                                        <td className="px-3 py-3 text-sm text-gray-400">{response.call_name}</td>
                                        <td className="px-3 py-3 text-xs text-gray-400 max-w-xs"><DatesCell response={response} /></td>
                                        <td className="px-3 py-3">
                                            {isAssigned ? (
                                                <span className="text-sm text-blue-400">Assigned</span>
                                            ) : canEditShow ? (
                                                <select
                                                    value={response.status}
                                                    onChange={(e) => handleStatusChange(response, e.target.value)}
                                                    className="bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-sm text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                                    aria-label="Response status"
                                                >
                                                    <option value="pending">Awaiting response</option>
                                                    <option value="available">Available</option>
                                                    <option value="declined">Declined</option>
                                                </select>
                                            ) : (
                                                <span className="text-sm text-gray-400 capitalize">{response.status === 'pending' ? 'Awaiting response' : response.status}</span>
                                            )}
                                        </td>
                                        {canEditShow && (
                                            <td className="py-3 pl-3 pr-4 text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    {!isAssigned && response.status === 'available' && (
                                                        <button
                                                            onClick={() => onAssign(response)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-bold rounded-md hover:bg-emerald-500 transition-colors"
                                                        >
                                                            <UserCheck size={14} /> Assign
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => dismiss([response.id], `${response.first_name} ${response.last_name} removed from the list`)}
                                                        className="text-gray-500 hover:text-red-400 transition-colors"
                                                        title="Remove from list"
                                                    >
                                                        <X size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <AddToPoolModal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                onAdded={() => { setActiveTab('available'); onChanged(); }}
                showId={showId}
                excludeRosterIds={availableRosterIds}
            />
            {confirm && (
                <ConfirmationModal
                    message={confirm.message}
                    onConfirm={confirm.onConfirm}
                    onCancel={() => setConfirm(null)}
                />
            )}
        </div>
    );
};

export default AvailabilityPoolSection;
