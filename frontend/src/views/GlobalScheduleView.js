import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/api';
import { LayoutContext } from '../contexts/LayoutContext';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import ShiftBoard from '../components/ShiftBoard';
import ShiftFormModal from '../components/ShiftFormModal';
import ShiftPositionAssignModal from '../components/ShiftPositionAssignModal';
import GlobalRosterDrawer from '../components/GlobalRosterDrawer';
import toast from 'react-hot-toast';

const VIEW_STORAGE_KEY = 'showready.globalScheduleView';

const formatDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const getWeekStart = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
};

const buildDateRange = (keys) => [...new Set(keys)].sort();

const slugify = (name) => name.replace(/\s+/g, '-');

const blurOnEnter = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
    }
};

// One color per show — cycled by the show's position in the (name-sorted) list from the
// API, so a given show keeps the same color across renders/refetches without a lookup
// table. Kept as static, fully-spelled class names (not template-built) so Tailwind's
// build-time scanner picks them up.
const SHOW_COLORS = [
    { dot: 'bg-sky-400', text: 'text-sky-300', border: 'border-sky-500/40', bg: 'bg-sky-500/10' },
    { dot: 'bg-violet-400', text: 'text-violet-300', border: 'border-violet-500/40', bg: 'bg-violet-500/10' },
    { dot: 'bg-lime-400', text: 'text-lime-300', border: 'border-lime-500/40', bg: 'bg-lime-500/10' },
    { dot: 'bg-orange-400', text: 'text-orange-300', border: 'border-orange-500/40', bg: 'bg-orange-500/10' },
    { dot: 'bg-fuchsia-400', text: 'text-fuchsia-300', border: 'border-fuchsia-500/40', bg: 'bg-fuchsia-500/10' },
    { dot: 'bg-cyan-400', text: 'text-cyan-300', border: 'border-cyan-500/40', bg: 'bg-cyan-500/10' },
    { dot: 'bg-pink-400', text: 'text-pink-300', border: 'border-pink-500/40', bg: 'bg-pink-500/10' },
    { dot: 'bg-indigo-400', text: 'text-indigo-300', border: 'border-indigo-500/40', bg: 'bg-indigo-500/10' },
];
const colorFor = (index) => SHOW_COLORS[index % SHOW_COLORS.length];

