import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Users, BarChart2, HardDrive, Shield } from 'lucide-react';

const AdminSidebar = () => {
    const { profile } = useAuth(); // Using the hook, though not strictly necessary for this component yet
    
    const navLinkClasses = ({ isActive }) =>
        `flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            isActive
                ? 'bg-amber-500 text-black'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`;

    // In the future, if we want to restrict access to admin sections,
    // we could filter these tabs based on profile.permitted_features
    const tabs = [
        { path: 'email', label: 'Email Sending', icon: Mail },
        { path: 'equipment-library', label: 'Equipment Library', icon: HardDrive },
        { path: 'switch-models', label: 'Switch Models', icon: HardDrive },
        { path: 'user-management', label: 'User Management', icon: Users },
        { path: 'metrics', label: 'Metrics', icon: BarChart2 },
        { path: 'rbac', label: 'RBAC', icon: Shield },
    ];

    return (
        <div className="w-64 bg-gray-800 text-white p-4 flex flex-col">
            <div className="mb-8">
                <h2 className="text-xl font-bold">Admin Panel</h2>
            </div>
            <nav className="flex flex-col gap-2">
                {tabs.map(tab => (
                     <NavLink key={tab.path} to={`/mgmt/${tab.path}`} className={navLinkClasses}>
                        <tab.icon className="mr-3 h-5 w-5" />
                        {tab.label}
                    </NavLink>
                ))}
            </nav>
        </div>
    );
};

export default AdminSidebar;
