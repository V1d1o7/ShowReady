import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/api';
import { useAuth } from '../../contexts/AuthContext';
import Card from '../../components/Card';
import MultiSelect from '../../components/MultiSelect';
import toast, { Toaster } from 'react-hot-toast';
import { ShieldCheck, HelpCircle } from 'lucide-react';

/**
 * RbacView manages the Feature Access Control settings.
 * Configures which Tiers (core, build, run) can access which features.
 */
const RbacView = () => {
    const { refetchProfile } = useAuth();
    const [restrictions, setRestrictions] = useState([]);
    const [originalRestrictions, setOriginalRestrictions] = useState([]);
    const [tiers, setTiers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            // FIX: Fetch Tiers instead of Roles
            const [restrictionsData, tiersData] = await Promise.all([
                api.getAllFeatureRestrictions(),
                api.getAdminTiers()
            ]);
            
            setRestrictions(restrictionsData);
            setOriginalRestrictions(JSON.parse(JSON.stringify(restrictionsData)));
            
            // Format tiers for the MultiSelect component
            // tiersData.tiers is an array of strings ['core', 'build', 'run']
            const formattedTiers = (tiersData.tiers || []).map(tier => ({ 
                value: tier, 
                label: tier.charAt(0).toUpperCase() + tier.slice(1) 
            }));
            setTiers(formattedTiers);
        } catch (error) {
            toast.error("Failed to load restriction settings.");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleTierChange = (featureName, selectedTiers) => {
        setRestrictions(prev => prev.map(r =>
            // FIX: Update 'permitted_tiers' instead of 'permitted_roles'
            r.feature_name === featureName ? { ...r, permitted_tiers: selectedTiers } : r
        ));
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        const toastId = toast.loading("Saving changes...");

        // FIX: Send 'permitted_tiers' payload to backend
        const promises = restrictions.map(feature => 
            api.updateFeatureRestriction(feature.feature_name, { permitted_tiers: feature.permitted_tiers })
        );

        try {
            await Promise.all(promises);
            toast.success("All changes saved successfully!", { id: toastId });
            setOriginalRestrictions(JSON.parse(JSON.stringify(restrictions)));
            // Update the current user's profile so the sidebar/UI updates immediately if permissions changed
            await refetchProfile();
        } catch (error) {
            toast.error(`Failed to save changes: ${error.message}`, { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };
    
    const isDirty = JSON.stringify(restrictions) !== JSON.stringify(originalRestrictions);

    if (isLoading) {
        return <Card><p className="text-center text-gray-400">Loading Feature Settings...</p></Card>;
    }

    return (
        <>
            <Toaster position="bottom-center" />
            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <ShieldCheck size={24} className="text-amber-400" />
                        Feature Access Control
                    </h2>
                    {isDirty && (
                         <button 
                            onClick={handleSaveChanges}
                            disabled={isSaving}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    )}
                </div>
                <p className="text-sm text-gray-400 mb-6">
                    Select which <strong>Tiers</strong> have access to each feature. 
                    <br/>
                    <span className="text-xs text-gray-500">* Admins have access to all features by default. Founding users bypass paywalls automatically.</span>
                </p>
                <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                    {restrictions.map(feature => (
                        <div key={feature.feature_name} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center border-b border-gray-700 pb-4 last:border-0">
                            <label htmlFor={`tiers-for-${feature.feature_name}`} className="font-bold text-gray-200 flex items-center">
                                {feature.display_name}
                                {feature.feature_name === 'pdf_logo' && (
                                    <span className="group relative ml-2">
                                        <HelpCircle size={16} className="text-gray-500 cursor-help" />
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs p-2 bg-gray-900 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                            Controls the visibility of the ShowReady branding on generated PDFs.
                                        </span>
                                    </span>
                                )}
                            </label>
                            <div className="md:col-span-2">
                                <MultiSelect
                                    options={tiers}
                                    selected={feature.permitted_tiers || []}
                                    onChange={(selectedTiers) => handleTierChange(feature.feature_name, selectedTiers)}
                                    placeholder="No Tiers Selected (Admin Only)"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </>
    );
};

export default RbacView;