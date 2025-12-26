import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/api';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmationModal from '../../components/ConfirmationModal';

const EditUserAccessModal = ({ isOpen, onClose, user, onSave }) => {
    const [tier, setTier] = useState(user?.tier || 'core');
    const [isFounding, setIsFounding] = useState(user?.entitlements?.is_founding || false);
    const [isBeta, setIsBeta] = useState(user?.entitlements?.is_beta || false);

    const TIER_OPTIONS = ['core', 'build', 'run'];

    useEffect(() => {
        if (user) {
            setTier(user.tier || 'core');
            setIsFounding(user.entitlements?.is_founding || false);
            setIsBeta(user.entitlements?.is_beta || false);
        }
    }, [user]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(user.id, tier, isFounding, isBeta);
    };

    if (!user) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit Access for ${user.first_name} ${user.last_name}`}>
            <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                    {/* Tier Selector */}
                    <div>
                        <label htmlFor="tier-select" className="block text-sm font-bold text-gray-300 mb-2">
                            User Tier
                        </label>
                        <p className="text-xs text-gray-500 mb-2">Controls base feature access levels.</p>
                        <select
                            id="tier-select"
                            value={tier}
                            onChange={(e) => setTier(e.target.value)}
                            className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-white"
                        >
                            {TIER_OPTIONS.map(option => (
                                <option key={option} value={option}>
                                    {option.charAt(0).toUpperCase() + option.slice(1)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {/* Beta Checkbox */}
                        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                            <label className="flex items-start space-x-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="form-checkbox h-5 w-5 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 mt-1"
                                    checked={isBeta}
                                    onChange={(e) => setIsBeta(e.target.checked)}
                                />
                                <div>
                                    <span className="block text-sm font-bold text-gray-200">Beta User</span>
                                    <span className="block text-xs text-gray-500 mt-1">
                                        Identifies user as a tester. They should generally be on the <strong>Run</strong> tier. Subject to inactivity revocation.
                                    </span>
                                </div>
                            </label>
                        </div>

                        {/* Founding Checkbox */}
                        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                            <label className="flex items-start space-x-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="form-checkbox h-5 w-5 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500 mt-1"
                                    checked={isFounding}
                                    onChange={(e) => setIsFounding(e.target.checked)}
                                />
                                <div>
                                    <span className="block text-sm font-bold text-gray-200">Founding Member</span>
                                    <span className="block text-xs text-gray-500 mt-1">
                                        Permanent bypass for paywalls. Exempt from inactivity revocation.
                                    </span>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div className="flex justify-end gap-4 pt-8 border-t border-gray-700 mt-6">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors">
                        Cancel
                    </button>
                    <button type="submit" className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow-lg transition-colors">
                        Save Changes
                    </button>
                </div>
            </form>
        </Modal>
    );
};

const UserManagementView = () => {
    const getUserActivityStatus = (lastActiveAt) => {
        if (!lastActiveAt) return 'grey';
        const now = new Date();
        const lastActive = new Date(lastActiveAt);
        const diffMinutes = (now - lastActive) / (1000 * 60);
        
        if (diffMinutes < 5) return 'green';
        if (diffMinutes < 1440) return 'yellow'; // 24 hours * 60 minutes
        return 'grey';
    };

    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const { profile, startImpersonation } = useAuth();
    const [impersonationModal, setImpersonationModal] = useState({ isOpen: false, user: null });
    const [confirmationModal, setConfirmationModal] = useState({ isOpen: false, user: null, action: null });

    const fetchUsers = useCallback(() => {
        setIsLoading(true);
        api.getAllUsers(searchTerm)
            .then(setUsers)
            .catch(err => {
                toast.error("Failed to fetch users.");
                console.error(err);
            })
            .finally(() => setIsLoading(false));
    }, [searchTerm]);

    useEffect(() => {
        const debounceTimeout = setTimeout(() => {
            fetchUsers();
        }, 300);

        return () => clearTimeout(debounceTimeout);
    }, [searchTerm, fetchUsers]);

    // Ensure only admins can see this view
    if (!profile?.roles?.includes('global_admin')) {
        return <div className="p-8 text-center text-red-500">Access Denied. You do not have global_admin privileges.</div>;
    }

    const handleOpenAccessModal = (user) => {
        setEditingUser(user);
        setIsAccessModalOpen(true);
    };

    const handleCloseAccessModal = () => {
        setEditingUser(null);
        setIsAccessModalOpen(false);
    };

    const handleSaveAccess = async (userId, tier, isFounding, isBeta) => {
        const toastId = toast.loading("Updating user access...");
        try {
            await Promise.all([
                api.updateUserTier(userId, tier),
                api.updateUserEntitlement(userId, isFounding, isBeta)
            ]);
            toast.success("User access updated successfully!", { id: toastId });
            fetchUsers();
            handleCloseAccessModal();
        } catch (error) {
            toast.error(`Failed to update access: ${error.message}`, { id: toastId });
        }
    };

    const handleDeactivate = (user) => {
        setConfirmationModal({ 
            isOpen: true, 
            user, 
            action: 'deactivate',
            message: `Are you sure you want to deactivate ${user.first_name} ${user.last_name}? Their account will be disabled.`
        });
    };
    
    const handleReactivate = (user) => {
        setConfirmationModal({ 
            isOpen: true, 
            user, 
            action: 'reactivate',
            message: `Are you sure you want to reactivate ${user.first_name} ${user.last_name}?`
        });
    };

    const handleConfirmAction = async () => {
        const { user, action } = confirmationModal;
        if (!user || !action) return;

        const toastId = toast.loading(`${action === 'deactivate' ? 'Deactivating' : 'Reactivating'} user...`);
        try {
            if (action === 'deactivate') {
                await api.deactivateUser(user.id);
                toast.success('User deactivated successfully!', { id: toastId });
            } else {
                await api.reactivateUser(user.id);
                toast.success('User reactivated successfully!', { id: toastId });
            }
            setUsers(users => users.map(u => u.id === user.id ? { ...u, status: action === 'deactivate' ? 'suspended' : 'active' } : u));
        } catch (error) {
            toast.error(`Failed to ${action} user: ${error.message}`, { id: toastId });
        } finally {
            setConfirmationModal({ isOpen: false, user: null, action: null });
        }
    };

    const handleImpersonate = (user) => {
        setImpersonationModal({ isOpen: true, user });
    };

    const confirmImpersonation = async () => {
        const user = impersonationModal.user;
        if (!user) return;

        const toastId = toast.loading(`Starting impersonation...`);
        try {
            await startImpersonation(user.id);
            toast.success(`Now impersonating ${user.first_name} ${user.last_name}`, { id: toastId });
        } catch (error) {
            toast.error(`Failed to impersonate: ${error.message}`, { id: toastId });
        } finally {
            setImpersonationModal({ isOpen: false, user: null });
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-gray-400">Loading User Management...</div>;
    }

    return (
        <>
            <Toaster position="bottom-center" />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">User Management</h1>
                <div className="w-full max-w-xs">
                    <input
                        type="text"
                        placeholder="Search by name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-white"
                    />
                </div>
            </div>
            <Card>
                <div className="overflow-x-auto max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <table className="min-w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0 z-10">
                            <tr>
                                <th scope="col" className="px-6 py-3">User</th>
                                <th scope="col" className="px-6 py-3">Tier & Entitlements</th>
                                <th scope="col" className="px-6 py-3">Roles (System)</th>
                                <th scope="col" className="px-6 py-3">Account Status</th>
                                <th scope="col" className="px-6 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => {
                                const activityStatus = getUserActivityStatus(user.last_active_at);
                                const statusColorClass = {
                                    green: 'bg-green-500',
                                    yellow: 'bg-yellow-500',
                                    grey: 'bg-gray-500'
                                }[activityStatus];

                                return (
                                <tr key={user.id} className="bg-gray-800 border-b border-gray-700 hover:bg-gray-700">
                                    <td className="px-6 py-4 font-medium text-white">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-3 h-3 rounded-full ${statusColorClass}`} title={`Last active: ${user.last_active_at || 'Never'}`}></div>
                                            <div>
                                                {user.first_name} {user.last_name}
                                                <div className="text-xs text-gray-500">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1 items-center">
                                            {/* Tier Badge */}
                                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full capitalize ${
                                                user.tier === 'run' ? 'bg-indigo-900 text-indigo-200 border border-indigo-700' :
                                                user.tier === 'build' ? 'bg-cyan-900 text-cyan-200 border border-cyan-700' :
                                                'bg-slate-700 text-slate-300 border border-slate-600'
                                            }`}>
                                                {user.tier || 'Core'}
                                            </span>
                                            
                                            {/* Beta Badge */}
                                            {user.entitlements?.is_beta && (
                                                <span className="bg-blue-900 text-blue-200 border border-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                                                    Beta
                                                </span>
                                            )}

                                            {/* Founding Badge */}
                                            {user.entitlements?.is_founding && (
                                                <span className="bg-purple-900 text-purple-200 border border-purple-700 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center">
                                                    <span className="mr-1">★</span> Founding
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {user.roles && user.roles.map(role => (
                                                <span key={role} className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded border border-gray-600">
                                                    {role}
                                                </span>
                                            ))}
                                            {(!user.roles || user.roles.length === 0) && <span className="text-gray-600">-</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {user.status === 'suspended' ? 'Deactivated' : 'Active'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center space-x-3">
                                            <button 
                                                onClick={() => handleOpenAccessModal(user)} 
                                                className="text-sm font-medium text-amber-500 hover:text-amber-400 transition-colors"
                                            >
                                                Edit Access
                                            </button>
                                            <span className="text-gray-600">|</span>
                                            <button 
                                                onClick={() => handleImpersonate(user)} 
                                                className="text-sm font-medium text-cyan-500 hover:text-cyan-400 transition-colors disabled:text-gray-600 disabled:cursor-not-allowed"
                                                disabled={user.id === profile.id}
                                            >
                                                Impersonate
                                            </button>
                                            <span className="text-gray-600">|</span>
                                            {user.status === 'active' ? (
                                                <button onClick={() => handleDeactivate(user)} className="text-sm font-medium text-red-500 hover:text-red-400 transition-colors">Deactivate</button>
                                            ) : (
                                                <button onClick={() => handleReactivate(user)} className="text-sm font-medium text-green-500 hover:text-green-400 transition-colors">Reactivate</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
            {isAccessModalOpen && editingUser && (
                <EditUserAccessModal
                    isOpen={isAccessModalOpen}
                    onClose={handleCloseAccessModal}
                    user={editingUser}
                    onSave={handleSaveAccess}
                />
            )}
            {confirmationModal.isOpen && (
                <ConfirmationModal
                    message={confirmationModal.message}
                    onConfirm={handleConfirmAction}
                    onCancel={() => setConfirmationModal({ isOpen: false, user: null, action: null })}
                    confirmText={confirmationModal.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
                    confirmButtonVariant="danger"
                />
            )}
            {impersonationModal.isOpen && (
                <ConfirmationModal
                    message={`Are you sure you want to impersonate ${impersonationModal.user?.first_name} ${impersonationModal.user?.last_name}?`}
                    onConfirm={confirmImpersonation}
                    onCancel={() => setImpersonationModal({ isOpen: false, user: null })}
                    confirmText="Impersonate"
                    confirmButtonVariant="danger"
                />
            )}
        </>
    );
};

export default UserManagementView;