import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ adminOnly = false, feature = null, children }) => {
    const { profile, isLoading } = useAuth();

    if (isLoading) {
        return <div className="flex items-center justify-center h-full"><div className="text-xl text-gray-400">Checking permissions...</div></div>;
    }
    
    if (!profile) {
        // If loading is finished and there's still no profile, they are not logged in.
        return <Navigate to="/" replace />;
    }

    // Check for admin role if required
    if (adminOnly && (!profile.roles || !profile.roles.includes('admin'))) {
        return <Navigate to="/" replace />;
    }

    // Check for specific feature permission if required
    if (feature && (!profile.permitted_features || !profile.permitted_features.includes(feature))) {
        // Redirect to a more appropriate page, like the dashboard, if they lack feature access
        return <Navigate to="/" replace />;
    }

    return children;
};

export default ProtectedRoute;