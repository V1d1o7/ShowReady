import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/api';
import { Plus, Edit, Trash2, Mail } from 'lucide-react';
import { Toaster } from 'react-hot-toast'; // Fix: Import Toaster
import RosterModal from '../components/RosterModal';
import EmailComposeModal from '../components/EmailComposeModal';
import ConfirmationModal from '../components/ConfirmationModal';
import InputField from '../components/InputField';

const RosterView = () => {
    const [roster, setRoster] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
    const [tagFilter, setTagFilter] = useState('');
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

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

    const allTags = useMemo(() => {
        const tags = new Set();
        roster.forEach(member => {
            if (member.tags) {
                member.tags.forEach(tag => tags.add(tag));
            }
        });
        return Array.from(tags);
    }, [roster]);

    const filteredRoster = useMemo(() => {
        if (!tagFilter) {
            return roster;
        }
        return roster.filter(member =>
            member.tags && member.tags.some(tag => tag.toLowerCase().includes(tagFilter.toLowerCase()))
        );
    }, [roster, tagFilter]);

    const handleOpenModal = (member = null) => {
        setEditingMember(member);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditingMember(null);
        setIsModalOpen(false);
    };

    const handleSubmitModal = async (formData) => {
        try {
            if (editingMember) {
                await api.updateRosterMember(editingMember.id, formData);
            } else {
                await api.createRosterMember(formData);
            }
            fetchData();
        } catch (error) {
            console.error("Failed to save roster member:", error);
        } finally {
            handleCloseModal();
        }
    };

    const handleDeleteMember = (member) => {
        setConfirmModal({
            isOpen: true,
            message: `Are you sure you want to delete ${member.first_name} ${member.last_name}?`,
            onConfirm: async () => {
                try {
                    await api.deleteRosterMember(member.id);
                    fetchData();
                } catch (error) {
                    console.error("Failed to delete roster member:", error);
                } finally {
                    setConfirmModal({ isOpen: false, message: '', onConfirm: null });
                }
            }
        });
    };
    
    const handleEmailRoster = () => {
        if (filteredRoster.length > 0) {
            setIsEmailModalOpen(true);
        } else {
            alert("No roster members in the current filter to email.");
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">
            {/* Fix: Add Toaster here so notifications can appear */}
            <Toaster position="bottom-center" />
            
            <header className="flex items-center justify-between pb-8 border-b border-gray-700">
                <h1 className="text-3xl font-bold text-white">Global Roster</h1>
                <div className="flex items-center gap-4">
                    <InputField
                        placeholder="Filter by tag..."
                        value={tagFilter}
                        onChange={(e) => setTagFilter(e.target.value)}
                    />
                    <button onClick={handleEmailRoster} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-500 transition-colors">
                        <Mail size={18} /> Email Roster
                    </button>
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
                                    <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">Name</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-white">Position</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-white">Tags</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-white">Email</th>
                                    <th className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 bg-gray-900">
                                {filteredRoster.map(member => (
                                    <tr key={member.id}>
                                        <td className="py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">{`${member.first_name || ''} ${member.last_name || ''}`}</td>
                                        <td className="px-3 py-4 text-sm text-gray-300">{member.position}</td>
                                        <td className="px-3 py-4 text-sm text-gray-300">
                                            <div className="flex flex-wrap gap-1">
                                                {member.tags?.map(tag => (
                                                    <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-amber-300">{tag}</span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-3 py-4 text-sm text-gray-300">{member.email}</td>
                                        <td className="py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                            <button onClick={() => handleOpenModal(member)} className="p-1 text-gray-400 hover:text-amber-400"><Edit size={16} /></button>
                                            <button onClick={() => handleDeleteMember(member)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
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
                allTags={allTags}
            />
            <EmailComposeModal
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                recipients={filteredRoster}
                category="ROSTER"
            />
            {confirmModal.isOpen && (
                <ConfirmationModal
                    message={confirmModal.message}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal({ isOpen: false, message: '', onConfirm: null })}
                />
            )}
        </div>
    );
};

export default RosterView;