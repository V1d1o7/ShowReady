// frontend/src/components/CollaboratorManager.js
import React, { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Trash2, UserPlus, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

const CollaboratorManager = ({ showId, currentUserPoints }) => {
    const [collaborators, setCollaborators] = useState([]);
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState('viewer');
    const [isLoading, setIsLoading] = useState(true);

    const loadCollaborators = async () => {
        try {
            const data = await api.getCollaborators(showId);
            setCollaborators(data);
        } catch (error) {
            console.error("Failed to load collaborators", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadCollaborators();
    }, [showId]);

    const handleInvite = async (e) => {
        e.preventDefault();
        const toastId = toast.loading("Inviting user...");
        try {
            await api.inviteCollaborator(showId, newEmail, newRole);
            toast.success("User invited!", { id: toastId });
            setNewEmail('');
            loadCollaborators();
        } catch (error) {
            toast.error(`Failed: ${error.message}`, { id: toastId });
        }
    };

    const handleRemove = async (userId) => {
        if(!window.confirm("Remove this user?")) return;
        try {
            await api.removeCollaborator(showId, userId);
            setCollaborators(prev => prev.filter(c => c.user_id !== userId));
            toast.success("Removed.");
        } catch (error) {
            toast.error("Failed to remove user.");
        }
    };

    const handleRoleChange = async (userId, newRole) => {
        try {
            await api.updateCollaboratorRole(showId, userId, newRole);
            setCollaborators(prev => prev.map(c => c.user_id === userId ? { ...c, role: newRole } : c));
            toast.success("Role updated.");
        } catch (error) {
            toast.error("Failed to update role.");
        }
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Shield className="text-amber-500" size={20} />
                Collaborators
            </h3>
            
            {/* Invite Form */}
            <form onSubmit={handleInvite} className="mb-6 flex gap-2">
                <input 
                    type="email" 
                    placeholder="User Email" 
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="flex-grow p-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-amber-500 outline-none"
                    required
                />
                <select 
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="p-2 rounded bg-gray-700 text-white border border-gray-600 outline-none"
                >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="owner">Owner</option>
                </select>
                <button type="submit" className="bg-amber-500 text-black px-4 py-2 rounded font-bold hover:bg-amber-400 flex items-center gap-2">
                    <UserPlus size={18} /> Invite
                </button>
            </form>

            {/* List */}
            <div className="space-y-2">
                {isLoading ? <p className="text-gray-400">Loading...</p> : collaborators.map(c => (
                    <div key={c.user_id} className="flex justify-between items-center bg-gray-700/50 p-3 rounded">
                        <div>
                            <p className="font-bold text-gray-200">{c.first_name} {c.last_name}</p>
                            <span className="text-xs bg-gray-600 px-2 py-0.5 rounded text-gray-300 uppercase">{c.role}</span>
                        </div>
                        <div className="flex gap-2">
                            <select 
                                value={c.role} 
                                onChange={(e) => handleRoleChange(c.user_id, e.target.value)}
                                className="bg-gray-800 text-sm p-1 rounded border border-gray-600"
                            >
                                <option value="viewer">Viewer</option>
                                <option value="editor">Editor</option>
                                <option value="owner">Owner</option>
                            </select>
                            <button onClick={() => handleRemove(c.user_id)} className="text-red-400 hover:text-red-300 p-1">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CollaboratorManager;