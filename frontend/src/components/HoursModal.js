import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import useHotkeys from '../hooks/useHotkeys';

const HoursModal = ({ isOpen, onClose, onSubmit, entry, crew }) => {
    const [formData, setFormData] = useState({});

    useHotkeys({
        'escape': onClose,
    });

    useEffect(() => {
        if (entry) {
            setFormData(entry);
        } else {
            setFormData({});
        }
    }, [entry]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={entry ? "Edit Hours" : "Add Hours"}>
            <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                    <select name="show_crew_id" value={formData.show_crew_id || ''} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2">
                        <option value="">Select Crew Member</option>
                        {crew.map(member => (
                            <option key={member.id} value={member.id}>{`${member.first_name} ${member.last_name}`}</option>
                        ))}
                    </select>
                    <input type="date" name="date" value={formData.date || ''} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2" />
                    <input type="number" name="hours" placeholder="Hours" value={formData.hours || ''} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2" />
                    <input type="text" name="category" placeholder="Category (e.g., FOH, Monitors)" value={formData.category || ''} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2" />
                </div>
                <div className="mt-6 flex justify-end gap-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600">Cancel</button>
                    <button type="submit" className="px-4 py-2 rounded-md bg-amber-500 text-black hover:bg-amber-400">Save</button>
                </div>
            </form>
        </Modal>
    );
};

export default HoursModal;
