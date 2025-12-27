import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, useNavigate, useParams, Outlet, Navigate, useLocation } from 'react-router-dom';
import { supabase, api } from './api/api';
import toast, { Toaster } from 'react-hot-toast';

// Contexts
import { ShowProvider } from './contexts/ShowContext';
import { ShowsContext } from './contexts/ShowsContext';
import { ModalProvider } from './contexts/ModalContext';
import { ToastProvider } from './contexts/ToastContext';
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
import SwitchModelView from './views/admin/SwitchModelView';
import UserLibraryView from './views/UserLibraryView';
import EquipmentLibraryView from './views/EquipmentLibraryView';
import UserRackBuilderView from './views/UserRackBuilderView';
import ShowInfoView from './views/ShowInfoView';
import LoomLabelView from './views/LoomLabelView';
import CaseLabelView from './views/CaseLabelView';
import LabelEngineView from './views/LabelEngineView';
import RackBuilderView from './views/RackBuilderView';
import WireDiagramView from './views/WireDiagramView';
import LoomBuilderView from './views/LoomBuilderView';
import VLANView from './views/VLANView';
import RosterView from './views/RosterView';
import ShowCrewView from './views/ShowCrewView';
import HoursTrackingView from './views/HoursTrackingView';
import SwitchConfigView from './views/SwitchConfigView';
import TemplateManager from './views/settings/TemplateManager';
import ShowTeamView from './views/ShowTeamView';
import LabelTemplateListView from './views/library/LabelTemplateListView';
import LabelTemplateBuilder from './views/settings/LabelTemplateBuilder';

// Components
import NewShowModal from './components/NewShowModal';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import ConfirmationModal from './components/ConfirmationModal';
import ImpersonationBanner from './components/ImpersonationBanner';


const MainLayout = ({ session }) => {
    const { profile, isImpersonating } = useAuth();
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
            const createdShow = await api.createShow(newShowData);
            await loadShows();
            if (createdShow && createdShow.name) {
                const urlFriendlyName = createdShow.name.replace(/\s+/g, '-');
                navigate(`/show/${urlFriendlyName}/info`);
            }
        } catch (error) {
            console.error("Failed to create show:", error);
            toast.error(`Failed to create show: ${error.message}`);
        }
        setIsNewShowModalOpen(false);
    };

    const handleDeleteShow = (showId, showName) => {
        setConfirmationModal({
            isOpen: true,
            message: `Are you sure you want to delete "${showName}"? This action cannot be undone.`,
            onConfirm: async () => {
                try {
                    await api.deleteShow(showId);
                    loadShows();
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                } catch (error) {
                    console.error("Failed to delete show:", error);
                    toast.error(`Failed to delete show: ${error.message}`);
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                }
            }
        });
    };

    const handleToggleArchive = async (showId, currentStatus) => {
        const newStatus = currentStatus === 'archived' ? 'active' : 'archived';
        const action = newStatus === 'active' ? 'Unarchive' : 'Archive';
        
        const toastId = toast.loading(`${action}ing show...`);
        try {
            await api.updateShowSettings(showId, { status: newStatus });
            toast.success(`Show ${action}d!`, { id: toastId });
            loadShows();
        } catch (error) {
            toast.error(`Failed to ${action.toLowerCase()}: ${error.message}`, { id: toastId });
        }
    };

    return (
        <ShowsContext.Provider value={{ shows, isLoadingShows }}>
            <ToastProvider>
                <ModalProvider>
                    <LayoutContext.Provider value={layoutContextValue}>
                        <div className={`flex flex-col h-full ${isImpersonating ? 'pt-10' : ''}`}>
                            <ImpersonationBanner />
                            <Toaster position="bottom-center" />
                            <Navbar />
                            <main className={`flex-grow min-h-0 ${shouldScroll ? 'overflow-y-auto' : ''}`}>
                                <Routes>
                                    <Route
                                        path="/"
                                        element={
                                            <DashboardView
                                                shows={shows}
                                                onSelectShow={(showId) => {
                                                    const show = shows.find(s => s.id === showId);
                                                    if (show) {
                                                        navigate(`/show/${show.name.replace(/\s+/g, '-')}/info`);
                                                    }
                                                }}
                                                onNewShow={() => setIsNewShowModalOpen(true)}
                                                onDeleteShow={(showId, showName) => handleDeleteShow(showId, showName)}
                                                onToggleArchive={handleToggleArchive}
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
                                                <Route path="crew" element={<ProtectedRoute feature="crew"><ShowCrewView /></ProtectedRoute>} />
                                                <Route path="hourstracking" element={<ProtectedRoute feature="hours_tracking"><HoursTrackingView /></ProtectedRoute>} />
                                                <Route path="loomlabels" element={<ProtectedRoute feature="loom_labels"><LoomLabelView /></ProtectedRoute>} />
                                                <Route path="caselabels" element={<ProtectedRoute feature="case_labels"><CaseLabelView /></ProtectedRoute>} />
                                                <Route path="label-engine" element={<ProtectedRoute feature="label_engine_access"><LabelEngineView /></ProtectedRoute>} />
                                                <Route path="rackbuilder" element={<ProtectedRoute feature="rack_builder"><RackBuilderView /></ProtectedRoute>} />
                                                <Route path="switchconfig" element={<ProtectedRoute feature="switch_config"><SwitchConfigView /></ProtectedRoute>} />
                                                <Route path="wirediagram" element={<ProtectedRoute feature="wire_diagram"><WireDiagramView /></ProtectedRoute>} />
                                                <Route path="loombuilder" element={<ProtectedRoute feature="loom_builder"><LoomBuilderView /></ProtectedRoute>} />
                                                <Route path="vlan" element={<ProtectedRoute feature="vlan_management"><VLANView /></ProtectedRoute>} />
                                                <Route path="team" element={<ProtectedRoute feature="show_collaboration"><ShowTeamView /></ProtectedRoute>} />
                                            </Route>
                                        </Route>
                                    </Route>
                                    <Route path="/account" element={<AccountView />} />
                                    <Route path="/sso-setup" element={<AdvancedSSOView />} />
                                    <Route path="/settings/templates" element={<ProtectedRoute><TemplateManager /></ProtectedRoute>} />
                                    <Route path="/settings/label-template-builder" element={<ProtectedRoute feature="label_engine_access"><LabelTemplateBuilder /></ProtectedRoute>} />
                                    <Route path="/library" element={<ProtectedRoute><UserLibraryView /></ProtectedRoute>}>
                                        <Route index element={<Navigate to="equipment" replace />} />
                                        <Route path="equipment" element={<EquipmentLibraryView />} />
                                        <Route path="racks" element={<UserRackBuilderView />} />
                                        <Route path="label-templates" element={<LabelTemplateListView />} />
                                    </Route>
                                    <Route path="/roster" element={<ProtectedRoute><RosterView /></ProtectedRoute>} />
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
                                        <Route path="switch-models" element={<SwitchModelView />} />
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
            </ToastProvider>
        </ShowsContext.Provider>
    );
};

