import React, { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Plus, MessageSquare } from 'lucide-react';
import RosterModal from '../components/RosterModal';
import useHotkeys from '../hooks/useHotkeys';
import ContextualNotesDrawer from '../components/ContextualNotesDrawer';
import ConfirmationModal from '../components/ConfirmationModal';
import { useShow } from '../contexts/ShowContext';
import { useAuth } from '../contexts/AuthContext';

const RosterView = () => {
    const { showId, showData } = useShow() || {};
    const { user, profile } = useAuth();
    const [roster, setRoster] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
    const [isNotesDrawerOpen, setIsNotesDrawerOpen] = useState(false);
    const [notesContext, setNotesContext] = useState({ entityType: null, entityId: null });

    const openNotesDrawer = (entityType, entityId) => {
        setNotesContext({ entityType, entityId });
        setIsNotesDrawerOpen(true);
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const rosterData = await api.getRoster();
            setRoster(rosterData);
        } catch (error) {
            console.error("Failed to fetch roster data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleOpenModal = (member = null) => {
        setEditingMember(member);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditingMember(null);
        setIsModalOpen(false);
    };

    const handleSubmitModal = async (formData) => {
        if (editingMember) {
            await api.updateRosterMember(editingMember.id, formData);
        } else {
            await api.createRosterMember(formData);
        }
        fetchData();
        handleCloseModal();
    };

    useHotkeys({
        'n': () => handleOpenModal(),
    });

    const handleDeleteMember = (member) => {
        setConfirmModal({
            isOpen: true,
            message: `Are you sure you want to delete ${member.first_name} ${member.last_name} from the roster? This action cannot be undone.`,
            onConfirm: async () => {
                await api.deleteRosterMember(member.id);
                fetchData();
                setConfirmModal({ isOpen: false, message: '', onConfirm: null });
            }
        });
    };

    // Callback function to update the specific roster member's note status in local state
    const handleNotesUpdated = (count) => {
        if (!notesContext.entityId) return;
        
        setRoster(prevRoster => prevRoster.map(member => {
            if (member.id === notesContext.entityId) {
                return { ...member, has_notes: count > 0 };
            }
            return member;
        }));
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">
            <header className="flex items-center justify-between pb-8 border-b border-gray-700">
                <h1 className="text-3xl font-bold text-white">Global Roster</h1>
                <div className="flex items-center gap-4">
                    <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors">
                        <Plus size={18} /> New Member
                    </button>
                </div>
            </header>
            <main className="mt-8">
                {isLoading ? (
                    <div className="text-center py-16 text-gray-500">Loading roster...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-800">
                                <tr>
                                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">Name</th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Position</th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Email</th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Phone</th>
                                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Edit</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 bg-gray-900">
                                {roster.map(member => (
                                    <tr key={member.id}>
                                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">{`${member.first_name || ''} ${member.last_name || ''}`}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{member.position}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{member.email}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{member.phone_number}</td>
                                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                            {profile?.permitted_features?.includes('contextual_notes') && (
                                                <button onClick={() => openNotesDrawer('roster_member', member.id)} className="relative text-blue-500 hover:text-blue-400 mr-4 inline-flex items-center">
                                                    Notes
                                                    {member.has_notes && (
                                                        <div className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full" style={{ transform: 'translate(50%, -50%)' }}></div>
                                                    )}
                                                </button>
                                            )}
                                            <button onClick={() => handleOpenModal(member)} className="text-amber-500 hover:text-amber-400">Edit</button>
                                            <button onClick={() => handleDeleteMember(member)} className="text-red-500 hover:text-red-400 ml-4">Delete</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
            <RosterModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSubmit={handleSubmitModal}
                member={editingMember}
                customFields={[]}
            />
            {confirmModal.isOpen && (
                <ConfirmationModal
                    message={confirmModal.message}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal({ isOpen: false, message: '', onConfirm: null })}
                />
            )}
            <ContextualNotesDrawer
                entityType={notesContext.entityType}
                entityId={notesContext.entityId}
                showId={showId}
                isOpen={isNotesDrawerOpen}
                onClose={() => setIsNotesDrawerOpen(false)}
                isOwner={showData?.user_id === user?.id}
                onNotesUpdated={handleNotesUpdated}
            />
        </div>
    );
};

export default RosterView;