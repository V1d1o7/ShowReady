import React from 'react';
import { useShow } from '../contexts/ShowContext';

const LocationSelector = ({ value, onChange, label }) => {
    const { racks } = useShow();

    const handleTypeChange = (e) => {
        onChange({ ...value, type: e.target.value, value: '' });
    };

    const handleValueChange = (e) => {
        onChange({ ...value, value: e.target.value });
    };

    const handleEndChange = (e) => {
        onChange({ ...value, end: e.target.value });
    };

    return (
        <div className="p-4 border border-gray-700 rounded-lg space-y-3">
            <p className="text-sm font-medium text-gray-300">{label}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Location Type</label>
                    <select 
                        value={value.type} 
                        onChange={handleTypeChange}
                        className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                    >
                        <option value="rack">Rack</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Location</label>
                    {value.type === 'rack' ? (
                        <select 
                            value={value.value} 
                            onChange={handleValueChange}
                            className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                        >
                            <option value="" disabled>Select a rack...</option>
                            {(racks || []).map(rack => (
                                <option key={rack.id} value={rack.rack_name}>{rack.rack_name}</option>
                            ))}
                        </select>
                    ) : (
                        <input 
                            type="text"
                            value={value.value}
                            onChange={handleValueChange}
                            className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                            placeholder="Enter custom location"
                        />
                    )}
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Cable End</label>
                    <select 
                        value={value.end} 
                        onChange={handleEndChange}
                        className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                    >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                    </select>
                </div>
            </div>
        </div>
    );
};

export default LocationSelector;
