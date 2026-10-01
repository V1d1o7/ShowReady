import React, { useState, useEffect } from 'react';
import SwitchConfigSidebar from '../components/SwitchConfigSidebar';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import Card from '../components/Card';
import PortConfigModal from '../components/PortConfigModal';
import LagConfigModal from '../components/LagConfigModal';
import PushConfigModal from '../components/PushConfigModal';
import SwitchFaceplate from '../components/SwitchFaceplate';
import toast from 'react-hot-toast';


const DeviceSettingsPanel = ({ settings, onChange, onSave, isSaving }) => (
    <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-700 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-sm">
            <span className="block text-gray-400 mb-1">Switch Name</span>
            <input
                type="text"
                value={settings.name || ''}
                onChange={(e) => onChange({ ...settings, name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1"
            />
        </label>
        <label className="text-sm">
            <span className="block text-gray-400 mb-1">Location</span>
            <input
                type="text"
                value={settings.location || ''}
                onChange={(e) => onChange({ ...settings, location: e.target.value })}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1"
            />
        </label>
        <label className="text-sm">
            <span className="block text-gray-400 mb-1">Login Timeout (minutes)</span>
            <input
                type="number"
                min="0"
                value={settings.login_timeout_minutes ?? ''}
                onChange={(e) => onChange({ ...settings, login_timeout_minutes: e.target.value === '' ? null : Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1"
            />
        </label>
        <div className="flex flex-col gap-2 justify-center text-sm">
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={!!settings.green_ethernet_enabled}
                    onChange={(e) => onChange({ ...settings, green_ethernet_enabled: e.target.checked })}
                />
                Green Ethernet enabled
            </label>
            <p className="text-xs text-gray-500">
                IGMP snooping and multicast flooding are set per-VLAN now, not per-switch — see the VLAN Management tab.
            </p>
        </div>

        <div className="sm:col-span-2 pt-2 mt-2 border-t border-gray-700">
            <p className="text-sm font-bold text-gray-300 mb-3">RADIUS Authentication</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="text-sm">
                    <span className="block text-gray-400 mb-1">Server Host</span>
                    <input
                        type="text"
                        value={settings.radius_server_host || ''}
                        onChange={(e) => onChange({ ...settings, radius_server_host: e.target.value })}
                        placeholder="e.g., 10.0.40.115"
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1"
                    />
                </label>
                <label className="text-sm">
                    <span className="block text-gray-400 mb-1">Server Name</span>
                    <input
                        type="text"
                        value={settings.radius_server_name || ''}
                        onChange={(e) => onChange({ ...settings, radius_server_name: e.target.value })}
                        placeholder="e.g., KP-RADIUS"
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1"
                    />
                </label>
                <label className="text-sm">
                    <span className="block text-gray-400 mb-1">Shared Secret</span>
                    <input
                        type="password"
                        value={settings.radius_server_key || ''}
                        onChange={(e) => onChange({ ...settings, radius_server_key: e.target.value })}
                        placeholder={settings.radius_server_host ? 'Already set — leave blank to keep' : ''}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1"
                    />
                </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
                The secret is encrypted at rest and never sent back to the browser after saving — leave it blank on
                future saves to keep the existing one.
            </p>
        </div>

        <div className="sm:col-span-2 flex justify-end">
            <button
                onClick={onSave}
                disabled={isSaving}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-sm disabled:opacity-50"
            >
                {isSaving ? 'Saving…' : 'Save Switch Settings'}
            </button>
        </div>
    </div>
);

const SwitchConfigView = () => {
    const { showId } = useShow();
    const [selectedSwitch, setSelectedSwitch] = useState(null);
    const [switchDetails, setSwitchDetails] = useState(null);
    const [portConfigs, setPortConfigs] = useState({});
    const [lagConfigs, setLagConfigs] = useState({});
    const [deviceSettings, setDeviceSettings] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    const [isPortModalOpen, setIsPortModalOpen] = useState(false);
    const [selectedPort, setSelectedPort] = useState({ number: null, config: null });

    const [isLagModalOpen, setIsLagModalOpen] = useState(false);
    const [selectedLag, setSelectedLag] = useState({ id: null, config: null });

    const [isPushModalOpen, setIsPushModalOpen] = useState(false);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!selectedSwitch || !selectedSwitch.switch_config_id) {
                setSwitchDetails(null);
                setPortConfigs({});
                setLagConfigs({});
                setDeviceSettings({});
                return;
            }

            setIsLoading(true);
            try {
                // The new API for details includes the port_config
                const details = await api.getSwitchDetails(selectedSwitch.switch_config_id);
                setSwitchDetails(details);
                // The config is now a nested object on the switch_configs record
                const fullConfig = await api.getSwitchConfig(selectedSwitch.switch_config_id);
                setPortConfigs(fullConfig.port_config || {});
                setLagConfigs(fullConfig.lag_config || {});
                setDeviceSettings(fullConfig.device_settings || {});

            } catch (error) {
                console.error("Failed to fetch switch details:", error);
                toast.error("Could not load switch details.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [selectedSwitch]);

    const getMaxPortNumber = (details) => {
        if (!details) return 0;
        const hasSplit = !!(details.copper_port_count || details.sfp_port_count);
        return hasSplit ? (details.copper_port_count || 0) + (details.sfp_port_count || 0) : (details.port_count || 0);
    };

    const handlePortClick = (portNumber, portConfig) => {
        setSelectedPort({ number: portNumber, config: portConfig });
        setIsPortModalOpen(true);
    };

    const handleClosePortModal = () => {
        setIsPortModalOpen(false);
        setSelectedPort({ number: null, config: null });
    };

    // Updates local state (not the API -- "Save Changes" persists everything at once)
    // and, for a fully keyboard-driven workflow, auto-advances straight into the next
    // port's modal rather than closing, so a tech can Tab/type/Enter through the whole
    // switch without touching a mouse. Escape at any point stops the chain.
    const handleUpdatePortConfig = (portNumber, configData) => {
        const updated = { ...portConfigs, [portNumber]: configData };
        setPortConfigs(updated);
        toast.success(`Port ${portNumber} updated locally.`, { duration: 1500 });

        const nextPort = Number(portNumber) + 1;
        if (nextPort <= getMaxPortNumber(switchDetails)) {
            setSelectedPort({ number: nextPort, config: updated[nextPort] || null });
        } else {
            handleClosePortModal();
        }
    };
    
    // New function to save all changes at once
    const handleSaveChanges = async () => {
        if (!switchDetails) return;
        setIsSaving(true);
        try {
            await Promise.all([
                api.saveSwitchPortConfig(switchDetails.id, portConfigs),
                api.saveSwitchLagConfig(switchDetails.id, lagConfigs),
            ]);
            toast.success("All port and LAG configurations saved!");
        } catch (error) {
            console.error("Failed to save port/LAG configs:", error);
            toast.error(`Error saving changes: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // --- LAG (Link Aggregation Group) handlers ---
    // Mirrors the port-config flow: modal edits update local state only, "Save Changes"
    // above persists everything together.
    const allPortNumbers = Array.from({ length: getMaxPortNumber(switchDetails) }, (_, i) => i + 1);

    const portToLagId = {};
    Object.entries(lagConfigs).forEach(([lagId, cfg]) => {
        (cfg.member_ports || []).forEach(p => { portToLagId[p] = lagId; });
    });

    const getAvailablePortsForLag = (lagId) => {
        const usedByOtherLags = new Set();
        Object.entries(lagConfigs).forEach(([id, cfg]) => {
            if (id !== String(lagId)) (cfg.member_ports || []).forEach(p => usedByOtherLags.add(p));
        });
        return allPortNumbers.filter(p => !usedByOtherLags.has(p));
    };

    const handleAddLag = () => {
        const existingIds = Object.keys(lagConfigs).map(Number);
        const nextId = existingIds.length ? Math.max(...existingIds) + 1 : 1;
        setSelectedLag({ id: nextId, config: null });
        setIsLagModalOpen(true);
    };

    const handleEditLag = (lagId) => {
        setSelectedLag({ id: Number(lagId), config: lagConfigs[lagId] });
        setIsLagModalOpen(true);
    };

    const handleCloseLagModal = () => {
        setIsLagModalOpen(false);
        setSelectedLag({ id: null, config: null });
    };

    const handleSaveLag = (lagId, configData) => {
        setLagConfigs(prev => ({ ...prev, [lagId]: configData }));
        toast.success(`LAG ${lagId} updated locally.`, { duration: 1500 });
        handleCloseLagModal();
    };

    const handleDeleteLag = (lagId) => {
        setLagConfigs(prev => {
            const updated = { ...prev };
            delete updated[lagId];
            return updated;
        });
        toast.success(`LAG ${lagId} removed locally.`, { duration: 1500 });
        handleCloseLagModal();
    };

    const handleSaveDeviceSettings = async () => {
        if (!switchDetails) return;
        setIsSavingSettings(true);
        try {
            await api.saveSwitchDeviceSettings(switchDetails.id, deviceSettings);
            // The backend never returns the RADIUS key -- blank the local field too,
            // same convention as the SMTP password field in AccountView.
            setDeviceSettings(prev => ({ ...prev, radius_server_key: '' }));
            toast.success("Switch settings saved!");
        } catch (error) {
            console.error("Failed to save switch settings:", error);
            toast.error(`Error saving switch settings: ${error.message}`);
        } finally {
            setIsSavingSettings(false);
        }
    };

    return (
        <div className="flex h-full gap-8 p-4 sm:p-6 lg:p-8">
            <div className="w-1/3 xl:w-1/4 flex-shrink-0">
                <SwitchConfigSidebar onSelectSwitch={setSelectedSwitch} />
            </div>
            <div className="w-2/3 xl:w-3/4">
                <Card className="h-full">
                    {isLoading && <p>Loading...</p>}

                    {!isLoading && !switchDetails && (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-gray-400">Select a switch from the sidebar to view its configuration.</p>
                        </div>
                    )}

                    {!isLoading && switchDetails && (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold">{switchDetails.name}</h2>
                                    <p className="text-gray-400">{switchDetails.model_name}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                     <button
                                        onClick={handleSaveChanges}
                                        disabled={isSaving}
                                        className="px-4 py-2 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-400 disabled:bg-gray-500"
                                    >
                                        {isSaving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                    <button
                                        onClick={() => setIsPushModalOpen(true)}
                                        className="px-4 py-2 bg-green-500 text-white font-bold rounded-lg hover:bg-green-400"
                                    >
                                        Push Config
                                    </button>
                                </div>
                            </div>
                            <DeviceSettingsPanel
                                settings={deviceSettings}
                                onChange={setDeviceSettings}
                                onSave={handleSaveDeviceSettings}
                                isSaving={isSavingSettings}
                            />
                            <SwitchFaceplate
                                switchDetails={switchDetails}
                                portConfigs={portConfigs}
                                portToLagId={portToLagId}
                                onPortClick={handlePortClick}
                                onLagPortClick={handleEditLag}
                            />

                            <div className="mt-6 pt-4 border-t border-gray-700">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-lg font-bold">Link Aggregation Groups</h3>
                                    <button
                                        onClick={handleAddLag}
                                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-bold"
                                    >
                                        + New LAG
                                    </button>
                                </div>
                                {Object.keys(lagConfigs).length === 0 ? (
                                    <p className="text-sm text-gray-500">No LAGs configured.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {Object.entries(lagConfigs)
                                            .sort((a, b) => Number(a[0]) - Number(b[0]))
                                            .map(([lagId, cfg]) => (
                                                <button
                                                    key={lagId}
                                                    onClick={() => handleEditLag(lagId)}
                                                    className="w-full text-left flex items-center justify-between p-2 rounded-lg bg-gray-900 border border-gray-700 hover:border-amber-400"
                                                >
                                                    <span className="font-bold">
                                                        LAG {lagId}{cfg.lag_name ? `: ${cfg.lag_name}` : ''}
                                                    </span>
                                                    <span className="text-sm text-gray-400">
                                                        Ports {(cfg.member_ports || []).join(', ')}
                                                    </span>
                                                </button>
                                            ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </Card>
            </div>

            {isPortModalOpen && (
                <PortConfigModal
                    isOpen={isPortModalOpen}
                    onClose={handleClosePortModal}
                    portNumber={selectedPort.number}
                    portConfig={selectedPort.config}
                    switchId={switchDetails?.id}
                    totalPorts={getMaxPortNumber(switchDetails)}
                    onSave={handleUpdatePortConfig}
                />
            )}

            {isLagModalOpen && (
                <LagConfigModal
                    isOpen={isLagModalOpen}
                    onClose={handleCloseLagModal}
                    lagId={selectedLag.id}
                    lagConfig={selectedLag.config}
                    availablePorts={getAvailablePortsForLag(selectedLag.id)}
                    onSave={handleSaveLag}
                    onDelete={handleDeleteLag}
                />
            )}

            {isPushModalOpen && (
                <PushConfigModal
                    isOpen={isPushModalOpen}
                    onClose={() => setIsPushModalOpen(false)}
                    switchId={switchDetails?.id}
                    driverType={switchDetails?.driver_type}
                    initialManagementIp={switchDetails?.management_ip}
                />
            )}
        </div>
    );
};

export default SwitchConfigView;
