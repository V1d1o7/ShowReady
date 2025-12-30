import React, { useState } from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { useShows } from '../contexts/ShowsContext';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Box, Info, Server, GitMerge, Combine, ChevronsUpDown, Network, Users, Clock, HelpCircle, HardDrive, MessageSquare, Printer, ChevronDown, ChevronRight, Tag } from 'lucide-react';
import ShortcutsModal from './ShortcutsModal';

const ShowSidebar = () => {
    const { profile } = useAuth();
    const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
    const [isLabelsOpen, setIsLabelsOpen] = useState(false);
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

    const checkAccess = (feature) => {
        if (!feature) return true;
        // If profile hasn't loaded or features aren't present, only allow non-feature tabs
        if (!profile?.permitted_features) return false;
        return profile.permitted_features.includes(feature);
    };

    // Group 1: General Info & Management
    const mainTabs = [
        { path: 'info', label: 'Show Info', icon: Info, feature: null },
        { path: 'crew', label: 'Crew', icon: Users, feature: 'crew' },
        { path: 'team', label: 'Team Collab', icon: MessageSquare, feature: 'show_collaboration' },
        { path: 'hourstracking', label: 'Hours Tracking', icon: Clock, feature: 'hours_tracking' },
    ];

    // Group 2: Collapsible Labels
    const labelTabs = [
        { path: 'loomlabels', label: 'Loom Labels', icon: FileText, feature: 'loom_labels' },
        { path: 'caselabels', label: 'Case Labels', icon: Box, feature: 'case_labels' },
    ];

    // Group 3: Technical Tools
    const techTabs = [
        { path: 'label-engine', label: 'Label Engine', icon: Printer, feature: 'label_engine' },
        { path: 'rackbuilder', label: 'Rack Builder', icon: Server, feature: 'rack_builder' },
        { path: 'switchconfig', label: 'Switch Config', icon: HardDrive, feature: 'switch_config' },
        { path: 'wirediagram', label: 'Wire Diagram', icon: GitMerge, feature: 'wire_diagram' },
        { path: 'loombuilder', label: 'Loom Builder', icon: Combine, feature: 'loom_builder' },
        { path: 'vlan', label: 'VLAN', icon: Network, feature: 'vlan_management' },
    ];

    const visibleMainTabs = mainTabs.filter(tab => checkAccess(tab.feature));
    const visibleLabelTabs = labelTabs.filter(tab => checkAccess(tab.feature));
    const visibleTechTabs = techTabs.filter(tab => checkAccess(tab.feature));

    return (
        <div className="w-64 bg-gray-800 text-white p-4 flex flex-col flex-shrink-0 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
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
                {visibleMainTabs.map(tab => (
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

                {/* Collapsible Labels Section */}
                {visibleLabelTabs.length > 0 && (
                    <div className="flex flex-col gap-1">
                        <button
                            onClick={() => setIsLabelsOpen(!isLabelsOpen)}
                            className="flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors w-full"
                        >
                            <div className="flex items-center">
                                <Tag className="mr-3 h-5 w-5" />
                                Labels
                            </div>
                            {isLabelsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        
                        {isLabelsOpen && (
                            <div className="flex flex-col gap-1 pl-4 border-l border-gray-700 ml-4">
                                {visibleLabelTabs.map(tab => (
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
                            </div>
                        )}
                    </div>
                )}

                {visibleTechTabs.map(tab => (
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
            <div className="mt-auto pt-4">
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