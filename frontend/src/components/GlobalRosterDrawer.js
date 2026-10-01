import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/api';
import InputField from './InputField';
import { X, Users, Lock, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import useHotkeys from '../hooks/useHotkeys';
import { getDisplayName } from '../utils/rosterName';

// Read-only reference panel for the account-wide Roster, opened from the global Scheduling
// view. A real column in the page's flex layout (same treatment as the Shows sidebar on
// the other side), not a floating overlay — an overlay here would sit on top of the header
// controls and the grid instead of beside them, blocking clicks on whatever happened to be
// underneath it. The caller only mounts this when open, so there's no hidden/closed state
// to manage here.
const GlobalRosterDrawer = ({ onClose }) => {
    useHotkeys({ escape: onClose });
    const [roster, setRoster] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterText, setFilterText] = useState('');

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        api.getRoster()
            .then(data => { if (!cancelled) setRoster(data || []); })
            .catch(error => {
                console.error('Failed to load roster:', error);
                toast.error('Failed to load roster.');
            })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const filtered = useMemo(() => {
        const sorted = roster.slice().sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
        const term = filterText.trim().toLowerCase();
        if (!term) return sorted;
        return sorted.filter(m =>
            getDisplayName(m).toLowerCase().includes(term) ||
            (m.position || '').toLowerCase().includes(term) ||
            (m.tags || []).some(t => t.toLowerCase().includes(term))
        );
    }, [roster, filterText]);

    return (
        <aside className="hidden lg:flex flex-col w-80 flex-shrink-0 border-l border-gray-800 bg-gray-800/30 h-full">
            <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-800">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-2">
                    <Users size={14} /> Roster
                </h2>
                <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded-md text-gray-500 hover:text-white transition-colors">
                    <X size={16} />
                </button>
            </div>

            <div className="flex-shrink-0 p-3 space-y-2">
                <InputField
                    placeholder="Search roster..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                />
                <p className="text-[11px] text-gray-500">Drag a name onto a date in the grid to assign them.</p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
                {isLoading ? (
                    <div className="text-center py-10 text-sm text-gray-500">Loading roster...</div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-10 text-sm text-gray-500">No roster members found.</div>
                ) : (
                    <ul className="divide-y divide-gray-800">
                        {filtered.map(member => {
                            const publicTags = (member.tags || []).filter(t => !t.startsWith('_'));
                            const privateTags = (member.tags || []).filter(t => t.startsWith('_'));
                            return (
                                <li
                                    key={member.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.effectAllowed = 'copy';
                                        e.dataTransfer.setData('application/json', JSON.stringify({
                                            type: 'roster-member',
                                            id: member.id,
                                            first_name: member.first_name,
                                            last_name: member.last_name,
                                            preferred_first_name: member.preferred_first_name,
                                            preferred_last_name: member.preferred_last_name,
                                            email: member.email,
                                            position: member.position,
                                        }));
                                    }}
                                    className="px-4 py-3 hover:bg-gray-700/30 transition-colors cursor-grab active:cursor-grabbing"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="flex items-center gap-1.5 min-w-0">
                                            <GripVertical size={12} className="text-gray-600 flex-shrink-0" />
                                            <span className="text-sm font-medium text-white truncate">
                                                {getDisplayName(member) || 'Unnamed'}
                                            </span>
                                        </span>
                                        {member.status === 'inactive' && (
                                            <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border border-gray-600 rounded px-1.5 py-0.5">Inactive</span>
                                        )}
                                    </div>
                                    {member.position && <div className="text-xs text-gray-400 mt-0.5 ml-[18px]">{member.position}</div>}

                                    {(publicTags.length > 0 || privateTags.length > 0) && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {publicTags.map(tag => (
                                                <span key={tag} className="px-2 py-0.5 text-[11px] rounded-full bg-gray-700 text-amber-300">
                                                    {tag}
                                                </span>
                                            ))}
                                            {privateTags.map(tag => (
                                                <span
                                                    key={tag}
                                                    title="Private Tag (Internal Only)"
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-gray-800 text-gray-400 border border-gray-600"
                                                >
                                                    {tag.substring(1)}
                                                    <Lock size={9} className="text-amber-500/80" />
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </aside>
    );
};

export default GlobalRosterDrawer;
