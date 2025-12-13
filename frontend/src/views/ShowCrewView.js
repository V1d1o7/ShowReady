import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import { Mail, Plus } from 'lucide-react';
import { Toaster } from 'react-hot-toast'; // Fix: Import Toaster
import RosterModal from '../components/RosterModal';
import ConfirmationModal from '../components/ConfirmationModal';
import AddCrewFromRosterModal from '../components/AddCrewFromRosterModal';
import EmailComposeModal from '../components/EmailComposeModal';
import useHotkeys from '../hooks/useHotkeys';

const ShowCrewView = () => {
    const { showId } = useShow();
    const [crew, setCrew] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
    const [isAddFromRosterModalOpen, setIsAddFromRosterModalOpen] = useState(false);
    const [isAddCrewDetailsModalOpen, setIsAddCrewDetailsModalOpen] = useState(false);
    const [selectedRosterMember, setSelectedRosterMember] = useState(null);
    const [roster, setRoster] = useState([]);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
    const [selectedCrew, setSelectedCrew] = useState(new Set());
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

    const fetchCrew = useCallback(async () => {
        if (!showId) return;
        setIsLoading(true);
        try {
            const crewData = await api.getShowCrew(showId);
            setCrew(crewData);
        } catch (error) { console.error("Failed to fetch show crew:", error); } 
        finally { setIsLoading(false); }
    }, [showId]);

    useEffect(() => { fetchCrew(); }, [fetchCrew]);

    const handleAddNewMember = async (formData) => {
        await api.createRosterMemberAndAddToShow({ ...formData, show_id: showId });
        fetchCrew();
        setIsRosterModalOpen(false);
    };

    const handleAddFromRoster = async (rosterId, details) => {
        await api.addCrewToShow(showId, rosterId, details);
        fetchCrew();
        setIsAddCrewDetailsModalOpen(false);
        setSelectedRosterMember(null);
    };

    const handleRemoveMember = (member) => {
        setConfirmModal({
            isOpen: true,
            message: `Remove ${member.roster.first_name} ${member.roster.last_name} from this show?`,
            onConfirm: async () => {
                await api.removeCrewFromShow(showId, member.id);
                fetchCrew();
                setConfirmModal({ isOpen: false, onConfirm: null });
            }
        });
    };
    
    const openAddFromRosterModal = async () => {
        const rosterData = await api.getRoster();
        setRoster(rosterData);
        setIsAddFromRosterModalOpen(true);
    };

    const openAddCrewDetailsModal = (member) => {
        setSelectedRosterMember(member);
        setIsAddCrewDetailsModalOpen(true);
        setIsAddFromRosterModalOpen(false);
    }

    const handleSelectionChange = (crewId) => {
        setSelectedCrew(prev => {
            const newSelection = new Set(prev);
            if (newSelection.has(crewId)) {
                newSelection.delete(crewId);
            } else {
                newSelection.add(crewId);
            }
            return newSelection;
        });
    };

    const handleEmailSelected = () => {
        if (selectedCrew.size === 0) {
            alert("Please select at least one crew member to email.");
            return;
        }
        setIsEmailModalOpen(true);
    };

    const getSelectedCrewData = () => {
        return crew.filter(c => selectedCrew.has(c.id)).map(c => c.roster);
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            {/* Fix: Add Toaster here so notifications can appear */}
            <Toaster position="bottom-center" />

            <header className="flex items-center justify-between pb-4 border-b border-gray-700">
                <h2 className="text-2xl font-bold text-white">Show Crew</h2>
                <div className="flex items-center gap-4">
                    <button onClick={handleEmailSelected} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-500">
                        <Mail size={16} /> Email Selected ({selectedCrew.size})
                    </button>
                    <button onClick={openAddFromRosterModal} className="px-4 py-2 text-sm font-medium rounded-md bg-gray-700 hover:bg-gray-600">Add from Roster</button>
                    <button onClick={() => setIsRosterModalOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-amber-500 text-black hover:bg-amber-400">
                        <Plus size={16} /> Add New to Roster
                    </button>
                </div>
            </header>
            <main className="mt-6">
                {isLoading ? <p className="text-gray-400">Loading crew...</p> : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-800">
                                <tr>
                                    <th scope="col" className="p-4"><input type="checkbox" className="bg-gray-700 border-gray-600 rounded" onChange={(e) => setSelectedCrew(e.target.checked ? new Set(crew.map(c => c.id)) : new Set())} /></th>
                                    <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white">Name</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-white">Position</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-white">Email</th>
                                    <th className="relative py-3.5 pl-3 pr-4"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 bg-gray-900">
                                {crew.map(member => (
                                    <tr key={member.id}>
                                        <td className="p-4"><input type="checkbox" className="bg-gray-700 border-gray-600 rounded" checked={selectedCrew.has(member.id)} onChange={() => handleSelectionChange(member.id)} /></td>
                                        <td className="py-4 pl-4 pr-3 text-sm font-medium text-white">{`${member.roster.first_name || ''} ${member.roster.last_name || ''}`}</td>
                                        <td className="px-3 py-4 text-sm text-gray-300">{member.position}</td>
                                        <td className="px-3 py-4 text-sm text-gray-300">{member.roster.email}</td>
                                        <td className="py-4 pl-3 pr-4 text-right text-sm font-medium">
                                            <button onClick={() => handleRemoveMember(member)} className="text-red-500 hover:text-red-400">Remove</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
            <RosterModal isOpen={isRosterModalOpen} onClose={() => setIsRosterModalOpen(false)} onSubmit={handleAddNewMember} />
            {isAddFromRosterModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
                        <h3 className="text-lg font-bold mb-4">Add from Roster</h3>
                        <ul className="max-h-[60vh] overflow-y-auto">
                            {roster.map(member => (
                                <li key={member.id} className="py-2 flex justify-between items-center">
                                    <span>{`${member.first_name || ''} ${member.last_name || ''}`}</span>
                                    <button onClick={() => openAddCrewDetailsModal(member)} className="px-2 py-1 text-sm rounded-md bg-amber-500 text-black">Add</button>
                                </li>
                            ))}
                        </ul>
                        <button onClick={() => setIsAddFromRosterModalOpen(false)} className="mt-4 px-4 py-2 rounded-md bg-gray-700">Close</button>
                    </div>
                </div>
            )}
            {selectedRosterMember && (
                <AddCrewFromRosterModal isOpen={isAddCrewDetailsModalOpen} onClose={() => { setIsAddCrewDetailsModalOpen(false); setSelectedRosterMember(null); }} rosterMember={selectedRosterMember} onSubmit={handleAddFromRoster} />
            )}
            {confirmModal.isOpen && (
                <ConfirmationModal message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal({ isOpen: false })} />
            )}
            <EmailComposeModal isOpen={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} recipients={getSelectedCrewData()} category="CREW" />
        </div>
    );
};

export default ShowCrewView;