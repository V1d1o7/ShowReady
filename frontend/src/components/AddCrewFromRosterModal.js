import React, { useState } from 'react';

const AddCrewFromRosterModal = ({ isOpen, onClose, rosterMember, onSubmit }) => {
    const [position, setPosition] = useState('');
    const [rateType, setRateType] = useState('hourly');
    const [rate, setRate] = useState(0);

    if (!isOpen) return null;

    const handleSubmit = () => {
        const rateData = {
            position,
            rate_type: rateType,
            hourly_rate: rateType === 'hourly' ? parseFloat(rate) : 0,
            daily_rate: rateType === 'daily' ? parseFloat(rate) : 0,
        };
        onSubmit(rosterMember.id, rateData);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
                <h3 className="text-lg font-bold mb-4">Add {rosterMember.first_name} {rosterMember.last_name} to Crew</h3>
                
                <div className="mb-4">
                    <label htmlFor="position" className="block text-sm font-medium text-gray-400 mb-1">Position</label>
                    <input
                        type="text"
                        id="position"
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white"
                    />
                </div>

                <div className="mb-4">
                    <label htmlFor="rate_type" className="block text-sm font-medium text-gray-400 mb-1">Rate Type</label>
                    <select
                        id="rate_type"
                        value={rateType}
                        onChange={(e) => setRateType(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white"
                    >
                        <option value="hourly">Hourly</option>
                        <option value="daily">Daily</option>
                    </select>
                </div>

                <div className="mb-4">
                    <label htmlFor="rate" className="block text-sm font-medium text-gray-400 mb-1">Rate</label>
                    <input
                        type="number"
                        id="rate"
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white"
                    />
                </div>

                <div className="flex justify-end gap-4 mt-6">
                    <button onClick={onClose} className="px-4 py-2 rounded-md bg-gray-600">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 rounded-md bg-amber-500 text-black">Add Crew Member</button>
                </div>
            </div>
        </div>
    );
};

export default AddCrewFromRosterModal;
