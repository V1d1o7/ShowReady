import React, { useState, useEffect } from 'react';
import { api } from '../api/api';
import Modal from './Modal';
import { HardDrive, Plus } from 'lucide-react';

const RackLibraryModal = ({ isOpen, onClose, onRackLoad }) => {
    const [libraryRacks, setLibraryRacks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            const fetchLibraryRacks = async () => {
                setIsLoading(true);
                try {
                    const racks = await api.getLibraryRacks();
                    setLibraryRacks(racks);
                } catch (error) {
                    console.error("Failed to fetch library racks:", error);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchLibraryRacks();
        }
    }, [isOpen]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Load Rack from Library" maxWidth="max-w-2xl">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                {isLoading ? (
                    <p className="text-gray-400">Loading saved racks...</p>
                ) : libraryRacks.length > 0 ? (
                    libraryRacks.map(rack => (
                        <button 
                            key={rack.id}
                            onClick={() => onRackLoad(rack.id)}
                            className="w-full flex justify-between items-center p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-left transition-colors"
                        >
                            <div>
                                <p className="font-bold text-white">{rack.rack_name}</p>
                                <p className="text-sm text-gray-400">{rack.ru_height}RU</p>
                            </div>
                            <Plus size={20} />
                        </button>
                    ))
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        <HardDrive size={48} className="mx-auto mb-4" />
                        <h3 className="font-bold text-lg">No Saved Racks</h3>
                        <p>You can save a rack to your library from the "My Library" page.</p>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default RackLibraryModal;