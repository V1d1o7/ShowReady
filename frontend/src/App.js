import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams, Outlet, Navigate } from 'react-router-dom';
import { supabase, api } from './api/api';

// Views
import Auth from './views/Auth';
import DashboardView from './views/DashboardView';
import ShowView from './views/ShowView';
import AccountView from './views/AccountView';
import AdvancedSSOView from './views/AdvancedSSOView';
import AdminLayout from './layouts/AdminLayout';
import ShowLayout from './layouts/ShowLayout';
import EmailView from './views/admin/EmailView';
import AdminEquipmentLibraryView from './views/admin/EquipmentLibraryView';
import UserManagementView from './views/admin/UserManagementView';
import MetricsView from './views/admin/MetricsView';
import UserLibraryView from './views/UserLibraryView';
import EquipmentLibraryView from './views/EquipmentLibraryView';
import UserRackBuilderView from './views/UserRackBuilderView';
import ShowInfoView from './views/ShowInfoView';
import LoomLabelView from './views/LoomLabelView';
import CaseLabelView from './views/CaseLabelView';
import RackBuilderView from './views/RackBuilderView';
import WireDiagramView from './views/WireDiagramView';
import LoomBuilderView from './views/LoomBuilderView';

// Components
import NewShowModal from './components/NewShowModal';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';

// Contexts
import { ShowProvider } from './contexts/ShowContext';
import { ShowsContext } from './contexts/ShowsContext';

// Main layout for the application, including routing.


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
            // After creating, immediately reload the list of shows
            await loadShows();
            navigate(`/show/${encodeURIComponent(newShowName)}/info`);
        } catch (error) {
            console.error("Failed to create show:", error);
        }
        setIsNewShowModalOpen(false);
    };

    const handleDeleteShow = async (showNameToDelete) => {
        if (!window.confirm(`Are you sure you want to delete "${showNameToDelete}"?`)) return;
        try {
            await api.deleteShow(showNameToDelete);
            loadShows();
        } catch (error) {
            console.error("Failed to delete show:", error);
        }
    };


    return (
        <ShowsContext.Provider value={{ shows, isLoadingShows }}>
            <div className="flex flex-col h-full">
                <Navbar profile={profile} />
                <main className="flex-grow min-h-0">
                    <Routes>
                        <Route
                            path="/"
                            element={
                                <DashboardView
                                    shows={shows}
                                    onSelectShow={(showName) => navigate(`/show/${encodeURIComponent(showName)}/info`)}
                                    onNewShow={() => setIsNewShowModalOpen(true)}
                                    onDeleteShow={handleDeleteShow}
                                    isLoading={isLoadingShows}
                                    user={session.user}
                                />
                            }
                        />
                        <Route path="/show/:showName" element={<ShowWrapper onShowUpdate={loadShows} />}>
                            <Route element={<ShowLayout />}>
                                <Route element={<ShowView />}>
                                    <Route index element={<Navigate to="info" replace />} />
                                    <Route path="info" element={<ShowInfoView />} />
                                    <Route path="loomlabels" element={<LoomLabelView />} />
                                    <Route path="caselabels" element={<CaseLabelView />} />
                                    <Route path="rackbuilder" element={<RackBuilderView />} />
                                    <Route path="wirediagram" element={<WireDiagramView />} />
                                    <Route path="loombuilder" element={<LoomBuilderView />} />
                                </Route>
                            </Route>
                        </Route>
                        <Route path="/account" element={<AccountView user={session.user} profile={profile} />} />
                        <Route path="/sso-setup" element={<AdvancedSSOView />} />
                        <Route path="/library" element={<ProtectedRoute profile={profile}><UserLibraryView /></ProtectedRoute>}>
                            <Route index element={<Navigate to="equipment" replace />} />
                            <Route path="equipment" element={<EquipmentLibraryView />} />
                            <Route path="racks" element={<UserRackBuilderView />} />
                        </Route>
                        <Route
                            path="/mgmt"
                            element={
                                <ProtectedRoute profile={profile} adminOnly={true}>
                                    <AdminLayout />
                                </ProtectedRoute>
                            }
                        >
                            <Route index element={<Navigate to="email" replace />} />
                            <Route path="email" element={<EmailView />} />
                            <Route path="equipment-library" element={<AdminEquipmentLibraryView />} />
                            <Route path="user-management" element={<UserManagementView />} />
                            <Route path="metrics" element={<MetricsView />} />
                        </Route>
                    </Routes>
                </main>
                <NewShowModal
                    isOpen={isNewShowModalOpen}
                    onClose={() => setIsNewShowModalOpen(false)}
                    onSubmit={handleCreateShow}
                />
            </div>
        </ShowsContext.Provider>
    );
};


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
        <div className="bg-gray-900 text-gray-300 font-sans h-full">
            {!session ? <Auth /> : <MainLayout session={session} profile={profile} />}
        </div>
    );
}

const ShowWrapper = ({ onShowUpdate }) => {
    const { showName } = useParams();
    const [showData, setShowData] = useState(null);
    const [racks, setRacks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchShowData = async () => {
            setIsLoading(true);
            try {
                // Fetch show data and racks in parallel
                const [data, racksData] = await Promise.all([
                    api.getShow(showName),
                    api.getRacksForShow(showName)
                ]);
                setShowData(data);
                setRacks(racksData);
            } catch (error) {
                console.error("Failed to fetch show data or racks:", error);
                navigate('/');
            } finally {
                setIsLoading(false);
            }
        };
        if (showName) {
            fetchShowData();
        }
    }, [showName, navigate]);

    const handleSaveShowData = async (updatedData) => {
        try {
            const originalName = showName;
            const newName = updatedData.info.show_name;

            await api.saveShow(originalName, updatedData);
            setShowData(updatedData);
            
            if (onShowUpdate) {
                onShowUpdate();
            }

            // If the name was changed, we must navigate to the new URL
            if (newName && newName !== originalName) {
                navigate(`/show/${encodeURIComponent(newName)}/info`, { replace: true });
            }
        } catch (error) {
            console.error("Failed to save show data:", error);
        }
    };

    return (
        <ShowProvider value={{ showData, racks, onSave: handleSaveShowData, isLoading, showName }}>
            <Outlet />
        </ShowProvider>
    );
};

