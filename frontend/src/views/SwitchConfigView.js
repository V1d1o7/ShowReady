import React, { useState, useEffect, useContext } from 'react';
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
    const configsByPort = portConfigs.reduce((acc, conf) => {
        acc[conf.port_number] = conf.config;
        return acc;
    }, {});

    return (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-4">
            {ports.map(portNumber => {
                const config = configsByPort[portNumber];
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
    const [portConfigs, setPortConfigs] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    
    const [isPortModalOpen, setIsPortModalOpen] = useState(false);
    const [selectedPort, setSelectedPort] = useState({ number: null, config: null });
    
    const [isPushModalOpen, setIsPushModalOpen] = useState(false);
    const [isPushing, setIsPushing] = useState(false);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!selectedSwitch || !selectedSwitch.switch_config_id) {
                setSwitchDetails(null);
                setPortConfigs([]);
                return;
            }
            
            setIsLoading(true);
            try {
                const detailsPromise = api.getSwitchDetails(selectedSwitch.switch_config_id);
                const configPromise = api.getSwitchPortConfig(selectedSwitch.switch_config_id);
                
                const [details, configs] = await Promise.all([detailsPromise, configPromise]);
                
                setSwitchDetails(details);
                setPortConfigs(configs);

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

    const handleSavePortConfig = async (portNumber, configData) => {
        if (!switchDetails) return;
        try {
            const updatedConfig = await api.saveSwitchPortConfig(switchDetails.id, {
                port_number: portNumber,
                config: configData
            });

            setPortConfigs(prev => {
                const existingIndex = prev.findIndex(p => p.port_number === portNumber);
                if (existingIndex > -1) {
                    return prev.map((p, i) => i === existingIndex ? updatedConfig : p);
                } else {
                    return [...prev, updatedConfig];
                }
            });
            toast.success(`Port ${portNumber} configuration saved!`);
            handleClosePortModal();
        } catch (error) {
            console.error("Failed to save port config:", error);
            toast.error(`Error saving port config: ${error.message}`);
        }
    };

    const handlePush = async (pushData) => {
        if (!switchDetails) return;
        setIsPushing(true);
        const toastId = toast.loading("Starting configuration push...");

        try {
            const job = await api.pushSwitchConfig(switchDetails.id, pushData);
            setIsPushModalOpen(false);
            
            // Poll for job status
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
                                <button 
                                    onClick={() => setIsPushModalOpen(true)}
                                    className="px-4 py-2 bg-green-500 text-white font-bold rounded-lg hover:bg-green-400"
                                >
                                    Push Config
                                </button>
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
                    onSave={handleSavePortConfig}
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
