import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ adminOnly = false, feature = null, children }) => {
    // FIX: Destructure 'session' instead of 'user', as AuthContext provides 'session'
    const { session, profile, isLoading } = useAuth();
    const user = session?.user; // Derive user from session
    
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-xl text-gray-400">Loading permissions...</div>
            </div>
        );
    }
    
    // 1. Check Authentication
    if (!user || !profile) {
        console.warn(`[ProtectedRoute] Access denied to ${location.pathname}: User not logged in.`, { user, profile });
        // Force redirect to root (which shows Auth view)
        return <Navigate to="/" replace />;
    }

    // 2. Check Admin Access
    if (adminOnly) {
        const hasAdminRole = profile.roles?.includes('global_admin');
        
        if (!hasAdminRole) {
            console.warn(`[ProtectedRoute] Access denied to ${location.pathname}: User is not global_admin. Roles found:`, profile.roles);
            return <Navigate to="/" replace />;
        }
    }

    // 3. Check Feature Access
    if (feature) {
        const hasFeature = profile.permitted_features?.includes(feature);
        
        if (!hasFeature) {
            console.warn(`[ProtectedRoute] Access denied to ${location.pathname}: Missing feature '${feature}'. Permitted:`, profile.permitted_features);
            return <Navigate to="/" replace />;
        }
    }

    // Access Granted
    return children;
};

export default ProtectedRoute;