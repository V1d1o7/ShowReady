import React, { useState, useEffect, useCallback } from 'react';
import { supabase, api } from './api/api';
import Auth from './views/Auth';
import DashboardView from './views/DashboardView';
import ShowView from './views/ShowView';
import AccountView from './views/AccountView';
import AdvancedSSOView from './views/AdvancedSSOView';
import AdminView from './views/AdminView';
import NewShowModal from './components/NewShowModal';

export default function App() {
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [shows, setShows] = useState([]);
    const [activeShowName, setActiveShowName] = useState('');
    const [activeShowData, setActiveShowData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isNewShowModalOpen, setIsNewShowModalOpen] = useState(false);
    const [currentView, setCurrentView] = useState('dashboard');

    useEffect(() => {
        const fetchSessionAndProfile = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);
            if (session) {
                try {
                    const profileData = await api.getProfile();
                    setProfile(profileData);
                } catch (error) {
                    console.error("Failed to fetch profile on app load:", error);
                }
            }
            setIsLoading(false);
        };
        fetchSessionAndProfile();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) {
                api.getProfile().then(setProfile);
            } else {
                setProfile(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const loadShows = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const showData = await api.getShows();
            setShows(showData.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (error) {
            console.error("Failed to fetch shows:", error);
        } finally {
            setIsLoading(false);
        }
    }, [session]);

    useEffect(() => {
        loadShows();
    }, [loadShows]);

    const fetchShowData = useCallback(async (showName) => {
        if (!showName) {
            setActiveShowData(null);
            return;
        }
        setIsLoading(true);
        try {
            const data = await api.getShow(showName);
            setActiveShowData(data);
            setCurrentView('show');
        } catch (error) {
            console.error(`Failed to fetch data for ${showName}:`, error);
            setActiveShowName('');
            setCurrentView('dashboard');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleNavigate = (view) => {
        if (view === 'dashboard') {
            setActiveShowName('');
            setActiveShowData(null);
        }
        setCurrentView(view);
    }

    useEffect(() => {
        if (activeShowName) {
            fetchShowData(activeShowName);
        } else {
            setActiveShowData(null);
            setCurrentView(currentView === 'show' ? 'dashboard' : currentView);
        }
    }, [activeShowName, fetchShowData, currentView]);

    const handleSaveShowData = async (updatedData) => {
        if (!activeShowName) return;
        try {
            await api.saveShow(activeShowName, updatedData);
            setActiveShowData(updatedData);
        } catch (error) {
            console.error("Failed to save show data:", error);
        }
    };

    const handleCreateShow = async (newShowName) => {
        if (!newShowName || shows.some(s => s.name === newShowName)) {
            alert("Show name cannot be empty or a duplicate.");
            return;
        }
        setIsLoading(true);
        try {
            const newShowData = { info: { show_name: newShowName }, loom_sheets: {}, case_sheets: {} };
            await api.saveShow(newShowName, newShowData);
            setShows(prev => [...prev, { name: newShowName, logo_path: null }].sort((a, b) => a.name.localeCompare(b.name)));
            setActiveShowName(newShowName);
        } catch (error) {
            console.error("Failed to create new show:", error);
            alert(`Failed to create new show: ${error.message}`);
        }
        setIsNewShowModalOpen(false);
        setIsLoading(false);
    };

    const handleDeleteShow = async (showNameToDelete) => {
        if (!window.confirm(`Are you sure you want to delete "${showNameToDelete}"? This cannot be undone.`)) return;
        setIsLoading(true);
        try {
            await api.deleteShow(showNameToDelete);
            setShows(prev => prev.filter(s => s.name !== showNameToDelete));
            if (activeShowName === showNameToDelete) {
                setActiveShowName('');
            }
        } catch (error) {
            console.error("Failed to delete show:", error);
            alert("Failed to delete show.");
        }
        setIsLoading(false);
    };

    if (isLoading && !session) {
        return <div className="flex items-center justify-center h-screen bg-gray-900"><div className="text-xl text-gray-400">Loading...</div></div>;
    }

    if (!session) {
        return <Auth />;
    }

    let viewComponent;
    switch (currentView) {
        case 'show':
            viewComponent = <ShowView showName={activeShowName} showData={activeShowData} onSave={handleSaveShowData} onBack={() => handleNavigate('dashboard')} isLoading={isLoading} />;
            break;
        case 'account':
            viewComponent = <AccountView onBack={() => handleNavigate('dashboard')} user={session.user} onNavigate={handleNavigate} />;
            break;
        case 'sso_setup':
            viewComponent = <AdvancedSSOView onBack={() => handleNavigate('account')} />;
            break;
        case 'admin':
            if (profile && profile.role === 'admin') {
                viewComponent = <AdminView onBack={() => handleNavigate('account')} />;
            } else {
                viewComponent = <DashboardView shows={shows} onSelectShow={setActiveShowName} onNewShow={() => setIsNewShowModalOpen(true)} onDeleteShow={handleDeleteShow} isLoading={isLoading} user={session.user} onNavigate={handleNavigate} />;
            }
            break;
        default:
            viewComponent = <DashboardView shows={shows} onSelectShow={setActiveShowName} onNewShow={() => setIsNewShowModalOpen(true)} onDeleteShow={handleDeleteShow} isLoading={isLoading} user={session.user} onNavigate={handleNavigate} />;
    }

    return (
        <div className="bg-gray-900 text-gray-300 font-sans min-h-screen">
            {viewComponent}
            <NewShowModal
                isOpen={isNewShowModalOpen}
                onClose={() => setIsNewShowModalOpen(false)}
                onSubmit={handleCreateShow}
            />
        </div>
    );
}