import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
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

// Views — shell views stay eager; heavy feature/admin views are code-split so their
// large dependencies (React Flow, dagre, dnd-kit, Tiptap, etc.) leave the initial bundle.
import Auth from './views/Auth';
import DashboardView from './views/DashboardView';
import ShowView from './views/ShowView';
import ShowInfoView from './views/ShowInfoView';
import AdminLayout from './layouts/AdminLayout';
import ShowLayout from './layouts/ShowLayout';

// Components
import NewShowModal from './components/NewShowModal';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import ConfirmationModal from './components/ConfirmationModal';
import ImpersonationBanner from './components/ImpersonationBanner';

const AccountView = lazy(() => import('./views/AccountView'));
const AdvancedSSOView = lazy(() => import('./views/AdvancedSSOView'));
const EmailView = lazy(() => import('./views/admin/EmailView'));
const AdminEquipmentLibraryView = lazy(() => import('./views/admin/EquipmentLibraryView'));
const UserManagementView = lazy(() => import('./views/admin/UserManagementView'));
const MetricsView = lazy(() => import('./views/admin/MetricsView'));
const RbacView = lazy(() => import('./views/admin/RbacView'));
const SwitchModelView = lazy(() => import('./views/admin/SwitchModelView'));
const PanelLibraryView = lazy(() => import('./views/admin/PanelLibraryView'));
const UserLibraryView = lazy(() => import('./views/UserLibraryView'));
const EquipmentLibraryView = lazy(() => import('./views/EquipmentLibraryView'));
const UserRackBuilderView = lazy(() => import('./views/UserRackBuilderView'));
const LoomLabelView = lazy(() => import('./views/LoomLabelView'));
const CaseLabelView = lazy(() => import('./views/CaseLabelView'));
const RackBuilderView = lazy(() => import('./views/RackBuilderView'));
const WireDiagramView = lazy(() => import('./views/WireDiagramView'));
const LoomBuilderView = lazy(() => import('./views/LoomBuilderView'));
const VLANView = lazy(() => import('./views/VLANView'));
const NetworkIpsView = lazy(() => import('./views/NetworkIpsView'));
const PanelBuilderView = lazy(() => import('./views/PanelBuilderView'));
const RosterView = lazy(() => import('./views/RosterView'));
const ShowCrewView = lazy(() => import('./views/ShowCrewView'));
const HoursTrackingView = lazy(() => import('./views/HoursTrackingView'));
const SwitchConfigView = lazy(() => import('./views/SwitchConfigView'));
const TemplateManager = lazy(() => import('./views/settings/TemplateManager'));
const ShowTeamView = lazy(() => import('./views/ShowTeamView'));
const LabelTemplateListView = lazy(() => import('./views/library/LabelTemplateListView'));
const LabelTemplateBuilder = lazy(() => import('./views/settings/LabelTemplateBuilder'));


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
            toast.error("Show name cannot be empty or a duplicate.");
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
                              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-xl text-gray-400">Loading...</div></div>}>
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
                                                {/* REMOVED: route path="label-engine" */}
                                                <Route path="rackbuilder" element={<ProtectedRoute feature="rack_builder"><RackBuilderView /></ProtectedRoute>} />
                                                <Route path="networkips" element={<ProtectedRoute feature="networking_ips"><NetworkIpsView /></ProtectedRoute>} />
                                                <Route path="switchconfig" element={<ProtectedRoute feature="switch_config"><SwitchConfigView /></ProtectedRoute>} />
                                                <Route path="wirediagram" element={<ProtectedRoute feature="wire_diagram"><WireDiagramView /></ProtectedRoute>} />
                                                <Route path="loombuilder" element={<ProtectedRoute feature="loom_builder"><LoomBuilderView /></ProtectedRoute>} />
                                                <Route path="vlan" element={<ProtectedRoute feature="vlan_management"><VLANView /></ProtectedRoute>} />
                                                <Route path="panelbuilder" element={<ProtectedRoute feature="panel_builder"><PanelBuilderView /></ProtectedRoute>} />
                                                <Route path="team" element={<ProtectedRoute feature="show_collaboration"><ShowTeamView /></ProtectedRoute>} />
                                            </Route>
                                        </Route>
                                    </Route>
                                    <Route path="/account" element={<AccountView />} />
                                    <Route path="/sso-setup" element={<AdvancedSSOView />} />
                                    <Route path="/settings/templates" element={<ProtectedRoute><TemplateManager /></ProtectedRoute>} />
                                    <Route path="/settings/label-template-builder" element={<ProtectedRoute feature="label_engine"><LabelTemplateBuilder /></ProtectedRoute>} />
                                    <Route path="/settings/label-template-builder/:templateId" element={<ProtectedRoute feature="label_engine"><LabelTemplateBuilder /></ProtectedRoute>} />
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
                                        <Route path="panel-library" element={<PanelLibraryView />} />
                                    </Route>
                                </Routes>
                              </Suspense>
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
    const [networkIps, setNetworkIps] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRackDataLoading, setIsRackDataLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();

    // Rack + network-IP data is only needed by a few tabs (Rack Builder, Wire Diagram,
    // Network IPs, Panels). Load it in the background so the show shell and the other
    // tabs (Info, Hours, Comms, Labels) are not gated on it.
    const fetchRackData = useCallback(async (showIdArg) => {
        if (!showIdArg) return;
        setIsRackDataLoading(true);
        try {
            const [racksData, ipsData] = await Promise.all([
                api.getDetailedRacksForShow(showIdArg),
                api.getNetworkIps(showIdArg)
            ]);
            setRacks(racksData || []);
            setNetworkIps(ipsData || []);
        } catch (error) {
            console.error("Failed to fetch rack/network data:", error);
        } finally {
            setIsRackDataLoading(false);
        }
    }, []);

    const fetchShowData = useCallback(async () => {
        setIsLoading(true);
        try {
            const fullShowObject = await api.getShowByName(showName);
            setShowData(fullShowObject); // Store the full object
            setIsLoading(false);         // unblock the shell as soon as the show resolves
            fetchRackData(fullShowObject.id); // background, not awaited
        } catch (error) {
            console.error("Failed to fetch show data by name:", error);
            setIsLoading(false);
            navigate('/');
        }
    }, [showName, navigate, fetchRackData]);

    useEffect(() => {
        if (showName) {
            fetchShowData();
        }
    }, [showName, fetchShowData]);

    const refreshNetworkIps = useCallback(async () => {
        if (!showData?.id) return;
        try {
            const ipsData = await api.getNetworkIps(showData.id);
            setNetworkIps(ipsData || []);
        } catch (error) {
            console.error("Failed to refresh network IPs:", error);
        }
    }, [showData?.id]);

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
        <ShowProvider value={{
            showData: providerShowData,
            racks,
            networkIps,
            onSave: handleSaveShowData,
            isLoading,
            isRackDataLoading,
            showId,
            refreshRacks: () => fetchRackData(showId),
            refreshNetworkIps,
            has_notes,
            showOwnerId
        }}>
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