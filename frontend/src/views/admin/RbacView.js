import React, { useState, useEffect } from 'react';
import { api } from '../../api/api';
import Card from '../../components/Card';

const RbacView = () => {
    const [roles, setRoles] = useState([]);
    const [excludedRoles, setExcludedRoles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true);
                const [rolesResponse, restrictionResponse] = await Promise.all([
                    api.getAllRoles(),
                    api.getFeatureRestriction('pdf_logo')
                ]);
                setRoles(rolesResponse.roles || []);
                setExcludedRoles(restrictionResponse.excluded_roles || []);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleRoleSelectionChange = (e) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
        setExcludedRoles(selectedOptions);
    };

    const handleSaveChanges = async () => {
        try {
            await api.updateFeatureRestriction('pdf_logo', { excluded_roles: excludedRoles });
            alert('Changes saved successfully!');
        } catch (err) {
            alert(`Failed to save changes: ${err.message}`);
        }
    };

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <Card>
            <h1 className="text-2xl font-bold text-white mb-4">Role-Based Access Control (RBAC)</h1>
            <div className="space-y-6">
                <div>
                    <h2 className="text-xl font-semibold text-white mb-2">PDF Logo Exclusion</h2>
                    <p className="text-gray-400 mb-4">
                        Select roles that should <span className="font-bold text-red-400">NOT</span> have the ShowReady logo on their generated PDF documents.
                    </p>
                    <div className="max-w-md">
                        <select
                            multiple
                            value={excludedRoles}
                            onChange={handleRoleSelectionChange}
                            className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                            size={Math.min(roles.length, 8)}
                        >
                            {roles.map(role => (
                                <option key={role} value={role} className="p-2">
                                    {role}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-2">
                            Hold Ctrl (or Cmd on Mac) to select multiple roles.
                        </p>
                    </div>
                </div>
                <div className="flex justify-end">
                    <button
                        onClick={handleSaveChanges}
                        className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </Card>
    );
};

export default RbacView;
