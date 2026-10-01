import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import { LayoutContext } from '../contexts/LayoutContext';
import { Plus, X, ChevronLeft, ChevronRight, Mail } from 'lucide-react';
import ShiftBoard from '../components/ShiftBoard';
import ShiftFormModal from '../components/ShiftFormModal';
import ShiftPositionAssignModal from '../components/ShiftPositionAssignModal';
import EmailComposeModal from '../components/EmailComposeModal';
import useHotkeys from '../hooks/useHotkeys';
import toast from 'react-hot-toast';

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

// Native date inputs already apply on change here — Enter has nothing left to "submit" but
// stays focused otherwise, which blocks keyboard shortcuts until the user clicks away.
const blurOnEnter = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
    }
};

const ScheduleView = () => {
    const { setShouldScroll } = useContext(LayoutContext);
    const { showId, canEditShow, showData } = useShow();
    const payPeriodStartDay = showData?.info?.pay_period_start_day || 0;
    const [shifts, setShifts] = useState([]);
    const [scheduleDates, setScheduleDates] = useState([]); // persisted "blank" planning days: [{ shift_date, notes }]
    const [isLoading, setIsLoading] = useState(true);
    const [newDate, setNewDate] = useState('');
    const [formModal, setFormModal] = useState(null); // { shift, dateKey }
    const [assignModal, setAssignModal] = useState(null); // { shift, position }
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [emailRecipients, setEmailRecipients] = useState([]);

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
            const [shiftsData, datesData] = await Promise.all([
                api.getShifts(showId),
                api.getScheduleDates(showId),
            ]);
            setShifts(shiftsData || []);
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

    const shiftsByDate = useMemo(() => {
        const map = {};
        shifts.forEach(shift => { (map[shift.shift_date] = map[shift.shift_date] || []).push(shift); });
        return map;
    }, [shifts]);

    const scheduleDateSet = useMemo(() => new Set(scheduleDates.map(d => d.shift_date)), [scheduleDates]);

    const allDateKeys = useMemo(
        () => buildDateRange([...scheduleDateSet, ...shifts.map(s => s.shift_date)]),
        [shifts, scheduleDateSet]
    );

    const visibleDateKeys = useMemo(() => {
        if (windowMode === 'range' && (!rangeStart || !rangeEnd)) return allDateKeys;
        return allDateKeys.filter(k => k >= windowStartKey && k <= windowEndKey);
    }, [allDateKeys, windowMode, rangeStart, rangeEnd, windowStartKey, windowEndKey]);

    const handleAddDate = async () => {
        if (!newDate) return;
        const dateToAdd = newDate;
        setNewDate('');
        try {
            await api.addScheduleDate(showId, dateToAdd);
            await fetchAll(true);
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

    const removableDateKeys = useMemo(
        () => new Set(visibleDateKeys.filter(k => scheduleDateSet.has(k) && !(shiftsByDate[k]?.length))),
        [visibleDateKeys, scheduleDateSet, shiftsByDate]
    );

    // Sends everyone currently confirmed and on at least one shift their assignment
    // confirmation in one batch — e.g. after building out the whole schedule with "Send
    // confirmation email" turned off, then sending it all at once when the schedule is set.
    // Reuses the same CREW-category composer/template as the Crew tab's bulk email.
    const handleNotifyAll = async () => {
        try {
            const crew = await api.getShowCrew(showId);
            const recipients = (crew || []).filter(c => c.status === 'confirmed' && (c.shifts || []).length > 0);
            if (recipients.length === 0) {
                toast.error('No confirmed crew with shifts to notify yet.');
                return;
            }
            setEmailRecipients(recipients);
            setIsEmailModalOpen(true);
        } catch (error) {
            console.error('Failed to load crew:', error);
            toast.error(`Failed to load crew: ${error.message}`);
        }
    };

    useHotkeys({
        n: () => {
            if (canEditShow && !formModal && !assignModal && !isEmailModalOpen) {
                setFormModal({ shift: null, dateKey: null });
            }
        },
    });

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
                            <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} onKeyDown={blurOnEnter}
                                className="bg-gray-900 border border-gray-600 rounded-md p-2 text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                            <span className="text-gray-500 text-sm">to</span>
                            <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} onKeyDown={blurOnEnter}
                                className="bg-gray-900 border border-gray-600 rounded-md p-2 text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
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
                                onKeyDown={(e) => {
                                    if (e.key !== 'Enter') return;
                                    e.preventDefault();
                                    if (newDate) handleAddDate();
                                    e.currentTarget.blur();
                                }}
                                className="bg-gray-900 border border-gray-600 rounded-md p-2 text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                            <button onClick={handleAddDate} disabled={!newDate}
                                className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 text-white text-sm font-medium rounded-md hover:bg-gray-600 transition-colors disabled:opacity-50">
                                <Plus size={14} /> Pin day
                            </button>
                        </div>
                    )}
                    {canEditShow && (
                        <button onClick={handleNotifyAll} title="Email everyone currently confirmed and scheduled their assignment confirmation"
                            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors">
                            <Mail size={14} /> Send Assignment Emails
                        </button>
                    )}
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
                            ? 'No shifts scheduled yet.'
                            : 'No shifts yet. Pick a date above and click "Pin day" to start planning, or add a shift once a day is pinned.'}
                    </div>
                ) : (
                    <>
                        <ShiftBoard
                            dateKeys={visibleDateKeys}
                            shiftsByDate={shiftsByDate}
                            canEdit={canEditShow}
                            onAddShift={(dateKey) => setFormModal({ shift: null, dateKey })}
                            onEditShift={(shift) => setFormModal({ shift, dateKey: shift.shift_date })}
                            onAssignPosition={(shift, position) => setAssignModal({ shift, position })}
                        />
                        {canEditShow && removableDateKeys.size > 0 && (
                            <div className="mt-6 pt-4 border-t border-gray-800 flex flex-wrap gap-2">
                                <span className="text-xs text-gray-500 mr-1">Pinned, still empty:</span>
                                {[...removableDateKeys].map(key => (
                                    <button key={key} onClick={() => handleRemoveDate(key)}
                                        className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-800 border border-gray-700 text-xs text-gray-400 hover:text-red-400 hover:border-red-400/50">
                                        {key} <X size={11} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            <ShiftFormModal
                isOpen={!!formModal}
                onClose={() => setFormModal(null)}
                showId={showId}
                dateKey={formModal?.dateKey}
                shift={formModal?.shift}
                onSaved={() => fetchAll(true)}
            />

            <ShiftPositionAssignModal
                isOpen={!!assignModal}
                onClose={() => setAssignModal(null)}
                shift={shifts.find(s => s.id === assignModal?.shift?.id) || assignModal?.shift}
                position={(shifts.find(s => s.id === assignModal?.shift?.id) || assignModal?.shift)?.positions?.find(p => p.id === assignModal?.position?.id) || assignModal?.position}
                readOnly={!canEditShow}
                onChanged={() => fetchAll(true)}
            />

            <EmailComposeModal
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                recipients={emailRecipients}
                category="CREW"
                showId={showId}
            />
        </div>
    );
};

export default ScheduleView;
