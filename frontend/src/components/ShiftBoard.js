import React from 'react';
import { Plus, Pencil } from 'lucide-react';
import { formatTimeRange, getFillState, formatFillStatus, FILL_STYLES } from './CrewStatusBadge';
import { getDisplayName } from '../utils/rosterName';

const parseKey = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
};

const fullName = (roster) => getDisplayName(roster) || 'Unnamed';

// One shift's position lines — each a clickable pill showing "filled/required" plus who's
// in it, colored by fill state (empty/partial/full). Clicking opens the assign/manage modal
// for that specific position, whether it still needs people or is already staffed.
const PositionRow = ({ shift, position, canEdit, onAssignPosition, dragProps }) => {
    const state = getFillState(position.filled_count, position.required_count);
    const names = (position.assignments || [])
        .filter(a => a.status !== 'cancelled')
        .map(a => fullName(a.roster))
        .join(', ');

    return (
        <button
            type="button"
            onClick={() => onAssignPosition(shift, position)}
            disabled={!canEdit && position.filled_count === 0}
            {...dragProps}
            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md border text-left transition-colors ${FILL_STYLES[state]} ${canEdit ? 'hover:brightness-125 cursor-pointer' : 'cursor-default'} ${dragProps?.['data-drag-over'] ? 'ring-2 ring-amber-400' : ''}`}
        >
            <span className="text-xs font-bold uppercase tracking-wide w-24 flex-shrink-0 truncate">{position.position}</span>
            <span className="text-xs font-mono flex-shrink-0">{formatFillStatus(position.filled_count, position.required_count)}</span>
            <span className="text-xs truncate opacity-80">{names}</span>
        </button>
    );
};

const ShiftCard = ({ shift, canEdit, onEditShift, onAssignPosition, renderShiftBadge, dragHandlers }) => (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-700 bg-gray-800/80">
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-bold text-white truncate">{shift.label || 'Shift'}</span>
                {formatTimeRange(shift.call_time, shift.end_time) && (
                    <span className="text-xs text-teal-300 flex-shrink-0">{formatTimeRange(shift.call_time, shift.end_time)}</span>
                )}
                {renderShiftBadge && renderShiftBadge(shift)}
            </div>
            {canEdit && (
                <button onClick={() => onEditShift(shift)} className="text-gray-500 hover:text-amber-400 flex-shrink-0" title="Edit shift">
                    <Pencil size={14} />
                </button>
            )}
        </div>
        {shift.notes && <div className="px-4 pt-2 text-xs text-gray-500">{shift.notes}</div>}
        <div className="p-2 space-y-1.5">
            {(shift.positions || []).length === 0 ? (
                <div className="px-2 py-1 text-xs text-gray-600 italic">No positions set on this shift yet.</div>
            ) : (
                shift.positions.map(position => (
                    <PositionRow
                        key={position.id}
                        shift={shift}
                        position={position}
                        canEdit={canEdit}
                        onAssignPosition={onAssignPosition}
                        dragProps={dragHandlers ? dragHandlers(shift, position) : undefined}
                    />
                ))
            )}
        </div>
    </div>
);

// Shared shift-board renderer used by both ScheduleView (single show) and
// GlobalScheduleView (multiple shows, via renderShiftBadge/dragHandlers). Each date in
// `dateKeys` gets its own section listing that date's shift cards; "+ Add shift" only shows
// when canEdit, so a viewer just sees "No shifts" on an empty date instead of a dead button.
const ShiftBoard = ({ dateKeys, shiftsByDate, canEdit, onAddShift, onEditShift, onAssignPosition, renderShiftBadge, dragHandlers }) => (
    <div className="space-y-5 max-w-3xl">
        {dateKeys.map(key => {
            const date = parseKey(key);
            const shifts = shiftsByDate[key] || [];
            return (
                <div key={key}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-white">
                            {date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                        </span>
                        {canEdit && onAddShift && (
                            <button onClick={() => onAddShift(key)} className="flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300">
                                <Plus size={13} /> Add shift
                            </button>
                        )}
                    </div>
                    {shifts.length === 0 ? (
                        <div className="text-xs text-gray-600 italic px-1">No shifts.</div>
                    ) : (
                        <div className="space-y-2">
                            {shifts.map(shift => (
                                <ShiftCard
                                    key={shift.id}
                                    shift={shift}
                                    canEdit={canEdit}
                                    onEditShift={onEditShift}
                                    onAssignPosition={onAssignPosition}
                                    renderShiftBadge={renderShiftBadge}
                                    dragHandlers={dragHandlers}
                                />
                            ))}
                        </div>
                    )}
                </div>
            );
        })}
    </div>
);

export default ShiftBoard;