const ShowWrapper = ({ onShowUpdate }) => {
    const { showName } = useParams();
    const [showData, setShowData] = useState(null);
    const [racks, setRacks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();

    const fetchShowData = useCallback(async () => {
        setIsLoading(true);
        try {
            const fullShowObject = await api.getShowByName(showName);
            const racksData = await api.getDetailedRacksForShow(fullShowObject.id);
            setShowData(fullShowObject); // Store the full object
            setRacks(racksData);
        } catch (error) {
            console.error("Failed to fetch show data by name:", error);
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

    const handleSaveShowData = async (updatedShowDataBlob) => {
        if (!showData || !showData.id) return;
        try {
            await api.saveShow(showData.id, updatedShowDataBlob);
            toast.success("Show saved successfully.");

            const oldUrlFriendlyName = showName.replace(/\s+/g, '-');
            const newUrlFriendlyName = updatedShowDataBlob.info.show_name.replace(/\s+/g, '-');

            if (oldUrlFriendlyName !== newUrlFriendlyName) {
                const newPath = location.pathname.replace(oldUrlFriendlyName, newUrlFriendlyName);
                navigate(newPath, { replace: true });
            } else {
                 // Create a new full show object with the updated data blob
                 setShowData(prevShowData => ({
                    ...prevShowData,
                    data: updatedShowDataBlob
                 }));
            }

            if (onShowUpdate) {
                onShowUpdate();
            }
        } catch (error) {
            console.error("Failed to save show data:", error);
            toast.error(`Failed to save show: ${error.message}`);
        }
    };
    
    const showId = showData ? showData.id : null;
    const has_notes = showData ? showData.has_notes : false;
    const showOwnerId = showData ? showData.user_id : null;
    // Pass the nested 'data' object to the provider for backward compatibility
    const providerShowData = showData ? showData.data : null;

    return (
        <ShowProvider value={{ showData: providerShowData, racks, onSave: handleSaveShowData, isLoading, showId, refreshRacks: fetchShowData, has_notes, showOwnerId }}>
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