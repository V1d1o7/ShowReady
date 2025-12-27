// frontend/src/components/ShowCard.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../api/api';
import { Trash2, Users } from 'lucide-react'; // Import Users icon

const ShowCard = ({ show, onSelect, onDelete, currentUserId }) => {
    const [logoUrl, setLogoUrl] = useState(null);
    const [logoError, setLogoError] = useState(false);

    useEffect(() => {
        if (show.logo_path) {
            setLogoError(false);
            supabase.storage.from('logos').createSignedUrl(show.logo_path, 3600)
                .then(({ data, error }) => {
                    if (error) {
                        console.error("Error creating signed URL for show card:", error);
                        setLogoError(true);
                    } else {
                        setLogoUrl(data.signedUrl);
                    }
                });
        } else {
            setLogoUrl(null);
        }
    }, [show.logo_path]);

    const handleDeleteClick = (e) => {
        e.stopPropagation();
        onDelete();
    };

    // Determine if the show is shared (i.e., you are not the owner)
    const isShared = currentUserId && show.user_id && show.user_id !== currentUserId;

    return (
        <div onClick={onSelect} className="group relative bg-gray-800/50 hover:bg-gray-800/80 rounded-xl p-6 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 overflow-hidden">
            
            {/* Shared Indicator (Top Left) */}
            {isShared && (
                <div className="absolute top-3 left-3 z-10" title="Shared with you">
                    <Users size={16} className="text-blue-400" />
                </div>
            )}

            {/* Delete Button (Top Right) */}
            <div className="absolute top-3 right-3 z-10">
                <button onClick={handleDeleteClick} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity">
                    <Trash2 size={16} />
                </button>
            </div>

            <div className="flex flex-col items-center justify-center h-32">
                {logoUrl && !logoError ? (
                    <img
                        src={logoUrl}
                        alt={`${show.name} logo`}
                        className="w-full h-full object-contain"
                        onError={() => setLogoError(true)}
                    />
                ) : (
                    <h2 className="text-lg font-bold text-center text-white">{show.name}</h2>
                )}
            </div>
        </div>
    );
};

export default ShowCard;