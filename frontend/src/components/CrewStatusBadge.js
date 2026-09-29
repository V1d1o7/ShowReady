import React from 'react';
import { Clock, CheckCircle, XCircle, Slash, AlertTriangle } from 'lucide-react';

export const STATUS_STYLES = {
    pending: { label: 'Pending', className: 'bg-blue-500/10 text-blue-400 border-blue-500/30', Icon: Clock },
    confirmed: { label: 'Confirmed', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', Icon: CheckCircle },
    declined: { label: 'Declined', className: 'bg-red-500/10 text-red-400 border-red-500/30', Icon: XCircle },
    cancelled: { label: 'Cancelled', className: 'bg-gray-700/50 text-gray-400 border-gray-600', Icon: Slash },
    completed: { label: 'Completed', className: 'bg-gray-700/50 text-gray-300 border-gray-600', Icon: CheckCircle },
    no_show: { label: 'No-Show', className: 'bg-rose-500/10 text-rose-400 border-rose-500/30', Icon: AlertTriangle },
};

// Attendance status lives per-shift (show_crew_shifts.status), not on the assignment as a
// whole — someone can no-show one call on a multi-date show and work every other date fine.
// 'completed' is never stored on the shift itself — it's derived below from the date, so it
// can't drift out of sync with the calendar (no one has to remember to flip it manually).
// Only 'scheduled', 'no_show' and 'cancelled' are ever persisted or settable.
export const SHIFT_STATUS_STYLES = {
    scheduled: { label: 'Scheduled', className: 'bg-teal-500/15 text-teal-300 border-teal-500/30', Icon: Clock },
    completed: { label: 'Completed', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', Icon: CheckCircle },
    no_show: { label: 'No-Show', className: 'bg-rose-500/10 text-rose-400 border-rose-500/30', Icon: AlertTriangle },
    cancelled: { label: 'Cancelled', className: 'bg-gray-700/50 text-gray-400 border-gray-600', Icon: Slash },
};

// The only values a person can actually pick — 'completed' isn't one of them.
export const SHIFT_ATTENDANCE_OPTIONS = ['scheduled', 'no_show', 'cancelled'];

// A shift's real-world state: whatever was manually set (no_show/cancelled) wins; otherwise
// a 'scheduled' shift whose date has already passed reads as completed.
export const getShiftDisplayStatus = (shift) => {
    if (!shift) return 'scheduled';
    if (shift.status === 'no_show' || shift.status === 'cancelled') return shift.status;
    const shiftDate = new Date(`${shift.shift_date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return shiftDate < today ? 'completed' : 'scheduled';
};

const StatusBadge = ({ status }) => {
    const style = STATUS_STYLES[status] || STATUS_STYLES.confirmed;
    const Icon = style.Icon;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full border ${style.className}`}>
            <Icon size={11} /> {style.label}
        </span>
    );
};

export const formatShiftDate = (dateStr) => {
    const parsed = new Date(`${dateStr}T00:00:00`);
    return isNaN(parsed.getTime()) ? dateStr : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const formatCallTime = (timeStr) => {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':');
    const parsed = new Date();
    parsed.setHours(Number(h), Number(m || 0));
    return parsed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

// "9:00 AM" (no end time) or "9:00 AM – 5:00 PM" (end time given).
export const formatTimeRange = (callTimeStr, endTimeStr) => {
    const start = formatCallTime(callTimeStr);
    if (!start) return null;
    const end = formatCallTime(endTimeStr);
    return end ? `${start} – ${end}` : start;
};

export const formatShiftsSummary = (shifts) => {
    if (!shifts || shifts.length === 0) return '—';
    return shifts.map(s => {
        const time = formatTimeRange(s.call_time, s.end_time);
        const base = time ? `${formatShiftDate(s.shift_date)} (${time})` : formatShiftDate(s.shift_date);
        if (s.status === 'no_show') return `${base} — No-Show`;
        if (s.status === 'cancelled') return `${base} — Cancelled`;
        return base;
    }).join(', ');
};

const escapeHtml = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// One glanceable block per date (bold date/time header, notes underneath) instead of a single
// comma-joined line — for embedding in an HTML email body via {{schedule}}. formatShiftsSummary
// above stays a single-line summary for compact UI table cells.
export const formatShiftsForEmail = (shifts) => {
    if (!shifts || shifts.length === 0) return '—';
    return shifts.map(s => {
        const time = formatTimeRange(s.call_time, s.end_time);
        const header = time ? `${formatShiftDate(s.shift_date)} — ${time}` : formatShiftDate(s.shift_date);
        const notes = s.notes ? `<div style="color:#9CA3AF;font-size:13px;margin-top:2px;">${escapeHtml(s.notes)}</div>` : '';
        return `<div style="margin-bottom:10px;"><div style="color:#F5F0FA;font-size:14px;font-weight:bold;">${escapeHtml(header)}</div>${notes}</div>`;
    }).join('');
};

export default StatusBadge;
