import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/api';
import { useAuth } from '../../contexts/AuthContext';
import Card from '../../components/Card';
import MultiSelect from '../../components/MultiSelect';
import FeatureConfigModal from '../../components/FeatureConfigModal';
import toast, { Toaster } from 'react-hot-toast';
import { ShieldCheck, HelpCircle, Settings, Users } from 'lucide-react';

/**
 * CONFIGURATION: Maps Features to Database Limits.
 * Only features listed here will show the "Settings" gear icon.
 */
const FEATURE_LIMITS_MAP = {
    'show_collaboration': [
        { 
            key: 'max_collaborators', 
            label: 'Max Team Members', 
            icon: Users,
            description: 'Number of people an owner can invite to a show.',
            placeholder: 'Unlimited (-1)'
        }
    ]
};

const RbacView = () => {
    const { refetchProfile } = useAuth();
    
    // State
    const [restrictions, setRestrictions] = useState([]);
    const [originalRestrictions, setOriginalRestrictions] = useState([]);
    const [tierLimits, setTierLimits] = useState([]); 
    const [tiersDropdown, setTiersDropdown] = useState([]); 
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    // Modal State
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [selectedFeature, setSelectedFeature] = useState(null);

    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const [restrictionsData, detailedTiers] = await Promise.all([
                api.getAllFeatureRestrictions(),
                api.getDetailedTiers()
            ]);
            
            // Sort restrictions alphabetically by display_name
            restrictionsData.sort((a, b) => a.display_name.localeCompare(b.display_name));
            
            setRestrictions(restrictionsData);
            setOriginalRestrictions(JSON.parse(JSON.stringify(restrictionsData)));
            
            // Sort Tiers (Core -> Build -> Run)
            const order = { 'core': 1, 'build': 2, 'run': 3 };
            const sortedTiers = (detailedTiers || []).sort((a, b) => (order[a.name] || 99) - (order[b.name] || 99));
            setTierLimits(sortedTiers);

            const formatted = sortedTiers.map(tier => ({ 
                value: tier.name, 
                label: tier.name.charAt(0).toUpperCase() + tier.name.slice(1) 
            }));
            setTiersDropdown(formatted);

        } catch (error) {
            toast.error("Failed to load settings.");
            console.error(error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData(false);
    }, [fetchData]);

    const handleFeatureTierChange = (featureName, selectedTiers) => {
        setRestrictions(prev => prev.map(r =>
            r.feature_name === featureName ? { ...r, permitted_tiers: selectedTiers } : r
        ));
    };

    const handleSavePermissions = async () => {
        setIsSaving(true);
        const toastId = toast.loading("Saving permissions...");
        try {
            const promises = restrictions.map(feature => 
                api.updateFeatureRestriction(feature.feature_name, { permitted_tiers: feature.permitted_tiers })
            );
            await Promise.all(promises);
            
            setOriginalRestrictions(JSON.parse(JSON.stringify(restrictions)));
            await refetchProfile();
            
            toast.success("Permissions updated!", { id: toastId });
        } catch (error) {
            toast.error(`Error: ${error.message}`, { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    const openConfig = (feature) => {
        setSelectedFeature(feature);
        setConfigModalOpen(true);
    };

    const isDirty = JSON.stringify(restrictions) !== JSON.stringify(originalRestrictions);

    if (isLoading) return <Card><p className="text-center text-gray-400">Loading...</p></Card>;

    return (
        <>
            <Toaster position="bottom-center" />
            
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <ShieldCheck size={24} className="text-amber-400" />
                    Feature Access Control
                </h2>
                {/* Save button is always rendered but disabled if no changes */}
                <button 
                    onClick={handleSavePermissions}
                    disabled={!isDirty || isSaving}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
            
            <p className="text-sm text-gray-400 mb-6">
                Select which <strong>Tiers</strong> have access to each feature. Use the gear icon to configure specific limits.
            </p>

            <Card>
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                    {restrictions.map(feature => {
                        const hasConfig = !!FEATURE_LIMITS_MAP[feature.feature_name];
                        
                        return (
                            <div key={feature.feature_name} className="flex items-center justify-between border-b border-gray-700 pb-4 last:border-0 last:pb-0 gap-4 hover:bg-gray-800/30 p-2 rounded transition-colors">
                                {/* Feature Label */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-200">{feature.display_name}</span>
                                        {feature.feature_name === 'pdf_logo' && (
                                            <span className="group relative">
                                                <HelpCircle size={16} className="text-gray-500 cursor-help" />
                                                <span className="absolute bottom-full left-0 mb-2 w-max max-w-xs p-2 bg-gray-900 text-white text-xs rounded border border-gray-600 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                                                    Hides branding on exports.
                                                </span>
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Config Button */}
                                <div className="w-10 flex justify-center">
                                    {hasConfig && (
                                        <button 
                                            onClick={() => openConfig(feature)}
                                            className="p-2 text-gray-400 hover:text-amber-500 hover:bg-gray-700 rounded-full transition-colors"
                                            title="Configure Limits"
                                        >
                                            <Settings size={18} />
                                        </button>
                                    )}
                                </div>

                                {/* Tier Selector */}
                                <div className="w-1/3 min-w-[200px]">
                                    <MultiSelect
                                        options={tiersDropdown}
                                        selected={feature.permitted_tiers || []}
                                        onChange={(selectedTiers) => handleFeatureTierChange(feature.feature_name, selectedTiers)}
                                        placeholder="Admin Only"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>

            {/* Reusable Modal Component */}
            {selectedFeature && (
                <FeatureConfigModal 
                    isOpen={configModalOpen}
                    onClose={() => { setConfigModalOpen(false); setSelectedFeature(null); }}
                    feature={selectedFeature}
                    limitsConfig={FEATURE_LIMITS_MAP[selectedFeature.feature_name]}
                    tiers={tierLimits}
                    onSaveSuccess={() => fetchData(true)}
                />
            )}
        </>
    );
};

export default RbacView;