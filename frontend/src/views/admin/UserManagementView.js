import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/api';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmationModal from '../../components/ConfirmationModal';

const EditRolesModal = ({ isOpen, onClose, user, allRoles, onSave }) => {
    const [selectedRoles, setSelectedRoles] = useState(user?.roles || []);

    useEffect(() => {
        if (user) {
            setSelectedRoles(user.roles);
        }
    }, [user]);

    const handleRoleChange = (roleName) => {
        setSelectedRoles(prev =>
            prev.includes(roleName)
                ? prev.filter(r => r !== roleName)
                : [...prev, roleName]
        );
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(user.id, selectedRoles);
    };

    if (!user) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit Roles for ${user.first_name} ${user.last_name}`}>
            <form onSubmit={handleSubmit}>
                <div className="space-y-2">
                    {allRoles.map(role => (
                        <label key={role} className="flex items-center space-x-3">
                            <input
                                type="checkbox"
                                className="form-checkbox h-5 w-5 text-amber-600 bg-gray-800 border-gray-600 rounded focus:ring-amber-500"
                                checked={selectedRoles.includes(role)}
                                onChange={() => handleRoleChange(role)}
                            />
                            <span className="text-gray-300">{role}</span>
                        </label>
                    ))}
                </div>
                <div className="flex justify-end gap-4 pt-6">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Save Changes</button>
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
    const [allRoles, setAllRoles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRolesModalOpen, setIsRolesModalOpen] = useState(false);
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
        }, 300); // 300ms debounce delay

        return () => clearTimeout(debounceTimeout);
    }, [searchTerm, fetchUsers]);
    
    useEffect(() => {
        const fetchRoles = () => {
            api.getAllRoles()
                .then(data => setAllRoles(data.roles || []))
                .catch(err => toast.error("Failed to fetch roles."));
        };
        fetchRoles();
    }, []);

    const handleOpenRolesModal = (user) => {
        setEditingUser(user);
        setIsRolesModalOpen(true);
    };

    const handleCloseRolesModal = () => {
        setEditingUser(null);
        setIsRolesModalOpen(false);
    };

    const handleSaveRoles = async (userId, roles) => {
        const toastId = toast.loading("Updating roles...");
        try {
            await api.updateUserRoles(userId, roles);
            toast.success("Roles updated successfully!", { id: toastId });
            fetchUsers();
            handleCloseRolesModal();
        } catch (error) {
            toast.error(`Failed to update roles: ${error.message}`, { id: toastId });
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
                        className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                </div>
            </div>
            <Card>
                {/* CHANGED: Added max-h-[70vh] and overflow-y-auto for internal scrolling */}
                <div className="overflow-x-auto max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <table className="min-w-full text-sm text-left text-gray-400">
                        {/* CHANGED: Added sticky top-0 and z-10 to keep header visible while scrolling */}
                        <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0 z-10">
                            <tr>
                                <th scope="col" className="px-6 py-3">User</th>
                                <th scope="col" className="px-6 py-3">Roles</th>
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
                                            <div className={`w-3 h-3 rounded-full ${statusColorClass}`}></div>
                                            <div>
                                                {user.first_name} {user.last_name}
                                                <div className="text-xs text-gray-500">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {user.roles.map(role => (
                                                <span key={role} className="bg-gray-600 text-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full">{role}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {user.status === 'suspended' ? 'deactivated' : user.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button 
                                            onClick={() => handleOpenRolesModal(user)} 
                                            className="font-medium text-amber-500 hover:underline mr-4"
                                        >
                                            Edit Roles
                                        </button>
                                        <button 
                                            onClick={() => handleImpersonate(user)} 
                                            className="font-medium text-cyan-500 hover:underline mr-4 disabled:text-gray-500 disabled:cursor-not-allowed"
                                            disabled={user.id === profile.id}
                                        >
                                            Impersonate
                                        </button>
                                        {user.status === 'active' ? (
                                            <button onClick={() => handleDeactivate(user)} className="font-medium text-red-500 hover:underline">Deactivate</button>
                                        ) : (
                                            <button onClick={() => handleReactivate(user)} className="font-medium text-green-500 hover:underline">Reactivate</button>
                                        )}
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
            {isRolesModalOpen && editingUser && (
                <EditRolesModal
                    isOpen={isRolesModalOpen}
                    onClose={handleCloseRolesModal}
                    user={editingUser}
                    allRoles={allRoles}
                    onSave={handleSaveRoles}
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