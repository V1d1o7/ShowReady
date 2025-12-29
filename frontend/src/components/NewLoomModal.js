import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import ColorPicker from './ColorPicker';

const NewLoomModal = ({ isOpen, onClose, onSubmit, initialData = null }) => {
    const [name, setName] = useState('');
    const [source, setSource] = useState('');
    const [destination, setDestination] = useState('');
    const [originColor, setOriginColor] = useState('Blue');
    const [destColor, setDestColor] = useState('Blue');

    useEffect(() => {
        if (initialData) {
            setName(initialData.name || '');
            setSource(initialData.source_loc || '');
            setDestination(initialData.dest_loc || '');
            setOriginColor(initialData.origin_color || 'Blue');
            setDestColor(initialData.destination_color || 'Blue');
        } else {
            // Reset for new entry
            setName('');
            setSource('');
            setDestination('');
            setOriginColor('Blue');
            setDestColor('Blue');
        }
    }, [initialData, isOpen]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ 
            name, 
            source, 
            destination,
            origin_color: originColor,
            destination_color: destColor 
        });
    };

    const title = initialData ? "Edit Loom" : "Create New Loom";
    const buttonText = initialData ? "Save Changes" : "Create Loom";

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <InputField
                    label="Loom Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. FOH Audio Main"
                    autoFocus
                    required
                />
                
                <div className="grid grid-cols-2 gap-4">
                    <InputField
                        label="Default Source"
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        placeholder="e.g. Stage Rack"
                    />
                    <InputField
                        label="Default Destination"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        placeholder="e.g. FOH Console"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <ColorPicker
                        label="Origin Color"
                        selectedColor={originColor}
                        onChange={setOriginColor}
                    />
                    <ColorPicker
                        label="Destination Color"
                        selectedColor={destColor}
                        onChange={setDestColor}
                    />
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!name.trim()}
                        className="px-4 py-2 bg-amber-500 text-black font-bold rounded hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {buttonText}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default NewLoomModal;