// Account-wide read/edit surface across every non-archived show at once: one shift board per
// show (color-coded), stacked under a shared date window, with a sidebar to toggle individual
// shows on/off. Deliberately narrower than the per-show ScheduleView in one respect: it can't
// pin a new blank planning day — that still needs a specific show's own Schedule tab.
const GlobalScheduleView = () => {
    const { setShouldScroll } = useContext(LayoutContext);
    const [shows, setShows] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hiddenShowIds, setHiddenShowIds] = useState(() => new Set());
    const [isRosterOpen, setIsRosterOpen] = useState(() => {
        try { return localStorage.getItem(VIEW_STORAGE_KEY) === 'roster-open'; } catch { return false; }
    });
    const [formModal, setFormModal] = useState(null); // { showId, shift, dateKey }
    const [assignModal, setAssignModal] = useState(null); // { showId, shift, position, presetRoster }
    const [dragOverKey, setDragOverKey] = useState(null); // `${shiftId}:${positionId}`

    const [windowMode, setWindowMode] = useState('week');
    const [weekStartDate, setWeekStartDate] = useState(() => getWeekStart(new Date()));
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

    useEffect(() => {
        setShouldScroll(false);
    }, [setShouldScroll]);

    const fetchAll = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const data = await api.getGlobalSchedule();
            setShows(data || []);
        } catch (error) {
            console.error('Failed to fetch global schedule:', error);
            toast.error(`Failed to load schedule: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const toggleRoster = () => {
        setIsRosterOpen(prev => {
            const next = !prev;
            try { localStorage.setItem(VIEW_STORAGE_KEY, next ? 'roster-open' : 'roster-closed'); } catch { /* per-viewer convenience only */ }
            return next;
        });
    };

    const toggleShowVisible = (showId) => {
        setHiddenShowIds(prev => {
            const next = new Set(prev);
            if (next.has(showId)) next.delete(showId); else next.add(showId);
            return next;
        });
    };

    const sections = useMemo(() => shows.map((show, index) => {
        const shiftsByDate = {};
        (show.shifts || []).forEach(shift => { (shiftsByDate[shift.shift_date] = shiftsByDate[shift.shift_date] || []).push(shift); });
        const allDateKeys = buildDateRange((show.shifts || []).map(s => s.shift_date));
        const visibleDateKeys = windowMode === 'range' && (!rangeStart || !rangeEnd)
            ? allDateKeys
            : allDateKeys.filter(k => k >= windowStartKey && k <= windowEndKey);
        return {
            show,
            color: colorFor(index),
            shiftsByDate,
            allDateKeys,
            visibleDateKeys,
            canEdit: show.current_user_role !== 'viewer',
        };
    }), [shows, windowMode, rangeStart, rangeEnd, windowStartKey, windowEndKey]);

    const visibleSections = useMemo(() => sections.filter(s => !hiddenShowIds.has(s.show.show_id)), [sections, hiddenShowIds]);
    const sectionsWithData = useMemo(() => visibleSections.filter(s => s.allDateKeys.length > 0), [visibleSections]);
    const sectionsInWindow = useMemo(() => sectionsWithData.filter(s => s.visibleDateKeys.length > 0), [sectionsWithData]);
    const sectionsOutOfWindow = useMemo(() => sectionsWithData.filter(s => s.visibleDateKeys.length === 0), [sectionsWithData]);

    const handleAssignPosition = (showId) => (shift, position) => setAssignModal({ showId, shift, position, presetRoster: null });
    const handleEditShift = (showId) => (shift) => setFormModal({ showId, shift, dateKey: shift.shift_date });
    const handleAddShift = (showId) => (dateKey) => setFormModal({ showId, shift: null, dateKey });

    const dragHandlersFor = (section) => {
        if (!section.canEdit) return () => undefined;
        return (shift, position) => {
            const key = `${shift.id}:${position.id}`;
            return {
                onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOverKey(key); },
                onDragLeave: () => setDragOverKey(prev => (prev === key ? null : prev)),
                onDrop: (e) => {
                    e.preventDefault();
                    setDragOverKey(null);
                    let payload;
                    try { payload = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
                    if (!payload || payload.type !== 'roster-member') return;
                    setAssignModal({ showId: section.show.show_id, shift, position, presetRoster: payload });
                },
                'data-drag-over': dragOverKey === key,
            };
        };
    };

    const activeShift = assignModal
        ? (sections.find(s => s.show.show_id === assignModal.showId)?.show.shifts || []).find(s => s.id === assignModal.shift?.id) || assignModal.shift
        : null;
    const activePosition = activeShift?.positions?.find(p => p.id === assignModal?.position?.id) || assignModal?.position;

    const allHidden = shows.length > 0 && visibleSections.length === 0;

    return (
        <div className="h-full flex">
            <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 border-r border-gray-800 bg-gray-800/30 p-4 overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Shows</h2>
                    <div className="flex gap-2 text-[11px] font-semibold">
                        <button onClick={() => setHiddenShowIds(new Set())} className="text-amber-400 hover:text-amber-300">All</button>
                        <button onClick={() => setHiddenShowIds(new Set(shows.map(s => s.show_id)))} className="text-gray-500 hover:text-gray-300">None</button>
                    </div>
                </div>
                <div className="space-y-1">
                    {sections.map(section => {
                        const checked = !hiddenShowIds.has(section.show.show_id);
                        return (
                            <button
                                key={section.show.show_id}
                                onClick={() => toggleShowVisible(section.show.show_id)}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors border ${
                                    checked ? `${section.color.bg} ${section.color.border} ${section.color.text}` : 'border-transparent text-gray-600 hover:bg-gray-700/40'
                                }`}
                            >
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${checked ? section.color.dot : 'bg-gray-600'}`} />
                                <span className="truncate">{section.show.show_name}</span>
                            </button>
                        );
                    })}
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0 p-4 sm:p-6 lg:p-8">
                <header className="flex-shrink-0 flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-gray-700">
                    <h1 className="text-2xl font-bold text-white">Scheduling</h1>
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
                        <button
                            onClick={toggleRoster}
                            className={`flex items-center gap-1.5 px-3 py-2 border text-sm font-semibold rounded-lg transition-colors ${
                                isRosterOpen ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                            }`}
                        >
                            <Users size={14} /> Roster
                        </button>
                    </div>
                </header>

                <div className="flex-1 min-h-0 overflow-auto mt-6 space-y-8">
                    {isLoading ? (
                        <div className="text-center py-12 text-gray-500">Loading schedule...</div>
                    ) : shows.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">No active shows found.</div>
                    ) : allHidden ? (
                        <div className="text-center py-12 text-gray-500">Every show is hidden. Toggle one on in the sidebar to see its schedule.</div>
                    ) : sectionsWithData.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">None of the shows shown have any shifts yet.</div>
                    ) : sectionsInWindow.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            {windowMode === 'week' ? (
                                <>No shifts this week. Some shows have shifts outside it — use <button onClick={toggleRangeMode} className="text-amber-400 hover:text-amber-300 font-semibold">Custom Range</button> to see them.</>
                            ) : (
                                <>No shifts in this range. Try widening the dates above.</>
                            )}
                        </div>
                    ) : (
                        <>
                            {sectionsInWindow.map(section => (
                                <div key={section.show.show_id}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Link to={`/show/${slugify(section.show.show_name)}/schedule`} className={`inline-flex items-center gap-1.5 font-bold hover:underline ${section.color.text}`}>
                                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${section.color.dot}`} />
                                            {section.show.show_name}
                                        </Link>
                                        {!section.canEdit && <span className="text-[10px] uppercase text-gray-500">view only</span>}
                                    </div>
                                    <ShiftBoard
                                        dateKeys={section.visibleDateKeys}
                                        shiftsByDate={section.shiftsByDate}
                                        canEdit={section.canEdit}
                                        onAddShift={handleAddShift(section.show.show_id)}
                                        onEditShift={handleEditShift(section.show.show_id)}
                                        onAssignPosition={handleAssignPosition(section.show.show_id)}
                                        dragHandlers={dragHandlersFor(section)}
                                    />
                                </div>
                            ))}

                            {sectionsOutOfWindow.length > 0 && (
                                <div className="text-sm text-gray-500 border-t border-gray-800 pt-4">
                                    Also scheduled, but outside this window: {sectionsOutOfWindow.map((s, i) => (
                                        <React.Fragment key={s.show.show_id}>
                                            {i > 0 && ', '}
                                            <Link to={`/show/${slugify(s.show.show_name)}/schedule`} className="text-gray-400 hover:text-amber-400">
                                                {s.show.show_name}
                                            </Link>
                                        </React.Fragment>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {isRosterOpen && <GlobalRosterDrawer onClose={() => setIsRosterOpen(false)} />}

            <ShiftFormModal
                isOpen={!!formModal}
                onClose={() => setFormModal(null)}
                showId={formModal?.showId}
                dateKey={formModal?.dateKey}
                shift={formModal?.shift}
                onSaved={() => fetchAll(true)}
            />

            <ShiftPositionAssignModal
                isOpen={!!assignModal}
                onClose={() => setAssignModal(null)}
                shift={activeShift}
                position={activePosition}
                readOnly={!sections.find(s => s.show.show_id === assignModal?.showId)?.canEdit}
                presetRoster={assignModal?.presetRoster}
                onChanged={() => fetchAll(true)}
            />
        </div>
    );
};

export default GlobalScheduleView;
