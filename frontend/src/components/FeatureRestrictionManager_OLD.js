import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/api';
import Card from './Card';
import MultiSelect from './MultiSelect';
import toast from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';

const FeatureRestrictionManager = () => {
    const [restrictions, setRestrictions] = useState([]);
    const [originalRestrictions, setOriginalRestrictions] = useState([]);
    const [roles, setRoles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [restrictionsData, rolesData] = await Promise.all([
                api.getAllFeatureRestrictions(),
                api.getAdminUserRoles()
            ]);
            setRestrictions(restrictionsData);
            setOriginalRestrictions(JSON.parse(JSON.stringify(restrictionsData))); // Deep copy for resetting
            setRoles(rolesData.roles || []);
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

    const handleRoleChange = (featureName, selectedRoles) => {
        setRestrictions(prev => prev.map(r =>
            r.feature_name === featureName ? { ...r, excluded_roles: selectedRoles } : r
        ));
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        const toastId = toast.loading("Saving changes...");

        const promises = restrictions.map(feature => 
            api.updateFeatureRestriction(feature.feature_name, { excluded_roles: feature.excluded_roles })
        );

        try {
            await Promise.all(promises);
            toast.success("All changes saved successfully!", { id: toastId });
            setOriginalRestrictions(JSON.parse(JSON.stringify(restrictions))); // Update original state
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

    // Function to format feature names for display
    const formatFeatureName = (name) => {
        return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    return (
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
                For each feature, select the roles that should be <span className="font-bold text-red-400">EXCLUDED</span> from accessing it.
            </p>
            <div className="space-y-5">
                {restrictions.map(feature => (
                    <div key={feature.feature_name} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <label htmlFor={`roles-for-${feature.feature_name}`} className="font-bold text-gray-200">
                            {formatFeatureName(feature.feature_name)}
                        </label>
                        <div className="md:col-span-2">
                            <MultiSelect
                                options={roles}
                                selected={feature.excluded_roles}
                                onChange={(selectedRoles) => handleRoleChange(feature.feature_name, selectedRoles)}
                                placeholder="No roles excluded"
                            />
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
};

export default FeatureRestrictionManager;
