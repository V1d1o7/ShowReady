import React, { useState, useEffect } from 'react';
import SwitchConfigSidebar from '../components/SwitchConfigSidebar';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import Card from '../components/Card';
import PortConfigModal from '../components/PortConfigModal';
import PushConfigModal from '../components/PushConfigModal';
import toast from 'react-hot-toast';

const PortGrid = ({ switchDetails, portConfigs, onPortClick }) => {
    if (!switchDetails) return null;

    const ports = Array.from({ length: switchDetails.port_count }, (_, i) => i + 1);

    return (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-4">
            {ports.map(portNumber => {
                const config = portConfigs ? portConfigs[portNumber] : null;
                const hasConfig = config && (config.port_name || config.pvid || (config.tagged_vlans && config.tagged_vlans.length > 0));

                return (
                    <div
                        key={portNumber}
                        onClick={() => onPortClick(portNumber, config)}
                        className={`p-2 rounded-lg text-center cursor-pointer transition-all duration-200 
                                    ${hasConfig ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'}
                                    border-2 ${hasConfig ? 'border-blue-400' : 'border-gray-600'}`}
                    >
                        <p className="font-bold text-lg">{portNumber}</p>
                        <p className="text-xs truncate text-gray-300">{config?.port_name || 'Unconfigured'}</p>
                    </div>
                );
            })}
        </div>
    );
};


const SwitchConfigView = () => {
    const { showId } = useShow();
    const [selectedSwitch, setSelectedSwitch] = useState(null);
    const [switchDetails, setSwitchDetails] = useState(null);
    const [portConfigs, setPortConfigs] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [isPortModalOpen, setIsPortModalOpen] = useState(false);
    const [selectedPort, setSelectedPort] = useState({ number: null, config: null });

    const [isPushModalOpen, setIsPushModalOpen] = useState(false);
    const [isPushing, setIsPushing] = useState(false);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!selectedSwitch || !selectedSwitch.switch_config_id) {
                setSwitchDetails(null);
                setPortConfigs({});
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

            } catch (error) {
                console.error("Failed to fetch switch details:", error);
                toast.error("Could not load switch details.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [selectedSwitch]);

    const handlePortClick = (portNumber, portConfig) => {
        setSelectedPort({ number: portNumber, config: portConfig });
        setIsPortModalOpen(true);
    };

    const handleClosePortModal = () => {
        setIsPortModalOpen(false);
        setSelectedPort({ number: null, config: null });
    };

    // This now updates the local state, not the API
    const handleUpdatePortConfig = (portNumber, configData) => {
        setPortConfigs(prev => ({
            ...prev,
            [portNumber]: configData
        }));
        toast.success(`Port ${portNumber} updated locally.`, { duration: 2000 });
        handleClosePortModal();
    };
    
    // New function to save all changes at once
    const handleSaveChanges = async () => {
        if (!switchDetails) return;
        setIsSaving(true);
        try {
            await api.saveSwitchPortConfig(switchDetails.id, portConfigs);
            toast.success("All port configurations saved!");
        } catch (error) {
            console.error("Failed to save port configs:", error);
            toast.error(`Error saving changes: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };


    const handlePush = async (pushData) => {
        if (!switchDetails) return;
        setIsPushing(true);
        const toastId = toast.loading("Starting configuration push...");

        try {
            const job = await api.pushSwitchConfig(switchDetails.id, pushData);
            setIsPushModalOpen(false);

            const pollStatus = async (jobId) => {
                try {
                    const statusRes = await api.getPushJobStatus(jobId);
                    if (statusRes.status === 'success') {
                        toast.success(`Successfully pushed config!\n${statusRes.result_log || ''}`, { id: toastId, duration: 6000 });
                        setIsPushing(false);
                    } else if (statusRes.status === 'failed') {
                        toast.error(`Push failed:\n${statusRes.result_log || 'Unknown error'}`, { id: toastId, duration: 10000 });
                        setIsPushing(false);
                    } else if (statusRes.status === 'running') {
                        toast.loading("Agent is running commands...", { id: toastId });
                        setTimeout(() => pollStatus(jobId), 3000);
                    } else { // pending
                        setTimeout(() => pollStatus(jobId), 3000);
                    }
                } catch (pollError) {
                    toast.error(`Error checking job status: ${pollError.message}`, { id: toastId });
                    setIsPushing(false);
                }
            };

            setTimeout(() => pollStatus(job.id), 2000);

        } catch (error) {
            toast.error(`Failed to start push: ${error.message}`, { id: toastId });
            setIsPushing(false);
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
                            <PortGrid
                                switchDetails={switchDetails}
                                portConfigs={portConfigs}
                                onPortClick={handlePortClick}
                            />
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
                    onSave={handleUpdatePortConfig}
                />
            )}

            {isPushModalOpen && (
                <PushConfigModal
                    isOpen={isPushModalOpen}
                    onClose={() => setIsPushModalOpen(false)}
                    onPush={handlePush}
                    isPushing={isPushing}
                />
            )}
        </div>
    );
};

export default SwitchConfigView;
