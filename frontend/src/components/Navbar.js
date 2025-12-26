import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Home, Book, User, ShieldCheck, MessageSquare } from 'lucide-react';
import FeedbackModal from './FeedbackModal';
import { api } from '../api/api';
import toast from 'react-hot-toast';

/**
 * Navbar component for main application navigation.
 * Links are conditionally rendered based on user permissions (RBAC).
 */
const Navbar = () => {
    const { profile } = useAuth();
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [activityStatus, setActivityStatus] = useState('grey');

    useEffect(() => {
        const fetchActivityStatus = async () => {
            // Activity status polling is restricted to admins
            // UPDATED: Check for global_admin role
            if (profile?.roles?.includes('global_admin')) {
                try {
                    const response = await api.getOverallActivityStatus();
                    setActivityStatus(response.status);
                } catch (error) {
                    console.error("Failed to fetch activity status:", error);
                }
            }
        };

        fetchActivityStatus();
        const interval = setInterval(fetchActivityStatus, 60000);
        return () => clearInterval(interval);
    }, [profile]);

    const handleFeedbackSubmit = async (feedbackData) => {
        try {
            await api.submitFeedback(feedbackData);
            toast.success('Feedback submitted successfully!');
        } catch (error) {
            toast.error('Failed to submit feedback.');
        }
    };

    // Feature check helpers
    const canShowFeedbackButton = profile?.permitted_features?.includes('global_feedback_button');
    const canAccessRoster = profile?.permitted_features?.includes('crew');

    const statusColorClass = {
        green: 'text-green-500',
        yellow: 'text-yellow-500',
        grey: 'text-gray-500'
    }[activityStatus];

    return (
        <>
            <nav className="bg-gray-800 text-white shadow-md">
                <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <NavLink to="/" className="text-xl font-bold text-amber-400">
                                    ShowReady BETA
                                </NavLink>
                            </div>
                        </div>
                        <div className="hidden md:block">
                            <div className="ml-10 flex items-baseline space-x-4">
                                {canShowFeedbackButton && (
                                    <button
                                        onClick={() => setIsFeedbackModalOpen(true)}
                                        className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                    >
                                        <MessageSquare size={16} className="mr-2" />
                                        {profile?.feedback_button_text || 'Feedback'}
                                    </button>
                                )}
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

                                {canAccessRoster && (
                                    <NavLink
                                        to="/roster"
                                        className={({ isActive }) =>
                                            `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                                isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                            }`
                                        }
                                    >
                                        <User size={16} className="mr-2" />
                                        Roster
                                    </NavLink>
                                )}

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
                                
                                {/* UPDATED: Check for global_admin role string */}
                                {profile?.roles?.includes('global_admin') && (
                                    <NavLink
                                        to="/mgmt"
                                        className={({ isActive }) =>
                                            `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                                isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                            }`
                                        }
                                    >
                                        <ShieldCheck size={16} className={`mr-2 ${statusColorClass}`} />
                                        Admin
                                    </NavLink>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </nav>
            <FeedbackModal
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
                onSubmit={handleFeedbackSubmit}
            />
        </>
    );
};

export default Navbar;