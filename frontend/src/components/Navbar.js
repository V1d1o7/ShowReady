import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Home, Book, User, ShieldCheck } from 'lucide-react';

const Navbar = () => {
    const { profile } = useAuth();

    return (
        <nav className="bg-gray-800 text-white shadow-md">
            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <NavLink to="/" className="text-xl font-bold text-amber-400">
                                ShowReady
                            </NavLink>
                        </div>
                    </div>
                    <div className="hidden md:block">
                        <div className="ml-10 flex items-baseline space-x-4">
                            <NavLink
                                to="/"
                                end
                                className={({ isActive }) =>
                                    `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                        isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                    }`
                                }
                            >
                                <Home size={16} className="mr-2" />
                                Shows
                            </NavLink>
                            <NavLink
                                to="/library"
                                className={({ isActive }) =>
                                    `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                        isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                    }`
                                }
                            >
                                <Book size={16} className="mr-2" />
                                My Library
                            </NavLink>
                            <NavLink
                                to="/account"
                                className={({ isActive }) =>
                                    `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                        isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                    }`
                                }
                            >
                                <User size={16} className="mr-2" />
                                Account
                            </NavLink>
                            {profile?.roles?.includes('admin') && (
                                <NavLink
                                    to="/mgmt"
                                    className={({ isActive }) =>
                                        `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                        }`
                                    }
                                >
                                    <ShieldCheck size={16} className="mr-2" />
                                    Admin
                                </NavLink>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;