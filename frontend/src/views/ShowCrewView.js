import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import RosterModal from '../components/RosterModal';
import ConfirmationModal from '../components/ConfirmationModal';
import AddCrewFromRosterModal from '../components/AddCrewFromRosterModal';
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

    const fetchCrew = useCallback(async () => {
        if (!showId) return;
        setIsLoading(true);
        try {
            const crewData = await api.getShowCrew(showId);
            setCrew(crewData);
        } catch (error) {
            console.error("Failed to fetch show crew:", error);
        } finally {
            setIsLoading(false);
        }
    }, [showId]);

    useEffect(() => {
        fetchCrew();
    }, [fetchCrew]);

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
            message: `Are you sure you want to remove ${member.roster.first_name} ${member.roster.last_name} (${member.position}) from this show?`,
            onConfirm: async () => {
                await api.removeCrewFromShow(showId, member.id);
                fetchCrew();
                setConfirmModal({ isOpen: false, message: '', onConfirm: null });
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

    const handleRateChange = (crewId, field, value) => {
        setCrew(prev => prev.map(member => member.id === crewId ? { ...member, [field]: value } : member));
    };

    const handleSaveChanges = async () => {
        const updates = crew.map(member => api.updateShowCrewMember(member.id, {
            position: member.position,
            rate_type: member.rate_type,
            hourly_rate: member.hourly_rate,
            daily_rate: member.daily_rate
        }));
        await Promise.all(updates);
        fetchCrew();
    };

    useHotkeys({
        'n': () => setIsRosterModalOpen(true),
        'a': openAddFromRosterModal,
        'escape': () => {
            setIsAddFromRosterModalOpen(false);
            setIsAddCrewDetailsModalOpen(false);
        }
    });

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <header className="flex items-center justify-between pb-4 border-b border-gray-700">
                <h2 className="text-2xl font-bold text-white">Show Crew</h2>
                <div className="flex items-center gap-4">
                    <button onClick={openAddFromRosterModal} className="px-4 py-2 text-sm font-medium rounded-md bg-gray-700 hover:bg-gray-600">Add from Roster</button>
                    <button onClick={() => setIsRosterModalOpen(true)} className="px-4 py-2 text-sm font-medium rounded-md bg-amber-500 text-black hover:bg-amber-400">Add New to Roster</button>
                </div>
            </header>
            <main className="mt-6">
                {isLoading ? (
                    <p className="text-gray-400">Loading crew...</p>
                ) : (
                    <ul className="divide-y divide-gray-700">
                        {crew.map(member => (
                            <li key={member.id} className="py-4 grid grid-cols-3 items-center gap-4">
                                <div className="col-span-1">
                                    <p className="font-medium text-white">{`${member.roster.first_name || ''} ${member.roster.last_name || ''}`}</p>
                                    <input
                                        type="text"
                                        value={member.position || ''}
                                        onChange={(e) => handleRateChange(member.id, 'position', e.target.value)}
                                        className="text-sm bg-gray-800 border border-gray-700 rounded-md p-1 mt-1 w-full"
                                        placeholder="Position"
                                    />
                                </div>
                                <div className="col-span-1 flex items-center gap-2">
                                    <select value={member.rate_type} onChange={(e) => handleRateChange(member.id, 'rate_type', e.target.value)} className="bg-gray-800 border border-gray-700 rounded-md p-1">
                                        <option value="hourly">Hourly</option>
                                        <option value="daily">Daily</option>
                                    </select>
                                    <input
                                        type="number"
                                        value={member.rate_type === 'hourly' ? member.hourly_rate : member.daily_rate}
                                        onChange={(e) => handleRateChange(member.id, member.rate_type === 'hourly' ? 'hourly_rate' : 'daily_rate', e.target.value)}
                                        className="w-24 bg-gray-800 border border-gray-700 rounded-md p-1 text-center"
                                    />
                                </div>
                                <div className="col-span-1 flex justify-end">
                                    <button onClick={() => handleRemoveMember(member)} className="text-sm text-red-500 hover:text-red-400">Remove</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="mt-4 flex justify-end">
                    <button onClick={handleSaveChanges} className="px-4 py-2 text-sm font-medium rounded-md bg-amber-500 text-black hover:bg-amber-400">Save Changes</button>
                </div>
            </main>
            <RosterModal isOpen={isRosterModalOpen} onClose={() => setIsRosterModalOpen(false)} onSubmit={handleAddNewMember} customFields={[]} />

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
                <AddCrewFromRosterModal
                    isOpen={isAddCrewDetailsModalOpen}
                    onClose={() => {
                        setIsAddCrewDetailsModalOpen(false);
                        setSelectedRosterMember(null);
                    }}
                    rosterMember={selectedRosterMember}
                    onSubmit={handleAddFromRoster}
                />
            )}

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
