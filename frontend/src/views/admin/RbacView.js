import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/api';
import { useAuth } from '../../contexts/AuthContext';
import Card from '../../components/Card';
import MultiSelect from '../../components/MultiSelect';
import toast, { Toaster } from 'react-hot-toast';
import { ShieldCheck, HelpCircle } from 'lucide-react';

const RbacView = () => {
    const { refetchProfile } = useAuth();
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
            setOriginalRestrictions(JSON.parse(JSON.stringify(restrictionsData)));
            // The MultiSelect component expects an array of objects with value and label properties.
            const formattedRoles = (rolesData.roles || []).map(role => ({ value: role, label: role }));
            setRoles(formattedRoles);
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
            r.feature_name === featureName ? { ...r, permitted_roles: selectedRoles } : r
        ));
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        const toastId = toast.loading("Saving changes...");

        const promises = restrictions.map(feature => 
            api.updateFeatureRestriction(feature.feature_name, { permitted_roles: feature.permitted_roles })
        );

        try {
            await Promise.all(promises);
            toast.success("All changes saved successfully! Permissions will update on next page load.", { id: toastId, duration: 4000 });
            setOriginalRestrictions(JSON.parse(JSON.stringify(restrictions)));
            // NOTE: The refetchProfile() call is removed for now to prevent a redirect bug.
            // The user's permissions will be updated the next time they load the app or refresh the page.
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
                    For each feature, select the roles that should have access. If no roles are selected for a feature, <span className="font-bold text-green-400">ALL</span> users will have access by default.
                </p>
                <div className="space-y-5">
                    {restrictions.map(feature => (
                        <div key={feature.feature_name} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                            <label htmlFor={`roles-for-${feature.feature_name}`} className="font-bold text-gray-200 flex items-center">
                                {feature.display_name}
                                {feature.feature_name === 'pdf_logo' && (
                                    <span className="group relative ml-2">
                                        <HelpCircle size={16} className="text-gray-500" />
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs p-2 bg-gray-900 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                            Controls the visibility of the ShowReady branding on generated PDFs.
                                        </span>
                                    </span>
                                )}
                            </label>
                            <div className="md:col-span-2">
                                <MultiSelect
                                    options={roles}
                                    selected={feature.permitted_roles}
                                    onChange={(selectedRoles) => handleRoleChange(feature.feature_name, selectedRoles)}
                                    placeholder="All roles have access"
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
