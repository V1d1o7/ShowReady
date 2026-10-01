import React, { useState, useEffect, useMemo, useContext } from 'react';
import { Plus, LogOut } from 'lucide-react';
import { supabase, api } from '../api/api';
import ShowCard from '../components/ShowCard';
import ToggleSwitch from '../components/ToggleSwitch';
import { LayoutContext } from '../contexts/LayoutContext';

const DashboardView = ({ shows, onSelectShow, onNewShow, onDeleteShow, onToggleArchive, isLoading, user }) => {
    const [profile, setProfile] = useState(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);
    const { setShouldScroll } = useContext(LayoutContext);

    const visibleShows = useMemo(
        () => showArchived ? shows : shows.filter(s => s.status !== 'archived'),
        [shows, showArchived]
    );

    useEffect(() => {
        setShouldScroll(true);
        return () => setShouldScroll(false);
    }, [setShouldScroll]);

    useEffect(() => {
        const fetchProfile = async () => {
            setProfileLoading(true);
            try {
                const data = await api.getProfile();
                setProfile(data);
            } catch (error) {
                console.error("Failed to fetch profile for dashboard:", error);
            } finally {
                setProfileLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    const displayName = useMemo(() => {
        if (profileLoading) return 'Loading...';
        if (profile && profile.first_name) return `${profile.first_name} ${profile.last_name || ''}`.trim();
        return user.email;
    }, [profile, user.email, profileLoading]);

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">
            <header className="flex items-center justify-between pb-8 border-b border-gray-700">
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-white">All Shows</h1>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label htmlFor="show-archived-toggle" className="text-sm text-gray-400 select-none cursor-pointer">
                            Show Archived
                        </label>
                        <ToggleSwitch
                            id="show-archived-toggle"
                            name="show-archived-toggle"
                            checked={showArchived}
                            onChange={(e) => setShowArchived(e.target.checked)}
                        />
                    </div>
                    <button onClick={handleSignOut} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors">
                        <LogOut size={18} />
                    </button>
                    <button onClick={onNewShow} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors">
                        <Plus size={18} /> New Show
                    </button>
                </div>
            </header>
            <main className="mt-8">
                {isLoading ? (
                    <div className="text-center py-16 text-gray-500">Loading shows...</div>
                ) : visibleShows.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {visibleShows.map(show => (
                            <ShowCard 
                                key={show.id} 
                                show={show} 
                                onSelect={() => onSelectShow(show.id)} 
                                onDelete={() => onDeleteShow(show.id, show.name)}
                                onToggleArchive={onToggleArchive}
                                currentUserId={user?.id}
                            />
                        ))}
                    </div>
                ) : shows.length > 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <p>No active shows found.</p>
                        <p className="mt-2">All your shows are archived — check "Show Archived" to see them.</p>
                    </div>
                ) : (
                    <div className="text-center py-16 text-gray-500">
                        <p>No shows found.</p>
                        <p className="mt-2">Click "New Show" to get started.</p>
                    </div>
                )}
            </main>
        </div>
    );
};

export default DashboardView;