//
import React, { useState, useEffect, useMemo, useContext } from 'react';
import { api } from '../api/api';
import { Plus, Edit, Trash2, Mail, HelpCircle, Lock } from 'lucide-react'; // Added Lock
import { Toaster } from 'react-hot-toast'; 
import { LayoutContext } from '../contexts/LayoutContext';
import useHotkeys from '../hooks/useHotkeys';
import RosterModal from '../components/RosterModal';
import EmailComposeModal from '../components/EmailComposeModal';
import ConfirmationModal from '../components/ConfirmationModal';
import InputField from '../components/InputField';
import ShortcutsModal from '../components/ShortcutsModal';

const RosterView = () => {
    const { setShouldScroll } = useContext(LayoutContext);
    const [roster, setRoster] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
    const [filterText, setFilterText] = useState(''); 
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

    // Enable scrolling for this view
    useEffect(() => {
        setShouldScroll(true);
        return () => setShouldScroll(false);
    }, [setShouldScroll]);

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
                // Return clean tags for the suggestion pool so we don't duplicate "_Tag" and "Tag"
                member.tags.forEach(tag => {
                    const cleanTag = tag.startsWith('_') ? tag.substring(1) : tag;
                    tags.add(cleanTag);
                });
            }
        });
        return Array.from(tags);
    }, [roster]);

    const filteredRoster = useMemo(() => {
        if (!filterText) {
            return roster;
        }
        const search = filterText.toLowerCase();
        return roster.filter(member => {
            const fullName = `${member.first_name || ''} ${member.last_name || ''}`.toLowerCase();
            
            // Allow searching by the "clean" version of the tag
            const hasMatchingTag = member.tags && member.tags.some(tag => {
                const cleanTag = tag.startsWith('_') ? tag.substring(1) : tag;
                return cleanTag.toLowerCase().includes(search);
            });
            
            return fullName.includes(search) || hasMatchingTag;
        });
    }, [roster, filterText]);

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

    // Keyboard Shortcuts
    useHotkeys({
        'n': () => handleOpenModal(),
        'm': handleEmailRoster
    });

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">
            <Toaster position="bottom-center" />
            
            <header className="flex items-center justify-between pb-8 border-b border-gray-700">
                <h1 className="text-3xl font-bold text-white">Global Roster</h1>
                <div className="flex items-center gap-4">
                    <InputField
                        placeholder="Search by name or tag..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
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
                                                {member.tags?.map(tag => {
                                                    const isPrivate = tag.startsWith('_');
                                                    const displayName = isPrivate ? tag.substring(1) : tag;
                                                    
                                                    return (
                                                        <span 
                                                            key={tag} 
                                                            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                                                                isPrivate 
                                                                    ? 'bg-gray-800 text-gray-400 border border-gray-600' // Private Style
                                                                    : 'bg-gray-700 text-amber-300' // Public Style
                                                            }`}
                                                            title={isPrivate ? "Private Tag (Internal Only)" : "Public Tag"}
                                                        >
                                                            {displayName}
                                                            {isPrivate && <Lock size={10} className="text-amber-500/80" />}
                                                        </span>
                                                    );
                                                })}
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
                        {filteredRoster.length === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                No members found matching "{filterText}"
                            </div>
                        )}
                    </div>
                )}
            </main>

            <button
                onClick={() => setIsShortcutsModalOpen(true)}
                className="fixed bottom-6 left-6 p-3 bg-gray-800 text-gray-400 hover:text-white rounded-full shadow-lg border border-gray-700 transition-colors z-50 hover:bg-gray-700"
                title="Shortcuts"
            >
                <HelpCircle size={24} />
            </button>

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
            <ShortcutsModal 
                isOpen={isShortcutsModalOpen} 
                onClose={() => setIsShortcutsModalOpen(false)} 
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