import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import { Plus, Trash2, Mail, Check } from 'lucide-react';
import AddCrewFromRosterModal from '../components/AddCrewFromRosterModal';
import ConfirmationModal from '../components/ConfirmationModal';
import EmailComposeModal from '../components/EmailComposeModal';
import useHotkeys from '../hooks/useHotkeys';
import toast from 'react-hot-toast';

const ShowCrewView = () => {
    const { showId } = useShow();
    const [crew, setCrew] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
    const [selectedCrewIds, setSelectedCrewIds] = useState([]);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

    // Keyboard Shortcuts
    useHotkeys({
        'a': () => setIsAddModalOpen(true)
    });

    const fetchCrew = async () => {
        setIsLoading(true);
        try {
            const data = await api.getShowCrew(showId);
            setCrew(data);
        } catch (error) {
            console.error("Failed to fetch show crew:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (showId) fetchCrew();
    }, [showId]);

    const handleRemoveCrew = (crewMember) => {
        setConfirmModal({
            isOpen: true,
            message: `Remove ${crewMember.roster.first_name} ${crewMember.roster.last_name} from this show?`,
            onConfirm: async () => {
                try {
                    await api.removeCrewFromShow(showId, crewMember.id);
                    toast.success("Crew member removed");
                    fetchCrew();
                } catch (error) {
                    console.error("Failed to remove crew:", error);
                    toast.error(`Failed to remove crew: ${error.message}`);
                } finally {
                    setConfirmModal({ isOpen: false, message: '', onConfirm: null });
                }
            }
        });
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedCrewIds(crew.map(c => c.roster.id));
        } else {
            setSelectedCrewIds([]);
        }
    };

    const handleSelectOne = (rosterId) => {
        setSelectedCrewIds(prev => 
            prev.includes(rosterId) ? prev.filter(id => id !== rosterId) : [...prev, rosterId]
        );
    };

    // --- FIX APPLIED HERE ---
    // Previously: .map(c => c.roster) returned the roster object (ID = roster_id).
    // Fixed: Removed .map() to return the crew object (ID = show_crew_id), which the backend requires.
    const selectedRecipients = useMemo(() => {
        return crew.filter(c => selectedCrewIds.includes(c.roster.id));
    }, [crew, selectedCrewIds]);

    const handleEmailSelected = () => {
        if (selectedRecipients.length > 0) {
            setIsEmailModalOpen(true);
        }
    };

    // Custom Styled Checkbox Component
    const StyledCheckbox = ({ checked, onChange }) => (
        <label className="relative flex items-center cursor-pointer">
            <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={checked} 
                onChange={onChange} 
            />
            <div className={`w-5 h-5 border-2 rounded transition-colors flex items-center justify-center
                ${checked ? 'bg-amber-500 border-amber-500' : 'border-gray-500 hover:border-gray-400 bg-transparent'}
            `}>
                {checked && <Check size={14} className="text-black" strokeWidth={3} />}
            </div>
        </label>
    );

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <header className="flex items-center justify-between pb-6 border-b border-gray-700">
                <h1 className="text-2xl font-bold text-white">Show Crew</h1>
                <div className="flex gap-4">
                    {selectedCrewIds.length > 0 && (
                        <button onClick={handleEmailSelected} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-500 transition-colors">
                            <Mail size={18} /> Email Selected ({selectedCrewIds.length})
                        </button>
                    )}
                    <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors">
                        <Plus size={18} /> Add Crew
                    </button>
                </div>
            </header>

            <main className="mt-8">
                {isLoading ? (
                    <div className="text-center text-gray-500">Loading crew...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-800">
                                <tr>
                                    <th className="w-12 px-4 py-3">
                                        <StyledCheckbox 
                                            checked={crew.length > 0 && selectedCrewIds.length === crew.length}
                                            onChange={handleSelectAll}
                                        />
                                    </th>
                                    <th className="px-3 py-3 text-left text-sm font-semibold text-white">Name</th>
                                    <th className="px-3 py-3 text-left text-sm font-semibold text-white">Position</th>
                                    <th className="px-3 py-3 text-left text-sm font-semibold text-white">Rate</th>
                                    <th className="px-3 py-3 text-left text-sm font-semibold text-white">Email</th>
                                    <th className="relative py-3 pl-3 pr-4"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 bg-gray-900">
                                {crew.map(member => (
                                    <tr key={member.id} className="hover:bg-gray-800/50 transition-colors">
                                        <td className="px-4 py-4">
                                            <StyledCheckbox 
                                                checked={selectedCrewIds.includes(member.roster.id)}
                                                onChange={() => handleSelectOne(member.roster.id)}
                                            />
                                        </td>
                                        <td className="px-3 py-4 text-sm font-medium text-white">
                                            {member.roster.first_name} {member.roster.last_name}
                                        </td>
                                        <td className="px-3 py-4 text-sm text-gray-300">{member.position}</td>
                                        <td className="px-3 py-4 text-sm text-gray-300">
                                            {member.rate_type === 'daily' ? `$${member.daily_rate}/day` : `$${member.hourly_rate}/hr`}
                                        </td>
                                        <td className="px-3 py-4 text-sm text-gray-300">{member.roster.email}</td>
                                        <td className="py-4 pl-3 pr-4 text-right text-sm font-medium">
                                            <button onClick={() => handleRemoveCrew(member)} className="text-gray-500 hover:text-red-500 transition-colors">
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {crew.length === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                No crew assigned to this show yet.
                            </div>
                        )}
                    </div>
                )}
            </main>

            <AddCrewFromRosterModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAdded={fetchCrew} showId={showId} />
            <EmailComposeModal isOpen={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} recipients={selectedRecipients} category="CREW" showId={showId} />
            
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

export default ShowCrewView;