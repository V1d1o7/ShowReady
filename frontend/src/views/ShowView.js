import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { FileText, Box, Info, Server, GitMerge } from 'lucide-react';
import { useShow } from '../contexts/ShowContext';

const ShowView = () => {
    const { showName, isLoading, showData } = useShow();

    const tabs = [
        { path: 'info', label: 'Show Info', icon: Info },
        { path: 'loomlabels', label: 'Loom Labels', icon: FileText },
        { path: 'caselabels', label: 'Case Labels', icon: Box },
        { path: 'rackbuilder', label: 'Rack Builder', icon: Server },
        { path: 'wirediagram', label: 'Wire Diagram', icon: GitMerge },
    ];

    if (isLoading || !showData) {
        return <div className="flex items-center justify-center h-screen"><div className="text-xl text-gray-400">Loading Show...</div></div>;
    }

    const containerClass = "p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto h-full flex flex-col";

    return (
        <div className={containerClass}>
            <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">{decodeURIComponent(showName)}</h1>
                </div>
            </header>
            <div className="flex border-b border-gray-700 mb-6 flex-shrink-0">
                {tabs.map(tab => (
                    <NavLink
                        key={tab.path}
                        to={tab.path}
                        className={({ isActive }) =>
                            `flex items-center gap-2 px-4 py-3 text-sm font-bold transition-colors ${
                                isActive ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-400 hover:text-white'
                            }`
                        }
                    >
                        <tab.icon size={16} /> {tab.label}
                    </NavLink>
                ))}
            </div>
            <main className="flex-grow min-h-0">
                <Outlet />
            </main>
        </div>
    );
};

export default ShowView;