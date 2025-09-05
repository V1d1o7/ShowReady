import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ profile, adminOnly = false, children }) => {
    if (!profile) {
        // You can return a loading spinner here while the profile is being fetched
        return <div>Loading...</div>;
    }

    if (adminOnly && (!profile.roles || !profile.roles.includes('admin'))) {
        // Redirect them to the home page if they are not an admin
        return <Navigate to="/" replace />;
    }

    return children;
};

export default ProtectedRoute;