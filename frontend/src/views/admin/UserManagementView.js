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

const SuspendUserModal = ({ isOpen, onClose, user, onSubmit }) => {
    const [duration, setDuration] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        const durationHours = duration ? parseInt(duration, 10) : null;
        onSubmit(user.id, durationHours);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Suspend ${user.first_name}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="duration" className="block text-sm font-medium text-gray-300 mb-1.5">Suspension Duration (in hours)</label>
                    <input
                        id="duration"
                        type="number"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        placeholder="Leave blank for permanent"
                        className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg"
                    />
                </div>
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-red-500 hover:bg-red-400 rounded-lg font-bold text-white">Suspend</button>
                </div>
            </form>
        </Modal>
    );
};

const UserManagementView = () => {
    const [users, setUsers] = useState([]);
    const [allRoles, setAllRoles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRolesModalOpen, setIsRolesModalOpen] = useState(false);
    const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const { profile, startImpersonation } = useAuth();
    const [impersonationModal, setImpersonationModal] = useState({ isOpen: false, user: null });

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

    const handleOpenSuspendModal = (user) => {
        setEditingUser(user);
        setIsSuspendModalOpen(true);
    };

    const handleCloseSuspendModal = () => {
        setEditingUser(null);
        setIsSuspendModalOpen(false);
    };

    const handleSuspendSubmit = async (userId, durationHours) => {
        const toastId = toast.loading('Suspending user...');
        try {
            await api.suspendUser(userId, { duration_hours: durationHours });
            toast.success('User suspended successfully!', { id: toastId });
            fetchUsers();
            handleCloseSuspendModal();
        } catch (error) {
            toast.error(`Failed to suspend user: ${error.message}`, { id: toastId });
        }
    };
    
    const handleUnsuspend = async (user) => {
        const toastId = toast.loading('Unsuspending user...');
        try {
            await api.unsuspendUser(user.id);
            toast.success('User unsuspended successfully!', { id: toastId });
            fetchUsers();
        } catch (error) {
            toast.error(`Failed to unsuspend user: ${error.message}`, { id: toastId });
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
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3">User</th>
                                <th scope="col" className="px-6 py-3">Roles</th>
                                <th scope="col" className="px-6 py-3">Status</th>
                                <th scope="col" className="px-6 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id} className="bg-gray-800 border-b border-gray-700 hover:bg-gray-700">
                                    <td className="px-6 py-4 font-medium text-white">
                                        {user.first_name} {user.last_name}
                                        <div className="text-xs text-gray-500">{user.email}</div>
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
                                            {user.status}
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
                                            <button onClick={() => handleOpenSuspendModal(user)} className="font-medium text-red-500 hover:underline">Suspend</button>
                                        ) : (
                                            <button onClick={() => handleUnsuspend(user)} className="font-medium text-green-500 hover:underline">Unsuspend</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
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
            {isSuspendModalOpen && editingUser && (
                 <SuspendUserModal
                    isOpen={isSuspendModalOpen}
                    onClose={handleCloseSuspendModal}
                    user={editingUser}
                    onSubmit={handleSuspendSubmit}
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