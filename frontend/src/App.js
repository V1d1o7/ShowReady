import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, useNavigate, useParams, Outlet, Navigate } from 'react-router-dom';
import { supabase, api } from './api/api';

// Contexts
import { ShowProvider } from './contexts/ShowContext';
import { ShowsContext } from './contexts/ShowsContext';
import { ModalProvider } from './contexts/ModalContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LayoutContext } from './contexts/LayoutContext';

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
import RbacView from './views/admin/RbacView';
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
import ConfirmationModal from './components/ConfirmationModal';


const MainLayout = ({ session }) => {
    const { profile } = useAuth();
    const [shows, setShows] = useState([]);
    const [isLoadingShows, setIsLoadingShows] = useState(true);
    const [isNewShowModalOpen, setIsNewShowModalOpen] = useState(false);
    const navigate = useNavigate();

    const [shouldScroll, setShouldScroll] = useState(false);
    const layoutContextValue = useMemo(() => ({ setShouldScroll }), [setShouldScroll]);
    const [confirmationModal, setConfirmationModal] = useState({ isOpen: false, message: '', onConfirm: () => {} });

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
            await loadShows();
            navigate(`/show/${encodeURIComponent(newShowName)}/info`);
        } catch (error) {
            console.error("Failed to create show:", error);
        }
        setIsNewShowModalOpen(false);
    };

    const handleDeleteShow = (showNameToDelete) => {
        setConfirmationModal({
            isOpen: true,
            message: `Are you sure you want to delete "${showNameToDelete}"? This action cannot be undone.`,
            onConfirm: async () => {
                try {
                    await api.deleteShow(showNameToDelete);
                    loadShows();
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                } catch (error) {
                    console.error("Failed to delete show:", error);
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                }
            }
        });
    };

    return (
        <ShowsContext.Provider value={{ shows, isLoadingShows }}>
            <ModalProvider>
                <LayoutContext.Provider value={layoutContextValue}>
                    <div className="flex flex-col h-full">
                        <Navbar />
                        <main className={`flex-grow min-h-0 ${shouldScroll ? 'overflow-y-auto' : ''}`}>
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
                                            <Route path="loomlabels" element={<ProtectedRoute feature="loom_labels"><LoomLabelView /></ProtectedRoute>} />
                                            <Route path="caselabels" element={<ProtectedRoute feature="case_labels"><CaseLabelView /></ProtectedRoute>} />
                                            <Route path="rackbuilder" element={<ProtectedRoute feature="rack_builder"><RackBuilderView /></ProtectedRoute>} />
                                            <Route path="wirediagram" element={<ProtectedRoute feature="wire_diagram"><WireDiagramView /></ProtectedRoute>} />
                                            <Route path="loombuilder" element={<ProtectedRoute feature="loom_builder"><LoomBuilderView /></ProtectedRoute>} />
                                        </Route>
                                    </Route>
                                </Route>
                                <Route path="/account" element={<AccountView />} />
                                <Route path="/sso-setup" element={<AdvancedSSOView />} />
                                <Route path="/library" element={<ProtectedRoute><UserLibraryView /></ProtectedRoute>}>
                                    <Route index element={<Navigate to="equipment" replace />} />
                                    <Route path="equipment" element={<EquipmentLibraryView />} />
                                    <Route path="racks" element={<UserRackBuilderView />} />
                                </Route>
                                <Route
                                    path="/mgmt"
                                    element={
                                        <ProtectedRoute adminOnly={true}>
                                            <AdminLayout />
                                        </ProtectedRoute>
                                    }
                                >
                                    <Route index element={<Navigate to="email" replace />} />
                                    <Route path="email" element={<EmailView />} />
                                    <Route path="equipment-library" element={<AdminEquipmentLibraryView />} />
                                    <Route path="user-management" element={<UserManagementView />} />
                                    <Route path="metrics" element={<MetricsView />} />
                                    <Route path="rbac" element={<RbacView />} />
                                </Route>
                            </Routes>
                        </main>
                        <NewShowModal
                            isOpen={isNewShowModalOpen}
                            onClose={() => setIsNewShowModalOpen(false)}
                            onSubmit={handleCreateShow}
                        />
                        {confirmationModal.isOpen && (
                            <ConfirmationModal
                                message={confirmationModal.message}
                                onConfirm={confirmationModal.onConfirm}
                                onCancel={() => setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} })}
                            />
                        )}
                    </div>
                </LayoutContext.Provider>
            </ModalProvider>
        </ShowsContext.Provider>
    );
};

const ShowWrapper = ({ onShowUpdate }) => {
    const { showName } = useParams();
    const [showData, setShowData] = useState(null);
    const [racks, setRacks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    const fetchShowData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [data, racksData] = await Promise.all([
                api.getShow(showName),
                api.getDetailedRacksForShow(showName)
            ]);
            setShowData(data);
            setRacks(racksData);
        } catch (error) {
            console.error("Failed to fetch show data:", error);
            navigate('/');
        } finally {
            setIsLoading(false);
        }
    }, [showName, navigate]);

    useEffect(() => {
        if (showName) {
            fetchShowData();
        }
    }, [showName, fetchShowData]);

    const handleSaveShowData = async (updatedData) => {
        try {
            const originalName = showName;
            const newName = updatedData.info.show_name;

            await api.saveShow(originalName, updatedData);
            setShowData(updatedData);
            
            if (onShowUpdate) {
                onShowUpdate();
            }

            if (newName && newName !== originalName) {
                navigate(`/show/${encodeURIComponent(newName)}/info`, { replace: true });
            }
        } catch (error) {
            console.error("Failed to save show data:", error);
        }
    };

    return (
        <ShowProvider value={{ showData, racks, onSave: handleSaveShowData, isLoading, showName, refreshRacks: fetchShowData }}>
            <Outlet />
        </ShowProvider>
    );
};

function AppContent() {
    const { session, isLoading } = useAuth();

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen bg-gray-900"><div className="text-xl text-gray-400">Loading...</div></div>;
    }

    return (
        <div className="bg-gray-900 text-gray-300 font-sans h-full">
            {!session ? <Auth /> : <MainLayout session={session} />}
        </div>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}
