import React, { useState, useEffect, useMemo } from 'react';
import { Plus, LogOut } from 'lucide-react';
import { supabase, api } from '../api/api';
import ShowCard from '../components/ShowCard';

const DashboardView = ({ shows, onSelectShow, onNewShow, onDeleteShow, isLoading, user }) => {
    const [profile, setProfile] = useState(null);
    const [profileLoading, setProfileLoading] = useState(true);

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
                ) : shows.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {shows.map(show => (
                            <ShowCard key={show.id} show={show} onSelect={() => onSelectShow(show.id)} onDelete={() => onDeleteShow(show.id, show.name)} />
                        ))}
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