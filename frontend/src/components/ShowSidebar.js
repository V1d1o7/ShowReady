//
import React, { useState } from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { useShow } from '../contexts/ShowContext';
import { useShows } from '../contexts/ShowsContext';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Box, Info, Server, GitMerge, Combine, ChevronsUpDown, Network, Users, Clock, HelpCircle, HardDrive, MessageSquare } from 'lucide-react';
import ShortcutsModal from './ShortcutsModal';

const ShowSidebar = () => {
    const { profile } = useAuth();
    const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
    const { shows, isLoadingShows } = useShows();
    const { showName: showNameFromParams } = useParams();
    const navigate = useNavigate();

    // FIX: Determine the current show object by matching the URL param (slug) to the show name.
    // This handles cases where spaces are replaced by hyphens in the URL.
    const currentShow = shows?.find(s => {
        if (!s.name) return false;
        // Replicate the slug logic used in navigation
        const slugifiedName = s.name.replace(/\s+/g, '-');
        
        // check against slug, exact match, or decoded match
        return (
            slugifiedName === showNameFromParams || 
            s.name === showNameFromParams || 
            s.name === decodeURIComponent(showNameFromParams || '')
        );
    });

    // Use the matched show's real name as the select value
    const selectedShowValue = currentShow ? currentShow.name : (decodeURIComponent(showNameFromParams || ''));

    const handleShowChange = (e) => {
        const newShowName = e.target.value;
        if (newShowName) {
            const urlFriendlyName = newShowName.replace(/\s+/g, '-');
            navigate(`/show/${urlFriendlyName}/info`);
        }
    };

    const navLinkClasses = ({ isActive }) =>
        `flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            isActive
                ? 'bg-amber-500 text-black'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`;

    const allTabs = [
        { path: 'info', label: 'Show Info', icon: Info, feature: null },
        { path: 'crew', label: 'Crew', icon: Users, feature: 'crew' },
        // CORRECTED: Path is 'team' and feature is 'show_collaboration' per App.js
        { path: 'team', label: 'Team Collab', icon: MessageSquare, feature: 'show_collaboration' },
        { path: 'hourstracking', label: 'Hours Tracking', icon: Clock, feature: 'hours_tracking' },
        { path: 'loomlabels', label: 'Loom Labels', icon: FileText, feature: 'loom_labels' },
        { path: 'caselabels', label: 'Case Labels', icon: Box, feature: 'case_labels' },
        { path: 'rackbuilder', label: 'Rack Builder', icon: Server, feature: 'rack_builder' },
        { path: 'switchconfig', label: 'Switch Config', icon: HardDrive, feature: 'switch_config' },
        { path: 'wirediagram', label: 'Wire Diagram', icon: GitMerge, feature: 'wire_diagram' },
        { path: 'loombuilder', label: 'Loom Builder', icon: Combine, feature: 'loom_builder' },
        { path: 'vlan', label: 'VLAN', icon: Network, feature: 'vlan_management' },
    ];

    const visibleTabs = profile?.permitted_features 
        ? allTabs.filter(tab => !tab.feature || profile.permitted_features.includes(tab.feature))
        : allTabs.filter(tab => !tab.feature); // Show only non-feature tabs if profile is loading

    return (
        <div className="w-64 bg-gray-800 text-white p-4 flex flex-col flex-shrink-0">
            <div className="mb-8">
                <label htmlFor="show-select" className="text-sm font-medium text-gray-400">Current Show</label>
                <div className="relative mt-1">
                    <select
                        id="show-select"
                        className="appearance-none w-full bg-gray-700 border border-gray-600 rounded-md py-2 pl-3 pr-10 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                        value={selectedShowValue}
                        onChange={handleShowChange}
                        disabled={isLoadingShows}
                    >
                        {shows?.map(s => (
                            <option key={s.name} value={s.name}>{s.name}</option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                        <ChevronsUpDown size={16} />
                    </div>
                </div>
            </div>
            <nav className="flex flex-col gap-2">
                {visibleTabs.map(tab => (
                    <NavLink
                        key={tab.path}
                        to={tab.path}
                        end
                        className={navLinkClasses}
                    >
                        <tab.icon className="mr-3 h-5 w-5" />
                        {tab.label}
                    </NavLink>
                ))}
            </nav>
            <div className="mt-auto">
                <button
                    onClick={() => setIsShortcutsModalOpen(true)}
                    className="flex items-center px-4 py-2 text-sm font-medium text-gray-400 hover:bg-gray-700 hover:text-white rounded-lg transition-colors w-full"
                >
                    <HelpCircle className="mr-3 h-5 w-5" />
                    Shortcuts
                </button>
            </div>
            <ShortcutsModal isOpen={isShortcutsModalOpen} onClose={() => setIsShortcutsModalOpen(false)} />
        </div>
    );
};

export default ShowSidebar;