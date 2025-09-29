import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const ImpersonationBanner = () => {
    const { isImpersonating, stopImpersonation, profile } = useAuth();

    if (!isImpersonating) {
        return null;
    }

    const impersonatedUserName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'a user';

    return (
        <div className="bg-red-600 text-white text-center p-2 fixed top-0 left-0 w-full z-50">
            <span>
                You are currently impersonating <strong>{impersonatedUserName}</strong>.
            </span>
            <button
                onClick={stopImpersonation}
                className="ml-4 px-3 py-1 bg-white text-red-600 font-bold rounded hover:bg-red-100 transition-colors"
            >
                Exit Impersonation
            </button>
        </div>
    );
};

export default ImpersonationBanner;