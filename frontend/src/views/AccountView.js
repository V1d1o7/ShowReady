import React, { useState, useEffect, useContext } from 'react';
import { Save, Trash2, KeyRound } from 'lucide-react';
import { supabase, api } from '../api/api';
import Card from '../components/Card';
import InputField from '../components/InputField';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutContext } from '../contexts/LayoutContext';
import ConfirmationModal from '../components/ConfirmationModal';

const AccountView = () => {
    const navigate = useNavigate();
    const { profile, isLoading, refetchProfile, session } = useAuth();
    const { setShouldScroll } = useContext(LayoutContext);
    const user = session?.user;

    const [editableProfile, setEditableProfile] = useState(profile || {});
    const [newEmail, setNewEmail] = useState(user?.email || '');
    const [confirmationModal, setConfirmationModal] = useState({ isOpen: false, message: '', onConfirm: () => {} });

    // Effect to control page scrolling
    useEffect(() => {
        setShouldScroll(true);
        // Cleanup function to reset scroll behavior when the component unmounts
        return () => setShouldScroll(false);
    }, [setShouldScroll]);

    useEffect(() => {
        // When the profile from the context changes, update the local editable state
        setEditableProfile(profile || {});
        setNewEmail(user?.email || '');
    }, [profile, user?.email]);

    const handleProfileChange = (e) => {
        setEditableProfile(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleUpdateProfile = async () => {
        try {
            await api.updateProfile(editableProfile);
            await refetchProfile(); // Refetch to get the latest profile data into context
            alert("Profile updated successfully!");
        } catch (error) {
            alert(`Failed to update profile: ${error.message}`);
        }
    };

    const handleUpdateEmail = async () => {
        if (newEmail === user.email) {
            alert("Please enter a new email address.");
            return;
        }
        const { error } = await supabase.auth.updateUser({ email: newEmail });
        if (error) {
            alert(`Failed to update email: ${error.message}`);
        } else {
            alert("Please check your new email address to confirm the change.");
        }
    };

    const handleGoogleLogin = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: 'openid profile email'
            }
        });
    };

    const handleDeleteAccount = () => {
        setConfirmationModal({
            isOpen: true,
            message: "Are you absolutely sure you want to delete your account? This action cannot be undone and all your data will be permanently lost.",
            onConfirm: async () => {
                try {
                    await api.deleteAccount();
                    await supabase.auth.signOut();
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                } catch (error) {
                    alert(`Failed to delete account: ${error.message}`);
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                }
            }
        });
    };

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen"><div className="text-xl text-gray-400">Loading Profile...</div></div>;
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">
            <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">My Account</h1>
                </div>
            </header>
            <main className="space-y-8">
                <Card>
                    <h2 className="text-xl font-bold mb-4 text-white">Profile Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <InputField label="First Name" name="first_name" value={editableProfile?.first_name || ''} onChange={handleProfileChange} />
                        <InputField label="Last Name" name="last_name" value={editableProfile?.last_name || ''} onChange={handleProfileChange} />
                        <InputField label="Company Name (Optional)" name="company_name" value={editableProfile?.company_name || ''} onChange={handleProfileChange} />
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">Production Role</label>
                            <select name="production_role" value={editableProfile?.production_role || ''} onChange={handleProfileChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                                <option value="">Select a role...</option>
                                <option>Production Video</option>
                                <option>Production Audio</option>
                                <option>Production Electrician</option>
                                <option>Other</option>
                            </select>
                        </div>
                        {editableProfile?.production_role === 'Other' && (
                            <InputField label="Please specify your role" name="production_role_other" value={editableProfile?.production_role_other || ''} onChange={handleProfileChange} />
                        )}
                    </div>
                    <div className="mt-6 flex justify-end">
                        <button onClick={handleUpdateProfile} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors"><Save size={16} /> Save Profile</button>
                    </div>
                </Card>

                <Card>
                    <h2 className="text-xl font-bold mb-4 text-white">Account Settings</h2>
                    <div className="space-y-4">
                        <InputField label="Email Address" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                    </div>
                    <div className="mt-6 flex justify-end">
                        <button onClick={handleUpdateEmail} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors"><Save size={16} /> Update Email</button>
                    </div>
                </Card>
                <Card>
                    <h2 className="text-xl font-bold mb-4 text-white">Single Sign On</h2>
                    <div className="space-y-4">
                        <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 py-2 px-4 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-white bg-gray-700 hover:bg-gray-600">
                            <svg className="w-5 h-5" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 126 21.2 172.9 56.6l-63.1 61.9C333.3 102.4 293.2 88 248 88c-73.2 0-133.1 59.9-133.1 133.1s59.9 133.1 133.1 133.1c76.9 0 115.1-53.2 120.2-79.2H248v-65.1h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path></svg>
                            Link Google Account
                        </button>
                        <button onClick={() => navigate('/sso-setup')} className="w-full flex items-center justify-center gap-3 py-2 px-4 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-white bg-gray-700 hover:bg-gray-600">
                            <KeyRound size={16} /> Advanced SSO Setup
                        </button>
                    </div>
                </Card>
                <Card>
                    <h2 className="text-xl font-bold mb-4 text-red-500">Delete Account</h2>
                    <p className="text-gray-400 text-sm mb-4">
                        Once you delete your account, there is no going back. All your shows and data will be permanently lost. Please be certain.
                    </p>
                    <div className="mt-6 flex justify-end">
                        <button onClick={handleDeleteAccount} className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 rounded-lg font-bold text-white transition-colors">
                            <Trash2 size={16} /> Delete My Account
                        </button>
                    </div>
                </Card>
            </main>
            {confirmationModal.isOpen && (
                <ConfirmationModal
                    message={confirmationModal.message}
                    onConfirm={confirmationModal.onConfirm}
                    onCancel={() => setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} })}
                />
            )}
        </div>
    );
};

export default AccountView;
