import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';

const EditRackModal = ({ isOpen, onClose, onSubmit, rack }) => {
    const [rackName, setRackName] = useState('');
    const [ruHeight, setRuHeight] = useState(42);

    useEffect(() => {
        if (rack) {
            setRackName(rack.rack_name || '');
            setRuHeight(rack.ru_height || 42);
        }
    }, [rack]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ rack_name: rackName, ru_height: parseInt(ruHeight, 10) });
    };

    if (!rack) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit Rack: ${rack.rack_name}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField 
                    label="Rack Name" 
                    type="text" 
                    value={rackName} 
                    onChange={(e) => setRackName(e.target.value)} 
                    required 
                    autoFocus 
                />
                <InputField 
                    label="RU Height" 
                    type="number" 
                    value={ruHeight} 
                    onChange={(e) => setRuHeight(e.target.value)} 
                    required 
                    min="1" 
                />
                <div className="flex justify-end gap-4 pt-4">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black"
                    >
                        Save Changes
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default EditRackModal;