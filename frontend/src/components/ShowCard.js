import React, { useState, useEffect } from 'react';
import { supabase } from '../api/api';
import { Trash2, Share2, Archive, RefreshCcw, Users } from 'lucide-react';

const ShowCard = ({ show, onSelect, onDelete, onToggleArchive, currentUserId }) => {
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

    const handleArchiveClick = (e) => {
        e.stopPropagation();
        onToggleArchive(show.id, show.status);
    };

    const isShared = currentUserId && show.user_id && show.user_id !== currentUserId;
    const isArchived = show.status === 'archived';

    return (
        <div 
            onClick={onSelect} 
            className={`group relative rounded-xl p-6 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 overflow-hidden border
                ${isArchived 
                    ? 'bg-gray-800/30 border-gray-700 opacity-75 grayscale' 
                    : 'bg-gray-800/50 hover:bg-gray-800/80 border-transparent'
                }`}
        >
            
            {/* Status Badges (Top Left) */}
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
                {isShared && (
                    <div title="Shared with you">
                        <Users size={18} className="text-blue-400" />
                    </div>
                )}
                {isArchived && (
                    <span className="px-2 py-1 bg-gray-700/90 text-gray-300 text-xs font-bold uppercase rounded-md border border-gray-600 shadow-sm">
                        Archived
                    </span>
                )}
            </div>

            {/* Action Buttons (Top Right) */}
            <div className="absolute top-3 right-3 z-10 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Archive Toggle Button */}
                {!isShared && (
                    <button 
                        onClick={handleArchiveClick} 
                        className="text-gray-400 hover:text-amber-500 transition-colors"
                        title={isArchived ? "Unarchive Show" : "Archive Show"}
                    >
                        {isArchived ? <RefreshCcw size={18} /> : <Archive size={18} />}
                    </button>
                )}

                {/* Delete Button */}
                <button 
                    onClick={handleDeleteClick} 
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete Show"
                >
                    <Trash2 size={18} />
                </button>
            </div>

            {/* Card Content */}
            <div className="flex flex-col items-center justify-center h-32">
                {logoUrl && !logoError ? (
                    <img
                        src={logoUrl}
                        alt={`${show.name} logo`}
                        className="w-full h-full object-contain"
                        onError={() => setLogoError(true)}
                    />
                ) : (
                    <h2 className={`text-lg font-bold text-center ${isArchived ? 'text-gray-400' : 'text-white'}`}>
                        {show.name}
                    </h2>
                )}
            </div>
        </div>
    );
};

export default ShowCard;