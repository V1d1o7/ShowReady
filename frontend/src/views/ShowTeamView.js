import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { api } from '../api/api';
import Card from '../components/Card';
import Modal from '../components/Modal';
import InputField from '../components/InputField';
import toast, { Toaster } from 'react-hot-toast';
import { Users, UserPlus, Trash2, Shield, Search, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const ShowTeamView = () => {
    const { session } = useAuth();
    const currentUserId = session?.user?.id;

    // Attempt to get show data from Outlet context (if ShowWrapper provides it)
    const context = useOutletContext();
    const showFromContext = context?.show;
    
    const { showName } = useParams();
    const [showId, setShowId] = useState(showFromContext?.id || null);
    
    const [collaborators, setCollaborators] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showRoleInfo, setShowRoleInfo] = useState(false);
    
    // Invite Form
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('viewer');
    const [isInviting, setIsInviting] = useState(false);

    // Resolve Show ID
    useEffect(() => {
        if (!showId && showName) {
            api.getShowByName(showName)
                .then(data => setShowId(data.id))
                .catch(err => toast.error("Could not load show details."));
        } else if (showFromContext) {
            setShowId(showFromContext.id);
        }
    }, [showName, showFromContext, showId]);

    const fetchCollaborators = useCallback(async () => {
        if (!showId) return;
        setIsLoading(true);
        try {
            const data = await api.getCollaborators(showId);
            setCollaborators(data);
        } catch (error) {
            console.error(error);
            toast.error("Failed to load team members.");
        } finally {
            setIsLoading(false);
        }
    }, [showId]);

    useEffect(() => {
        fetchCollaborators();
    }, [fetchCollaborators]);

    // Determine current user's role
    const currentUserCollaborator = collaborators.find(c => c.user_id === currentUserId);
    const currentUserRole = currentUserCollaborator?.role;
    const isOwner = currentUserRole === 'owner';

    const handleInvite = async (e) => {
        e.preventDefault();
        setIsInviting(true);
        try {
            await api.inviteCollaborator(showId, inviteEmail, inviteRole);
            toast.success(`${inviteEmail} invited!`);
            setIsInviteModalOpen(false);
            setInviteEmail('');
            fetchCollaborators();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setIsInviting(false);
        }
    };

    const handleRoleUpdate = async (userId, newRole) => {
        try {
            await api.updateCollaboratorRole(showId, userId, newRole);
            setCollaborators(prev => prev.map(c => c.user_id === userId ? { ...c, role: newRole } : c));
            toast.success("Role updated.");
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleRemove = async (userId) => {
        if (!window.confirm("Remove this user?")) return;
        try {
            await api.removeCollaborator(showId, userId);
            setCollaborators(prev => prev.filter(c => c.user_id !== userId));
            toast.success("Removed.");
        } catch (error) {
            toast.error(error.message);
        }
    };

    const filtered = collaborators.filter(c => 
        (c.first_name + ' ' + c.last_name).toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.role.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!showId) return <div className="text-gray-400 p-8">Loading show context...</div>;

    return (
        <div className="max-w-7xl mx-auto">
            <Toaster position="bottom-center" />
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Users className="text-amber-500" />
                        Team Management
                        <button 
                            onClick={() => setShowRoleInfo(!showRoleInfo)}
                            className="text-gray-400 hover:text-amber-500 transition-colors ml-2"
                            title="Role Permissions Info"
                        >
                            <Info size={20} />
                        </button>
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">Manage access to {showFromContext?.name || showName}</p>
                </div>
                
                {isOwner && (
                    <button 
                        onClick={() => setIsInviteModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors"
                    >
                        <UserPlus size={18} /> Invite Member
                    </button>
                )}
            </div>

            {/* Role Info Box */}
            {showRoleInfo && (
                <div className="bg-gray-800 border-l-4 border-amber-500 p-4 mb-6 rounded shadow-lg animate-fadeIn">
                    <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                        <Shield size={16} className="text-amber-500"/> Role Permissions
                    </h4>
                    <div className="grid md:grid-cols-3 gap-4 text-sm">
                        <div className="bg-gray-700/50 p-3 rounded">
                            <span className="text-amber-400 font-bold block mb-1">Owner</span>
                            <span className="text-gray-300">Full admin control. Can manage the team, edit show data, and delete the show.</span>
                        </div>
                        <div className="bg-gray-700/50 p-3 rounded">
                            <span className="text-amber-400 font-bold block mb-1">Editor</span>
                            <span className="text-gray-300">Can edit show contents but cannot manage the team.</span>
                        </div>
                        <div className="bg-gray-700/50 p-3 rounded">
                            <span className="text-amber-400 font-bold block mb-1">Viewer</span>
                            <span className="text-gray-300">Read-only access. Can view details and exports but cannot make changes.</span>
                        </div>
                    </div>
                </div>
            )}

            <Card>
                <div className="mb-4 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input 
                        type="text"
                        placeholder="Search team..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 p-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="bg-gray-800 text-gray-400 uppercase font-medium">
                            <tr>
                                <th className="py-3 px-4">User</th>
                                <th className="py-3 px-4">Role</th>
                                <th className="py-3 px-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {isLoading ? (
                                <tr><td colSpan="3" className="py-8 text-center text-gray-500">Loading...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan="3" className="py-8 text-center text-gray-500">No members found.</td></tr>
                            ) : (
                                filtered.map(m => (
                                    <tr key={m.user_id} className="hover:bg-gray-800/50">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold text-white">
                                                    {m.first_name?.[0]}{m.last_name?.[0]}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-white">{m.first_name} {m.last_name}</div>
                                                    {m.role === 'owner' && <span className="text-[10px] text-amber-500 font-bold uppercase">Owner</span>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <select 
                                                value={m.role} 
                                                onChange={(e) => handleRoleUpdate(m.user_id, e.target.value)}
                                                // Disable if: Current User is NOT Owner OR Target User IS Owner
                                                disabled={!isOwner || m.role === 'owner'}
                                                className={`bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed`}
                                            >
                                                <option value="viewer">Viewer</option>
                                                <option value="editor">Editor</option>
                                                <option value="owner">Owner</option>
                                            </select>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            {/* Only Owners can remove people (and not other owners) */}
                                            {isOwner && m.role !== 'owner' && (
                                                <button onClick={() => handleRemove(m.user_id)} className="text-gray-500 hover:text-red-500 p-2">
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} title="Invite User">
                <form onSubmit={handleInvite} className="space-y-4">
                    <div className="bg-blue-900/20 border border-blue-800 p-3 rounded text-sm text-blue-200 flex gap-2">
                        <Shield size={16} className="mt-0.5" />
                        Users must have a ShowReady account to be invited.
                    </div>
                    <InputField label="Email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
                    <div>
                        <label className="block text-sm font-bold text-gray-400 mb-1">Role</label>
                        <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-amber-500 outline-none">
                            <option value="viewer">Viewer (Read Only)</option>
                            <option value="editor">Editor (Can edit)</option>
                            <option value="owner">Owner (Full Admin)</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setIsInviteModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                        <button type="submit" disabled={isInviting} className="px-6 py-2 bg-amber-500 text-black font-bold rounded hover:bg-amber-400 disabled:opacity-50">
                            {isInviting ? 'Sending...' : 'Invite'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ShowTeamView;