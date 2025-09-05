import React from 'react';
import { NavLink } from 'react-router-dom';
import { Mail, Users, BarChart2, HardDrive } from 'lucide-react';

const AdminSidebar = () => {
    const navLinkClasses = ({ isActive }) =>
        `flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            isActive
                ? 'bg-amber-500 text-black'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`;

    return (
        <div className="w-64 bg-gray-800 text-white p-4 flex flex-col">
            <div className="mb-8">
                <h2 className="text-xl font-bold">Admin Panel</h2>
            </div>
            <nav className="flex flex-col gap-2">
                <NavLink to="/mgmt/email" className={navLinkClasses}>
                    <Mail className="mr-3 h-5 w-5" />
                    Email Sending
                </NavLink>
                <NavLink to="/mgmt/equipment-library" className={navLinkClasses}>
                    <HardDrive className="mr-3 h-5 w-5" />
                    Equipment Library
                </NavLink>
                <NavLink to="/mgmt/user-management" className={navLinkClasses}>
                    <Users className="mr-3 h-5 w-5" />
                    User Management
                </NavLink>
                <NavLink to="/mgmt/metrics" className={navLinkClasses}>
                    <BarChart2 className="mr-3 h-5 w-5" />
                    Metrics
                </NavLink>
            </nav>
        </div>
    );
};

export default AdminSidebar;
