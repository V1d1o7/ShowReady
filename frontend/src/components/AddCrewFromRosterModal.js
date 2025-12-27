import React, { useState, useEffect } from 'react';
import { api } from '../api/api';
import { UserPlus, Users } from 'lucide-react';
import toast from 'react-hot-toast';

const AddCrewFromRosterModal = ({ isOpen, onClose, onAdded, showId }) => {
    // Mode: 'existing' or 'new'
    const [mode, setMode] = useState('existing');

    const [roster, setRoster] = useState([]);
    const [selectedRosterId, setSelectedRosterId] = useState('');
    
    // Fields for both modes
    const [position, setPosition] = useState('');
    const [rateType, setRateType] = useState('hourly');
    const [rate, setRate] = useState(0);

    // Fields for 'new' mode only
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');

    const [isLoadingRoster, setIsLoadingRoster] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset and Fetch when modal opens
    useEffect(() => {
        if (isOpen) {
            setMode('existing');
            resetForm();
            fetchRoster();
            
            const handleEsc = (e) => {
                if (e.key === 'Escape') onClose();
            };
            window.addEventListener('keydown', handleEsc);
            return () => window.removeEventListener('keydown', handleEsc);
        }
    }, [isOpen]);

    const resetForm = () => {
        setSelectedRosterId('');
        setPosition('');
        setRateType('hourly');
        setRate(0);
        setFirstName('');
        setLastName('');
        setEmail('');
    };

    const fetchRoster = async () => {
        setIsLoadingRoster(true);
        try {
            const data = await api.getRoster();
            setRoster(data);
        } catch (error) {
            console.error("Failed to fetch roster:", error);
        } finally {
            setIsLoadingRoster(false);
        }
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault(); // Prevent default if triggered by form submit

        if (mode === 'existing' && !selectedRosterId) return;
        if (mode === 'new' && (!firstName || !lastName)) return;
        
        setIsSubmitting(true);
        try {
            let targetRosterId = selectedRosterId;

            // If creating new, first create the roster member
            if (mode === 'new') {
                const newMemberData = {
                    first_name: firstName,
                    last_name: lastName,
                    email: email || null,
                    position: position // Default position for roster
                };
                const newMember = await api.createRosterMember(newMemberData);
                targetRosterId = newMember.id;
            }

            // Prepare Rate Data
            const rateData = {
                position,
                rate_type: rateType,
                hourly_rate: rateType === 'hourly' ? parseFloat(rate) : 0,
                daily_rate: rateType === 'daily' ? parseFloat(rate) : 0,
            };

            // Add to Show
            await api.addCrewToShow(showId, targetRosterId, rateData);
            
            toast.success("Crew member added successfully");
            if (onAdded) onAdded();
            onClose();
        } catch (error) {
            console.error("Failed to add crew member:", error);
            toast.error(`Failed to add crew member: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm"
            onClick={onClose} // Click outside to close
        >
            <div 
                className="bg-gray-800 rounded-lg p-6 w-full max-w-md shadow-xl border border-gray-700"
                onClick={(e) => e.stopPropagation()} // Prevent close when clicking inside
            >
                {/* Header with Mode Toggle */}
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-white">
                        {mode === 'existing' ? 'Add Crew from Roster' : 'Create New Crew Member'}
                    </h3>
                </div>

                {/* Mode Tabs */}
                <div className="flex bg-gray-700 rounded-lg p-1 mb-6">
                    <button
                        onClick={() => setMode('existing')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-colors ${
                            mode === 'existing' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <Users size={16} /> From Roster
                    </button>
                    <button
                        onClick={() => setMode('new')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-colors ${
                            mode === 'new' ? 'bg-amber-600 text-white shadow' : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <UserPlus size={16} /> Create New
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* EXISTING MODE: Roster Select */}
                    {mode === 'existing' && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-400 mb-1">Select Person</label>
                            {isLoadingRoster ? (
                                <div className="text-gray-500 text-sm">Loading roster...</div>
                            ) : (
                                <select
                                    value={selectedRosterId}
                                    onChange={(e) => {
                                        setSelectedRosterId(e.target.value);
                                        const member = roster.find(m => m.id === e.target.value);
                                        if (member && member.position) setPosition(member.position);
                                    }}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                                    autoFocus
                                >
                                    <option value="">-- Select a member --</option>
                                    {roster.map(member => (
                                        <option key={member.id} value={member.id}>
                                            {member.first_name} {member.last_name}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}

                    {/* NEW MODE: Personal Details */}
                    {mode === 'new' && (
                        <div className="space-y-4 mb-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">First Name</label>
                                    <input
                                        type="text"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                        placeholder="Jane"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Last Name</label>
                                    <input
                                        type="text"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                        placeholder="Doe"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                    placeholder="jane@example.com"
                                />
                            </div>
                        </div>
                    )}

                    {/* SHARED: Job & Rate Details */}
                    <div className="space-y-4 border-t border-gray-700 pt-4 mt-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Position on Show</label>
                            <input
                                type="text"
                                value={position}
                                onChange={(e) => setPosition(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                placeholder="e.g. A1, V1, Camera Op"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Rate Type</label>
                                <select
                                    value={rateType}
                                    onChange={(e) => setRateType(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                >
                                    <option value="hourly">Hourly</option>
                                    <option value="daily">Daily</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Rate ($)</label>
                                <input
                                    type="number"
                                    value={rate}
                                    onChange={(e) => setRate(e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex justify-end gap-3 mt-8">
                        <button 
                            type="button"
                            onClick={onClose} 
                            className="px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={isSubmitting || (mode === 'existing' && !selectedRosterId) || (mode === 'new' && (!firstName || !lastName))}
                            className={`px-4 py-2 rounded-md font-bold text-black transition-colors ${
                                isSubmitting || (mode === 'existing' && !selectedRosterId) || (mode === 'new' && (!firstName || !lastName))
                                ? 'bg-gray-600 cursor-not-allowed' 
                                : 'bg-amber-500 hover:bg-amber-400'
                            }`}
                        >
                            {isSubmitting ? 'Saving...' : (mode === 'existing' ? 'Add Selected' : 'Create & Add')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddCrewFromRosterModal;