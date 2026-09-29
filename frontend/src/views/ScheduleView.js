import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import { LayoutContext } from '../contexts/LayoutContext';
import { LayoutGrid, List, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';
import ShiftEditModal from '../components/ShiftEditModal';
import { formatCallTime, formatTimeRange, getShiftDisplayStatus } from '../components/CrewStatusBadge';
import toast from 'react-hot-toast';

const VIEW_STORAGE_KEY = 'showready.scheduleView';
const INACTIVE_STATUSES = ['declined', 'cancelled'];

const parseKey = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
};

const formatDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Matches HoursTrackingView's week math so Schedule and Hours agree on where a week starts.
const getWeekStart = (date, startDay) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const distance = (d.getDay() - startDay + 7) % 7;
    d.setDate(d.getDate() - distance);
    return d;
};

// Only the dates that actually have a shift or a pinned planning day —
// deliberately skipped days in between stay out, they aren't gaps to fill in.
const buildDateRange = (keys) => [...new Set(keys)].sort();

const readStoredView = () => {
    try {
        return localStorage.getItem(VIEW_STORAGE_KEY) === 'agenda' ? 'agenda' : 'grid';
    } catch {
        return 'grid';
    }
};

const fullName = (member) => `${member.roster.first_name || ''} ${member.roster.last_name || ''}`.trim();

const SHIFT_BUTTON_CLASSES = {
    scheduled: 'bg-teal-500/15 text-teal-300 border border-teal-500/30 hover:bg-teal-500/25',
    completed: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25',
    no_show: 'bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25',
    cancelled: 'bg-gray-700/40 text-gray-400 border border-gray-600 hover:bg-gray-700/60',
};

