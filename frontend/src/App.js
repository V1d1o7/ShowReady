import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { supabase, api } from './api/api';

// Views
import Auth from './views/Auth';
import DashboardView from './views/DashboardView';
import ShowView from './views/ShowView';
import AccountView from './views/AccountView';
import AdvancedSSOView from './views/AdvancedSSOView';
import AdminView from './views/AdminView';

// Components
import NewShowModal from './components/NewShowModal';
import ProtectedRoute from './components/ProtectedRoute';


// This wrapper component now handles the logic that was previously in App.js
const MainLayout = ({ session, profile }) => {
    const [shows, setShows] = useState([]);
    const [isLoadingShows, setIsLoadingShows] = useState(true);
    const [isNewShowModalOpen, setIsNewShowModalOpen] = useState(false);
    const navigate = useNavigate();

    const loadShows = useCallback(async () => {
        if (!session) return;
        setIsLoadingShows(true);
        try {
            const showData = await api.getShows();
            setShows(showData.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (error) {
            console.error("Failed to fetch shows:", error);
        } finally {
            setIsLoadingShows(false);
        }
    }, [session]);

    useEffect(() => {
        loadShows();
    }, [loadShows]);

    const handleCreateShow = async (newShowName) => {
        if (!newShowName || shows.some(s => s.name === newShowName)) {
            alert("Show name cannot be empty or a duplicate.");
            return;
        }
        try {
            const newShowData = { info: { show_name: newShowName }, loom_sheets: {}, case_sheets: {} };
            await api.saveShow(newShowName, newShowData);
            navigate(`/show/${encodeURIComponent(newShowName)}`);
        } catch (error) {
            console.error("Failed to create show:", error);
        }
        setIsNewShowModalOpen(false);
    };

    const handleDeleteShow = async (showNameToDelete) => {
        if (!window.confirm(`Are you sure you want to delete "${showNameToDelete}"?`)) return;
        try {
            await api.deleteShow(showNameToDelete);
            loadShows(); // Refresh the list after deletion
        } catch (error) {
            console.error("Failed to delete show:", error);
        }
    };


    return (
        <>
            <Routes>
                <Route
                    path="/"
                    element={
                        <DashboardView
                            shows={shows}
                            onSelectShow={(showName) => navigate(`/show/${encodeURIComponent(showName)}`)}
                            onNewShow={() => setIsNewShowModalOpen(true)}
                            onDeleteShow={handleDeleteShow}
                            isLoading={isLoadingShows}
                            user={session.user}
                            onNavigate={(path) => navigate(`/${path}`)}
                        />
                    }
                />
                <Route path="/show/:showName" element={<ShowWrapper />} />
                <Route path="/account" element={<AccountView onBack={() => navigate('/')} user={session.user} onNavigate={(path) => navigate(`/${path}`)} profile={profile} />} />
                <Route path="/sso-setup" element={<AdvancedSSOView onBack={() => navigate('/account')} />} />
                <Route
                    path="/admin"
                    element={
                        <ProtectedRoute profile={profile}>
                            <AdminView onBack={() => navigate('/account')} />
                        </ProtectedRoute>
                    }
                />
            </Routes>
            <NewShowModal
                isOpen={isNewShowModalOpen}
                onClose={() => setIsNewShowModalOpen(false)}
                onSubmit={handleCreateShow}
            />
        </>
    );
};


// Main App component is now simpler
export default function App() {
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchSessionAndProfile = async () => {
            setIsLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);
            if (session) {
                try {
                    const profileData = await api.getProfile();
                    setProfile(profileData);
                } catch (error) {
                    console.error("Failed to fetch profile:", error);
                }
            }
            setIsLoading(false);
        };
        fetchSessionAndProfile();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setProfile(null);
            if (session) {
                api.getProfile().then(setProfile);
            }
        });
        return () => subscription.unsubscribe();
    }, []);

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen bg-gray-900"><div className="text-xl text-gray-400">Loading...</div></div>;
    }

    return (
        <div className="bg-gray-900 text-gray-300 font-sans min-h-screen">
            {!session ? <Auth /> : <MainLayout session={session} profile={profile} />}
        </div>
    );
}

// Wrapper for ShowView to handle its own data loading via URL parameters
const ShowWrapper = () => {
    const { showName } = useParams();
    const [showData, setShowData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchShow = async () => {
            setIsLoading(true);
            try {
                const data = await api.getShow(showName);
                setShowData(data);
            } catch (error) {
                console.error("Failed to fetch show data:", error);
                navigate('/');
            } finally {
                setIsLoading(false);
            }
        };
        if (showName) {
            fetchShow();
        }
    }, [showName, navigate]);

    const handleSaveShowData = async (updatedData) => {
        try {
            await api.saveShow(showName, updatedData);
            setShowData(updatedData);
        } catch (error) {
            console.error("Failed to save show data:", error);
        }
    };

    return (
        <ShowView
            showName={decodeURIComponent(showName)}
            showData={showData}
            onSave={handleSaveShowData}
            onBack={() => navigate('/')}
            isLoading={isLoading}
        />
    );
};