const ScheduleView = () => {
    const { setShouldScroll } = useContext(LayoutContext);
    const { showId, canEditShow, showData } = useShow();
    const payPeriodStartDay = showData?.info?.pay_period_start_day || 0;
    const [crew, setCrew] = useState([]);
    const [scheduleDates, setScheduleDates] = useState([]); // persisted "blank" planning days: [{ shift_date, notes }]
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState(readStoredView);
    const [newDate, setNewDate] = useState('');
    const [editing, setEditing] = useState(null); // { dateKey, member (or null when adding from agenda) }

    // Shows can run a week or a whole season — defaults to the current week (same math as
    // the Hours tracker) so it doesn't get unusable once a show has months of shifts, with an
    // opt-in custom range for anything wider.
    const [windowMode, setWindowMode] = useState('week'); // 'week' | 'range'
    const [weekStartDate, setWeekStartDate] = useState(() => getWeekStart(new Date(), payPeriodStartDay));
    const [rangeStart, setRangeStart] = useState('');
    const [rangeEnd, setRangeEnd] = useState('');

    const weekEndDate = useMemo(() => {
        const d = new Date(weekStartDate);
        d.setDate(d.getDate() + 6);
        return d;
    }, [weekStartDate]);

    const windowStartKey = windowMode === 'range' ? rangeStart : formatDateKey(weekStartDate);
    const windowEndKey = windowMode === 'range' ? rangeEnd : formatDateKey(weekEndDate);

    const changeWeek = (direction) => {
        setWeekStartDate(prev => {
            const d = new Date(prev);
            d.setDate(d.getDate() + direction * 7);
            return d;
        });
    };

    const toggleRangeMode = () => {
        if (windowMode === 'week') {
            setRangeStart(formatDateKey(weekStartDate));
            setRangeEnd(formatDateKey(weekEndDate));
            setWindowMode('range');
        } else {
            setWindowMode('week');
        }
    };

    // This view owns a bounded scroll region so the headers can stay pinned.
    useEffect(() => {
        setShouldScroll(false);
    }, [setShouldScroll]);

    const fetchAll = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const [crewData, datesData] = await Promise.all([
                api.getShowCrew(showId),
                api.getScheduleDates(showId),
            ]);
            setCrew(crewData);
            setScheduleDates(datesData);
        } catch (error) {
            console.error('Failed to fetch schedule:', error);
            toast.error(`Failed to load schedule: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [showId]);

    useEffect(() => {
        if (showId) fetchAll();
    }, [showId, fetchAll]);

    const changeView = (next) => {
        setView(next);
        try {
            localStorage.setItem(VIEW_STORAGE_KEY, next);
        } catch {
            // Remembering the view is a convenience only.
        }
    };

    const scheduledCrew = useMemo(
        () => crew.filter(c => !INACTIVE_STATUSES.includes(c.status)),
        [crew]
    );

    const shiftsByMember = useMemo(() => {
        const map = {};
        scheduledCrew.forEach(member => {
            map[member.id] = {};
            (member.shifts || []).forEach(shift => { map[member.id][shift.shift_date] = shift; });
        });
        return map;
    }, [scheduledCrew]);

    const scheduleDateSet = useMemo(() => new Set(scheduleDates.map(d => d.shift_date)), [scheduleDates]);

    const allDateKeys = useMemo(() => {
        const keys = [...scheduleDateSet];
        scheduledCrew.forEach(member => (member.shifts || []).forEach(s => keys.push(s.shift_date)));
        return buildDateRange(keys);
    }, [scheduledCrew, scheduleDateSet]);

    const visibleDateKeys = useMemo(() => {
        if (windowMode === 'range' && (!rangeStart || !rangeEnd)) return allDateKeys;
        return allDateKeys.filter(k => k >= windowStartKey && k <= windowEndKey);
    }, [allDateKeys, windowMode, rangeStart, rangeEnd, windowStartKey, windowEndKey]);

    const groups = useMemo(() => {
        const byPosition = {};
        scheduledCrew.forEach(member => {
            const key = (member.position || '').trim() || 'No position';
            (byPosition[key] = byPosition[key] || []).push(member);
        });
        return Object.keys(byPosition)
            .sort((a, b) => (a === 'No position') - (b === 'No position') || a.localeCompare(b))
            .map(position => ({
                position,
                members: byPosition[position].sort((a, b) => fullName(a).localeCompare(fullName(b))),
            }));
    }, [scheduledCrew]);

    const workingCount = useCallback(
        (dateKey) => scheduledCrew.filter(m => shiftsByMember[m.id]?.[dateKey]).length,
        [scheduledCrew, shiftsByMember]
    );

    const handleAddDate = async () => {
        if (!newDate) return;
        const dateToAdd = newDate;
        setNewDate('');
        try {
            await api.addScheduleDate(showId, dateToAdd);
            await fetchAll(true);
            // Bring the new date into view rather than having it silently land outside
            // the current window and look like nothing happened.
            if (dateToAdd < windowStartKey || dateToAdd > windowEndKey) {
                if (windowMode === 'week') {
                    const [y, m, d] = dateToAdd.split('-').map(Number);
                    setWeekStartDate(getWeekStart(new Date(y, m - 1, d), payPeriodStartDay));
                } else {
                    setRangeStart(prev => (prev && prev <= dateToAdd) ? prev : dateToAdd);
                    setRangeEnd(prev => (prev && prev >= dateToAdd) ? prev : dateToAdd);
                }
            }
        } catch (error) {
            console.error('Failed to add date:', error);
            toast.error(`Failed to add date: ${error.message}`);
        }
    };

    const handleRemoveDate = async (dateKey) => {
        try {
            await api.deleteScheduleDate(showId, dateKey);
            await fetchAll(true);
        } catch (error) {
            console.error('Failed to remove date:', error);
            toast.error(`Failed to remove date: ${error.message}`);
        }
    };

    const handleSave = async (member, dateKey, data) => {
        try {
            await api.upsertCrewShift(member.id, dateKey, data);
            setEditing(null);
            await fetchAll(true);
        } catch (error) {
            console.error('Failed to save shift:', error);
            toast.error(`Failed to save: ${error.message}`);
        }
    };

    const handleDelete = async (member, dateKey) => {
        try {
            await api.deleteCrewShift(member.id, dateKey);
            setEditing(null);
            await fetchAll(true);
        } catch (error) {
            console.error('Failed to remove shift:', error);
            toast.error(`Failed to remove: ${error.message}`);
        }
    };

    const handleStatusChange = async (member, dateKey, status) => {
        try {
            await api.updateCrewShiftStatus(member.id, dateKey, status);
            await fetchAll(true);
        } catch (error) {
            console.error('Failed to update attendance:', error);
            toast.error(`Failed to update attendance: ${error.message}`);
        }
    };

    const editingShift = editing?.member ? shiftsByMember[editing.member.id]?.[editing.dateKey] : null;
    const candidatesForEditing = editing && !editing.member
        ? scheduledCrew.filter(m => !shiftsByMember[m.id]?.[editing.dateKey])
        : [];

    const renderGrid = () => (
        <table className="border-separate border-spacing-0 text-sm">
            <thead>
                <tr>
                    <th className="sticky top-0 left-0 z-30 bg-gray-800 border-b border-r border-gray-700 px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide min-w-[200px]">
                        Crew
                    </th>
                    {visibleDateKeys.map(key => {
                        const date = parseKey(key);
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        const count = workingCount(key);
                        const isRemovableMarker = count === 0 && scheduleDateSet.has(key);
                        return (
                            <th key={key} className={`group sticky top-0 z-20 border-b border-r border-gray-700 px-2 py-2 text-center min-w-[104px] ${isWeekend ? 'bg-gray-700' : 'bg-gray-800'}`}>
                                {isRemovableMarker && canEditShow && (
                                    <button
                                        onClick={() => handleRemoveDate(key)}
                                        title="Remove this planning day"
                                        className="absolute top-1 right-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                                <div className="text-xs font-medium text-gray-400 uppercase">{date.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                                <div className="text-sm font-bold text-white">{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                                <div className={`text-xs mt-0.5 ${count > 0 ? 'text-teal-400' : 'text-gray-600'}`}>{count} working</div>
                            </th>
                        );
                    })}
                </tr>
            </thead>
            <tbody>
                {groups.map(group => (
                    <React.Fragment key={group.position}>
                        <tr>
                            <td className="sticky left-0 z-10 bg-gray-900 border-b border-gray-700 px-4 py-1.5 text-xs font-bold text-amber-400 uppercase tracking-wide">
                                {group.position}
                            </td>
                            <td colSpan={visibleDateKeys.length} className="bg-gray-900 border-b border-gray-700" />
                        </tr>
                        {group.members.map(member => (
                            <tr key={member.id} className="group">
                                <td className="sticky left-0 z-10 bg-gray-900 border-b border-r border-gray-800 px-4 py-2 text-white font-medium whitespace-nowrap">
                                    {fullName(member)}
                                </td>
                                {visibleDateKeys.map(key => {
                                    const shift = shiftsByMember[member.id]?.[key];
                                    // Viewers can open a cell to see an existing shift's details, but
                                    // there's nothing to view on an empty cell, so it's inert for them.
                                    if (!shift && !canEditShow) {
                                        return <td key={key} className="border-b border-r border-gray-800 p-1 text-center" />;
                                    }
                                    const displayStatus = shift ? getShiftDisplayStatus(shift) : null;
                                    const shiftLabel = displayStatus === 'no_show'
                                        ? 'No-Show'
                                        : displayStatus === 'cancelled'
                                            ? 'Cancelled'
                                            : (formatCallTime(shift?.call_time) || 'Working');
                                    return (
                                        <td key={key} className="border-b border-r border-gray-800 p-1 text-center">
                                            <button
                                                onClick={() => setEditing({ dateKey: key, member })}
                                                title={shift ? [formatTimeRange(shift.call_time, shift.end_time), shift.notes].filter(Boolean).join(' — ') || undefined : undefined}
                                                className={`w-full h-9 rounded-md text-xs font-semibold transition-colors ${
                                                    shift
                                                        ? SHIFT_BUTTON_CLASSES[displayStatus] || SHIFT_BUTTON_CLASSES.scheduled
                                                        : 'text-transparent hover:text-gray-500 hover:bg-gray-800'
                                                }`}
                                            >
                                                {shift ? shiftLabel : '+'}
                                                {shift?.notes && <span className="ml-1 text-teal-500">•</span>}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </React.Fragment>
                ))}
            </tbody>
        </table>
    );

    const renderAgenda = () => {
        const unscheduled = scheduledCrew.filter(m => Object.keys(shiftsByMember[m.id] || {}).length === 0);
        // Agenda lists only days that have someone working, or were pinned for planning.
        const agendaDates = visibleDateKeys.filter(key => workingCount(key) > 0 || scheduleDateSet.has(key));

        return (
            <div className="space-y-4 max-w-3xl">
                {agendaDates.map(key => {
                    const date = parseKey(key);
                    const working = scheduledCrew
                        .filter(m => shiftsByMember[m.id]?.[key])
                        .sort((a, b) => {
                            const ta = shiftsByMember[a.id][key].call_time || '99:99';
                            const tb = shiftsByMember[b.id][key].call_time || '99:99';
                            return ta.localeCompare(tb) || fullName(a).localeCompare(fullName(b));
                        });
                    return (
                        <div key={key} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
                                <div>
                                    <span className="text-white font-bold">
                                        {date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                                    </span>
                                    <span className="ml-3 text-sm text-teal-400">{working.length} working</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    {canEditShow && (
                                        <button
                                            onClick={() => setEditing({ dateKey: key, member: null })}
                                            className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300"
                                        >
                                            <Plus size={14} /> Add person
                                        </button>
                                    )}
                                    {canEditShow && working.length === 0 && scheduleDateSet.has(key) && (
                                        <button
                                            onClick={() => handleRemoveDate(key)}
                                            className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-400"
                                        >
                                            <X size={14} /> Remove day
                                        </button>
                                    )}
                                </div>
                            </div>
                            {working.length === 0 ? (
                                <div className="px-5 py-4 text-sm text-gray-500">No one scheduled yet.</div>
                            ) : (
                                <ul className="divide-y divide-gray-700/60">
                                    {working.map(member => {
                                        const shift = shiftsByMember[member.id][key];
                                        return (
                                            <li key={member.id}>
                                                <button
                                                    onClick={() => setEditing({ dateKey: key, member })}
                                                    className="w-full flex items-center gap-4 px-5 py-2.5 text-left hover:bg-gray-700/40 transition-colors"
                                                >
                                                    {(() => {
                                                        const displayStatus = getShiftDisplayStatus(shift);
                                                        return (
                                                            <span className={`w-32 text-sm font-semibold ${displayStatus === 'no_show' ? 'text-rose-400' : displayStatus === 'cancelled' ? 'text-gray-500' : 'text-teal-300'}`}>
                                                                {displayStatus === 'no_show' ? 'No-Show' : displayStatus === 'cancelled' ? 'Cancelled' : (formatTimeRange(shift.call_time, shift.end_time) || 'Working')}
                                                            </span>
                                                        );
                                                    })()}
                                                    <span className="flex-1 text-white font-medium">{fullName(member)}</span>
                                                    <span className="text-sm text-gray-400">{member.position || ''}</span>
                                                    {shift.notes && <span className="text-xs text-gray-500 max-w-[14rem] truncate">{shift.notes}</span>}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    );
                })}

                {unscheduled.length > 0 && (
                    <div className="bg-gray-800/50 border border-gray-700 rounded-xl px-5 py-4">
                        <div className="text-sm font-bold text-gray-400 mb-2">On the crew, not scheduled on any day</div>
                        <div className="flex flex-wrap gap-2">
                            {unscheduled.map(member => (
                                <span key={member.id} className="px-2.5 py-1 rounded-full bg-gray-700 text-sm text-gray-300">
                                    {fullName(member)}{member.position ? ` · ${member.position}` : ''}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col">
            <header className="flex-shrink-0 flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-gray-700">
                <h1 className="text-2xl font-bold text-white">Schedule</h1>
                <div className="flex flex-wrap items-center gap-3">
                    {windowMode === 'week' ? (
                        <div className="flex items-center gap-1">
                            <button onClick={() => changeWeek(-1)} className="p-1.5 rounded-md hover:bg-gray-700 text-gray-300" title="Previous week"><ChevronLeft size={18} /></button>
                            <span className="text-sm font-medium text-white whitespace-nowrap px-1">
                                {weekStartDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {weekEndDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                            <button onClick={() => changeWeek(1)} className="p-1.5 rounded-md hover:bg-gray-700 text-gray-300" title="Next week"><ChevronRight size={18} /></button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={rangeStart}
                                onChange={(e) => setRangeStart(e.target.value)}
                                className="bg-gray-900 border border-gray-600 rounded-md p-2 text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                            <span className="text-gray-500 text-sm">to</span>
                            <input
                                type="date"
                                value={rangeEnd}
                                onChange={(e) => setRangeEnd(e.target.value)}
                                className="bg-gray-900 border border-gray-600 rounded-md p-2 text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                        </div>
                    )}
                    <button onClick={toggleRangeMode} className="text-xs font-semibold text-amber-400 hover:text-amber-300 whitespace-nowrap">
                        {windowMode === 'week' ? 'Custom Range' : 'Back to Week'}
                    </button>
                    {canEditShow && (
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={newDate}
                                onChange={(e) => setNewDate(e.target.value)}
                                className="bg-gray-900 border border-gray-600 rounded-md p-2 text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                            <button
                                onClick={handleAddDate}
                                disabled={!newDate}
                                className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 text-white text-sm font-medium rounded-md hover:bg-gray-600 transition-colors disabled:opacity-50"
                            >
                                <Plus size={14} /> Add day
                            </button>
                        </div>
                    )}
                    <div className="flex bg-gray-800 border border-gray-700 rounded-lg p-1">
                        <button
                            onClick={() => changeView('grid')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${view === 'grid' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            <LayoutGrid size={15} /> Grid
                        </button>
                        <button
                            onClick={() => changeView('agenda')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${view === 'agenda' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            <List size={15} /> Agenda
                        </button>
                    </div>
                </div>
            </header>

            <div className="flex-1 min-h-0 overflow-auto mt-6">
                {isLoading ? (
                    <div className="text-center text-gray-500">Loading schedule...</div>
                ) : visibleDateKeys.length === 0 && allDateKeys.length > 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        {windowMode === 'week' ? (
                            <>No shifts this week. This show has shifts outside it — use <button onClick={toggleRangeMode} className="text-amber-400 hover:text-amber-300 font-semibold">Custom Range</button> to see them.</>
                        ) : (
                            <>No shifts in this range. Try widening the dates above.</>
                        )}
                    </div>
                ) : allDateKeys.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        {!canEditShow
                            ? 'No dates scheduled yet.'
                            : scheduledCrew.length === 0
                                ? 'No crew on this show yet. Assign people from the Crew tab, or pick a date above to start planning.'
                                : 'No dates scheduled yet. Pick a date above and click "Add day" to start building the schedule.'}
                    </div>
                ) : view === 'grid' ? renderGrid() : renderAgenda()}
            </div>

            <ShiftEditModal
                isOpen={!!editing}
                onClose={() => setEditing(null)}
                dateKey={editing?.dateKey}
                member={editing?.member}
                candidates={candidatesForEditing}
                existingShift={editingShift}
                onSave={handleSave}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
                readOnly={!canEditShow}
            />
        </div>
    );
};

export default ScheduleView;
