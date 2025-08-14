import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FileText, Box, Info, UploadCloud, Trash2, Edit, Plus, Save, ChevronsUpDown,
    LayoutDashboard, ArrowLeft, X, Download, Eye, Grid3x3, List, LogOut,
    User as UserIcon, KeyRound, Globe, Server
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// --- Supabase Client Setup ---
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase URL or Anon Key is missing. Please check your .env file.");
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- API Helper Functions ---
const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
};

const handleResponse = async (res) => {
    if (!res.ok) {
        const errorText = await res.text();
        try {
            const errorJson = JSON.parse(errorText);
            throw new Error(errorJson.detail || 'An unknown error occurred');
        } catch {
            throw new Error(errorText || res.statusText);
        }
    }
    if (res.headers.get('Content-Type')?.includes('application/json')) {
        return res.json();
    }
    if (res.headers.get('Content-Type')?.includes('application/pdf')) {
        return res.blob();
    }
    return res;
};

const api = {
    getShows: async () => fetch('/api/shows', { headers: await getAuthHeader() }).then(handleResponse),
    getShow: async (showName) => fetch(`/api/shows/${showName}`, { headers: await getAuthHeader() }).then(handleResponse),
    saveShow: async (showName, data) => fetch(`/api/shows/${showName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(data),
    }).then(handleResponse),
    deleteShow: async (showName) => fetch(`/api/shows/${showName}`, { method: 'DELETE', headers: await getAuthHeader() }).then(res => { if (!res.ok) throw new Error("Delete failed") }),
    uploadLogo: async (formData) => fetch('/api/upload/logo', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: formData,
    }).then(handleResponse),
    generatePdf: async (type, body) => fetch(`/api/pdf/${type}-labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(body),
    }).then(handleResponse),
    getProfile: async () => fetch('/api/profile', { headers: await getAuthHeader() }).then(handleResponse),
    updateProfile: async (profileData) => fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(profileData),
    }).then(handleResponse),
    getSsoConfig: async () => fetch('/api/sso_config', { headers: await getAuthHeader() }).then(handleResponse),
    updateSsoConfig: async (ssoData) => fetch('/api/sso_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(ssoData),
    }).then(handleResponse),
    deleteAccount: async () => fetch('/api/profile', { method: 'DELETE', headers: await getAuthHeader() }),
    // Rack Builder API endpoints
    createRack: async (rackData) => fetch('/api/racks', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(rackData) }).then(handleResponse),
    getRacksForShow: async (showName) => fetch(`/api/racks?show_name=${showName}`, { headers: await getAuthHeader() }).then(handleResponse),
    getRackDetails: async (rackId) => fetch(`/api/racks/${rackId}`, { headers: await getAuthHeader() }).then(handleResponse),
    addEquipmentToRack: async (rackId, equipmentData) => fetch(`/api/racks/${rackId}/equipment`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(equipmentData) }).then(handleResponse),
    getEquipmentTemplates: async () => fetch('/api/equipment', { headers: await getAuthHeader() }).then(handleResponse),
    moveEquipmentInRack: async (instanceId, newPosition) => fetch(`/api/racks/equipment/${instanceId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({ ru_position: newPosition }) }).then(handleResponse),
    deleteEquipmentFromRack: async (instanceId) => fetch(`/api/racks/equipment/${instanceId}`, { method: 'DELETE', headers: await getAuthHeader() }),
};

// --- Main Application Component ---
export default function App() {
    const [session, setSession] = useState(null);
    const [shows, setShows] = useState([]);
    const [activeShowName, setActiveShowName] = useState('');
    const [activeShowData, setActiveShowData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isNewShowModalOpen, setIsNewShowModalOpen] = useState(false);
    const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'show', 'account', 'sso_setup'

    useEffect(() => {
        const fetchSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);
            setIsLoading(false);
        };
        fetchSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    const loadShows = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const showData = await api.getShows();
            setShows(showData.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (error) {
            console.error("Failed to fetch shows:", error);
        } finally {
            setIsLoading(false);
        }
    }, [session]);

    useEffect(() => {
        loadShows();
    }, [loadShows]);

    const fetchShowData = useCallback(async (showName) => {
        if (!showName) {
            setActiveShowData(null);
            return;
        }
        setIsLoading(true);
        try {
            const data = await api.getShow(showName);
            setActiveShowData(data);
            setCurrentView('show');
        } catch (error) {
            console.error(`Failed to fetch data for ${showName}:`, error);
            setActiveShowName('');
            setCurrentView('dashboard');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleNavigate = (view) => {
        if (view === 'dashboard') {
            setActiveShowName('');
            setActiveShowData(null);
        }
        setCurrentView(view);
    }

    useEffect(() => {
        if (activeShowName) {
            fetchShowData(activeShowName);
        } else {
            setActiveShowData(null);
            setCurrentView(currentView === 'show' ? 'dashboard' : currentView);
        }
    }, [activeShowName, fetchShowData, currentView]);

    const handleSaveShowData = async (updatedData) => {
        if (!activeShowName) return;
        try {
            await api.saveShow(activeShowName, updatedData);
            setActiveShowData(updatedData);
        } catch (error) {
            console.error("Failed to save show data:", error);
        }
    };

    const handleCreateShow = async (newShowName) => {
        if (!newShowName || shows.some(s => s.name === newShowName)) {
            alert("Show name cannot be empty or a duplicate.");
            return;
        }
        setIsLoading(true);
        try {
            const newShowData = { info: { show_name: newShowName }, loom_sheets: {}, case_sheets: {} };
            await api.saveShow(newShowName, newShowData);
            setShows(prev => [...prev, { name: newShowName, logo_path: null }].sort((a, b) => a.name.localeCompare(b.name)));
            setActiveShowName(newShowName);
        } catch (error) {
            console.error("Failed to create new show:", error);
            alert(`Failed to create new show: ${error.message}`);
        }
        setIsNewShowModalOpen(false);
        setIsLoading(false);
    };

    const handleDeleteShow = async (showNameToDelete) => {
        if (!window.confirm(`Are you sure you want to delete "${showNameToDelete}"? This cannot be undone.`)) return;
        setIsLoading(true);
        try {
            await api.deleteShow(showNameToDelete);
            setShows(prev => prev.filter(s => s.name !== showNameToDelete));
            if (activeShowName === showNameToDelete) {
                setActiveShowName('');
            }
        } catch (error) {
            console.error("Failed to delete show:", error);
            alert("Failed to delete show.");
        }
        setIsLoading(false);
    };

    if (isLoading && !session) {
        return <div className="flex items-center justify-center h-screen bg-gray-900"><div className="text-xl text-gray-400">Loading...</div></div>;
    }

    if (!session) {
        return <Auth supabaseClient={supabase} />;
    }

    let viewComponent;
    switch (currentView) {
        case 'show':
            viewComponent = <ShowView showName={activeShowName} showData={activeShowData} onSave={handleSaveShowData} onBack={() => handleNavigate('dashboard')} isLoading={isLoading} />;
            break;
        case 'account':
            viewComponent = <AccountView onBack={() => handleNavigate('dashboard')} user={session.user} onNavigate={handleNavigate} />;
            break;
        case 'sso_setup':
            viewComponent = <AdvancedSSOView onBack={() => handleNavigate('account')} />;
            break;
        default:
            viewComponent = <DashboardView shows={shows} onSelectShow={setActiveShowName} onNewShow={() => setIsNewShowModalOpen(true)} onDeleteShow={handleDeleteShow} isLoading={isLoading} user={session.user} onNavigate={handleNavigate} />;
    }

    return (
        <div className="bg-gray-900 text-gray-300 font-sans min-h-screen">
            {viewComponent}
            <NewShowModal
                isOpen={isNewShowModalOpen}
                onClose={() => setIsNewShowModalOpen(false)}
                onSubmit={handleCreateShow}
            />
        </div>
    );
}

// --- Auth Component ---
function Auth({ supabaseClient }) {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [productionRole, setProductionRole] = useState('');
    const [otherRole, setOtherRole] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [authError, setAuthError] = useState(null);

    const handleAuthAction = async (event) => {
        event.preventDefault();
        setLoading(true);
        setAuthError(null);

        let response;
        if (isSignUp) {
            const metaData = {
                first_name: firstName,
                last_name: lastName,
                company_name: companyName,
                production_role: productionRole,
                production_role_other: productionRole === 'Other' ? otherRole : '',
            };
            response = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: metaData
                }
            });
        } else {
            response = await supabaseClient.auth.signInWithPassword({ email, password });
        }

        if (response.error) {
            setAuthError(response.error.message);
        } else if (isSignUp) {
            alert('Account created! Please check your email to confirm your registration.');
        }

        setLoading(false);
    };

    const handleGoogleLogin = async () => {
        await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: 'openid profile email'
            }
        });
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center py-12">
            <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 rounded-xl shadow-lg">
                <div>
                    <h2 className="text-center text-3xl font-extrabold text-white">
                        {isSignUp ? 'Create an Account' : 'Sign in to ShowReady'}
                    </h2>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleAuthAction}>
                    {isSignUp && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <InputField label="First Name" name="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                                <InputField label="Last Name" name="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                            </div>
                            <InputField label="Company Name (Optional)" name="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Production Role</label>
                                <select value={productionRole} onChange={(e) => setProductionRole(e.target.value)} required className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                                    <option value="">Select a role...</option>
                                    <option>Production Video</option>
                                    <option>Production Audio</option>
                                    <option>Production Electrician</option>
                                    <option>Other</option>
                                </select>
                            </div>
                            {productionRole === 'Other' && (
                                <InputField label="Please specify your role" name="otherRole" value={otherRole} onChange={(e) => setOtherRole(e.target.value)} required />
                            )}
                        </>
                    )}
                    <InputField id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" label="Email Address" />
                    <InputField id="password" name="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" label="Password" />

                    {authError && <p className="text-sm text-red-400">{authError}</p>}

                    <div>
                        <button type="submit" disabled={loading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-black bg-amber-500 hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50">
                            {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
                        </button>
                    </div>
                </form>
                <div className="relative">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700" /></div>
                    <div className="relative flex justify-center text-sm"><span className="px-2 bg-gray-800 text-gray-500">Or continue with</span></div>
                </div>
                <div>
                    <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 py-2 px-4 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white">
                        <svg className="w-5 h-5" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 126 21.2 172.9 56.6l-63.1 61.9C333.3 102.4 293.2 88 248 88c-73.2 0-133.1 59.9-133.1 133.1s59.9 133.1 133.1 133.1c76.9 0 115.1-53.2 120.2-79.2H248v-65.1h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path></svg>
                        Google
                    </button>
                </div>
                <div className="text-center text-sm">
                    <button onClick={() => { setIsSignUp(!isSignUp); setAuthError(null); }} className="font-medium text-amber-400 hover:text-amber-300">
                        {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                    </button>
                </div>
            </div>
        </div>
    );
}


// --- Dashboard View Component ---
const DashboardView = ({ shows, onSelectShow, onNewShow, onDeleteShow, isLoading, user, onNavigate }) => {
    const [profile, setProfile] = useState(null);
    const [profileLoading, setProfileLoading] = useState(true);

    useEffect(() => {
        const fetchProfile = async () => {
            setProfileLoading(true);
            try {
                const data = await api.getProfile();
                setProfile(data);
            } catch (error) {
                console.error("Failed to fetch profile for dashboard:", error);
            } finally {
                setProfileLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    const displayName = useMemo(() => {
        if (profileLoading) return 'Loading...';
        if (profile && profile.first_name) return `${profile.first_name} ${profile.last_name || ''}`.trim();
        return user.email;
    }, [profile, user.email, profileLoading]);

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <header className="flex items-center justify-between pb-8 border-b border-gray-700">
                <div className="flex items-center gap-3">
                    <img src={process.env.PUBLIC_URL + '/logo.png'} alt="ShowReady Logo" className="h-10 w-10" />
                    <h1 className="text-3xl font-bold text-white">ShowReady</h1>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => onNavigate('account')} className="text-sm text-gray-400 hidden sm:block hover:text-white">{displayName}</button>
                    <button onClick={handleSignOut} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors">
                        <LogOut size={18} />
                    </button>
                    <button onClick={onNewShow} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors">
                        <Plus size={18} /> New Show
                    </button>
                </div>
            </header>
            <main className="mt-8">
                {isLoading ? (
                    <div className="text-center py-16 text-gray-500">Loading shows...</div>
                ) : shows.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {shows.map(show => (
                            <ShowCard key={show.name} show={show} onSelect={() => onSelectShow(show.name)} onDelete={() => onDeleteShow(show.name)} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16 text-gray-500">
                        <p>No shows found.</p>
                        <p className="mt-2">Click "New Show" to get started.</p>
                    </div>
                )}
            </main>
        </div>
    );
};

// --- Account View Component ---
const AccountView = ({ onBack, user, onNavigate }) => {
    const [profile, setProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [newEmail, setNewEmail] = useState('');

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const data = await api.getProfile();
                setProfile(data);
                setNewEmail(user.email);
            } catch (error) {
                console.error("Failed to fetch profile:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfile();
    }, [user.email]);

    const handleProfileChange = (e) => {
        setProfile(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleUpdateProfile = async () => {
        try {
            await api.updateProfile(profile);
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

    const handleDeleteAccount = async () => {
        if (window.confirm("Are you absolutely sure you want to delete your account? This action cannot be undone and all your data will be permanently lost.")) {
            try {
                await api.deleteAccount();
                await supabase.auth.signOut();
                // The onAuthStateChange listener will handle the rest
            } catch (error) {
                alert(`Failed to delete account: ${error.message}`);
            }
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen"><div className="text-xl text-gray-400">Loading Profile...</div></div>;
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
            <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-700 transition-colors"><ArrowLeft size={20} /></button>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">My Account</h1>
                </div>
            </header>
            <main className="space-y-8">
                <Card>
                    <h2 className="text-xl font-bold mb-4 text-white">Profile Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <InputField label="First Name" name="first_name" value={profile?.first_name || ''} onChange={handleProfileChange} />
                        <InputField label="Last Name" name="last_name" value={profile?.last_name || ''} onChange={handleProfileChange} />
                        <InputField label="Company Name (Optional)" name="company_name" value={profile?.company_name || ''} onChange={handleProfileChange} />
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">Production Role</label>
                            <select name="production_role" value={profile?.production_role || ''} onChange={handleProfileChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                                <option value="">Select a role...</option>
                                <option>Production Video</option>
                                <option>Production Audio</option>
                                <option>Production Electrician</option>
                                <option>Other</option>
                            </select>
                        </div>
                        {profile?.production_role === 'Other' && (
                            <InputField label="Please specify your role" name="production_role_other" value={profile?.production_role_other || ''} onChange={handleProfileChange} />
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
                        <button onClick={() => onNavigate('sso_setup')} className="w-full flex items-center justify-center gap-3 py-2 px-4 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-white bg-gray-700 hover:bg-gray-600">
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
        </div>
    );
};

// --- Advanced SSO View Component ---
const AdvancedSSOView = ({ onBack }) => {
    const [ssoConfig, setSsoConfig] = useState({ provider: 'authentik', config: { url: '', client_id: '', client_secret: '' } });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchSsoConfig = async () => {
            try {
                const data = await api.getSsoConfig();
                if (data && data.config) {
                    setSsoConfig(data);
                }
            } catch (error) {
                console.error("Failed to fetch SSO config:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSsoConfig();
    }, []);

    const handleConfigChange = (e) => {
        setSsoConfig(prev => ({
            ...prev,
            config: { ...prev.config, [e.target.name]: e.target.value }
        }));
    };

    const handleSaveChanges = async () => {
        try {
            await api.updateSsoConfig(ssoConfig);
            alert("SSO Configuration Saved!");
        } catch (error) {
            alert(`Failed to save SSO config: ${error.message}`);
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen"><div className="text-xl text-gray-400">Loading SSO Config...</div></div>;
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
            <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-700 transition-colors"><ArrowLeft size={20} /></button>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">Advanced SSO Setup</h1>
                </div>
            </header>
            <main>
                <Card>
                    <h3 className="text-lg font-bold mb-4 text-white">Authentik Configuration</h3>
                    <div className="space-y-4">
                        <InputField label="Authentik Server URL" name="url" value={ssoConfig.config.url || ''} onChange={handleConfigChange} placeholder="https://authentik.yourcompany.com" />
                        <InputField label="Client ID" name="client_id" value={ssoConfig.config.client_id || ''} onChange={handleConfigChange} />
                        <InputField label="Client Secret" name="client_secret" type="password" value={ssoConfig.config.client_secret || ''} onChange={handleConfigChange} />
                    </div>
                    <div className="mt-6 flex justify-end">
                        <button onClick={handleSaveChanges} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors"><Save size={16} /> Save Configuration</button>
                    </div>
                </Card>
            </main>
        </div>
    );
};


// --- Show Card Component for Dashboard ---
const ShowCard = ({ show, onSelect, onDelete }) => {
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

    return (
        <div onClick={onSelect} className="group relative bg-gray-800/50 hover:bg-gray-800/80 rounded-xl p-6 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 overflow-hidden">
            <div className="absolute top-3 right-3 z-10">
                <button onClick={handleDeleteClick} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity">
                    <Trash2 size={16} />
                </button>
            </div>
            <div className="flex flex-col items-center justify-center h-32">
                {logoUrl && !logoError ? (
                    <img
                        src={logoUrl}
                        alt={`${show.name} logo`}
                        className="w-full h-full object-contain"
                        onError={() => setLogoError(true)}
                    />
                ) : (
                    <h2 className="text-lg font-bold text-center text-white">{show.name}</h2>
                )}
            </div>
        </div>
    );
};


// --- Show View Component ---
const ShowView = ({ showName, showData, onSave, onBack, isLoading }) => {
    const [activeTab, setActiveTab] = useState('info');

    const tabs = [
        { id: 'info', label: 'Show Info', icon: Info },
        { id: 'loom', label: 'Loom Labels', icon: FileText },
        { id: 'case', label: 'Case Labels', icon: Box },
        { id: 'rack', label: 'Rack Builder', icon: Server },
    ];

    if (isLoading || !showData) {
        return <div className="flex items-center justify-center h-screen"><div className="text-xl text-gray-400">Loading Show...</div></div>;
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-700 transition-colors"><ArrowLeft size={20} /></button>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">{showName}</h1>
                </div>
            </header>
            <div className="flex border-b border-gray-700 mb-6">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-3 text-sm font-bold transition-colors ${activeTab === tab.id ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-400 hover:text-white'}`}>
                        <tab.icon size={16} /> {tab.label}
                    </button>
                ))}
            </div>
            <main>
                {activeTab === 'info' && <ShowInfoView showData={showData} onSave={onSave} />}
                {activeTab === 'loom' && <LoomLabelView showData={showData} onSave={onSave} />}
                {activeTab === 'case' && <CaseLabelView showData={showData} onSave={onSave} />}
                {activeTab === 'rack' && <RackBuilderView showName={showName} />}
            </main>
        </div>
    );
};

// --- Rack Builder View Component ---
const RackBuilderView = ({ showName }) => {
    const [racks, setRacks] = useState([]);
    const [activeRack, setActiveRack] = useState(null);
    const [equipmentTemplates, setEquipmentTemplates] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isNewRackModalOpen, setIsNewRackModalOpen] = useState(false);

    useEffect(() => {
        const loadInitialData = async () => {
            setIsLoading(true);
            try {
                const [racksData, templates] = await Promise.all([
                    api.getRacksForShow(showName),
                    api.getEquipmentTemplates()
                ]);

                setRacks(racksData);
                setEquipmentTemplates(templates);

                if (racksData.length > 0) {
                    const detailedRack = await api.getRackDetails(racksData[0].id);
                    setActiveRack(detailedRack);
                }
            } catch (error) {
                console.error("Failed to load initial data:", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadInitialData();
    }, [showName]);

    const handleSelectRack = async (rack) => {
        setIsLoading(true);
        try {
            const detailedRack = await api.getRackDetails(rack.id);
            setActiveRack(detailedRack);
        } catch (error) {
            console.error("Failed to fetch rack details:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateRack = async ({ rackName, ruHeight }) => {
        try {
            const newRack = await api.createRack({ rack_name: rackName, ru_height: parseInt(ruHeight, 10), show_name: showName });
            setRacks(prev => [...prev, newRack]);
            setActiveRack(newRack); // Automatically select the new rack
        } catch (error) {
            console.error("Failed to create rack:", error);
        }
        setIsNewRackModalOpen(false);
    };

    const handleAddEquipment = async (item, ru_position) => {
        if (!activeRack) return;
        const newInstanceData = {
            template_id: item.id,
            ru_position: ru_position,
            instance_name: `${item.model_number}-${(activeRack.equipment || []).length + 1}`
        };
        try {
            const addedEquipment = await api.addEquipmentToRack(activeRack.id, newInstanceData);
            const template = equipmentTemplates.find(t => t.id === addedEquipment.template_id);
            const completeEquipment = { ...addedEquipment, equipment_templates: template };
            setActiveRack(prev => ({ ...prev, equipment: [...(prev.equipment || []), completeEquipment] }));
        } catch (error) { console.error("Failed to add equipment:", error); }
    };

    const handleMoveEquipment = async (item, new_ru_position) => {
        if (!activeRack) return;
        try {
            await api.moveEquipmentInRack(item.id, new_ru_position);
            setActiveRack(prev => ({
                ...prev,
                equipment: prev.equipment.map(eq => eq.id === item.id ? { ...eq, ru_position: new_ru_position } : eq)
            }));
        } catch (error) { console.error("Failed to move equipment:", error); }
    };

    const handleDeleteEquipment = async (instanceId) => {
        if (!activeRack || !window.confirm("Are you sure you want to remove this equipment?")) return;
        try {
            await api.deleteEquipmentFromRack(instanceId);
            setActiveRack(prev => ({
                ...prev,
                equipment: prev.equipment.filter(eq => eq.id !== instanceId)
            }));
        } catch (error) { console.error("Failed to delete equipment:", error); }
    };

    const handleDrop = (data, ru_position) => {
        if (data.isNew) {
            handleAddEquipment(data.item, ru_position);
        } else {
            handleMoveEquipment(data.item, ru_position);
        }
    };

    return (
        <>
            <div className="grid grid-cols-12 gap-6 h-[calc(100vh-220px)]">
                {/* Left Panel: Rack List */}
                <div className="col-span-2 bg-gray-800/50 p-4 rounded-xl flex flex-col">
                    <h2 className="text-lg font-bold text-white mb-4">Racks</h2>
                    <div className="flex-grow overflow-y-auto">
                        {isLoading && racks.length === 0 ? <p>Loading...</p> : (
                            <ul>
                                {racks.map(rack =>
                                    <li key={rack.id}
                                        onClick={() => handleSelectRack(rack)}
                                        className={`p-2 rounded-md cursor-pointer ${activeRack?.id === rack.id ? 'bg-amber-500 text-black' : 'hover:bg-gray-700'}`}>
                                        {rack.rack_name}
                                    </li>
                                )}
                            </ul>
                        )}
                    </div>
                    <button onClick={() => setIsNewRackModalOpen(true)} className="w-full mt-4 flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors">
                        <Plus size={16} /> New Rack
                    </button>
                </div>

                {/* Center Panel: Rack Display */}
                <div className="col-span-7 bg-gray-800/50 p-4 rounded-xl overflow-y-auto">
                    {isLoading && !activeRack ? <p className="text-gray-500 text-center mt-10">Loading...</p> : activeRack ? (
                        <RackComponent rack={activeRack} onDrop={handleDrop} onDelete={handleDeleteEquipment} />
                    ) : (
                        <p className="text-gray-500 text-center mt-10">Select or create a rack to begin.</p>
                    )}
                </div>

                {/* Right Panel: Equipment Library */}
                <div className="col-span-3 bg-gray-800/50 p-4 rounded-xl flex flex-col">
                    <h2 className="text-lg font-bold text-white mb-4">Equipment Library</h2>
                    <div className="flex-grow overflow-y-auto">
                        {equipmentTemplates.map(item => <EquipmentLibraryItem key={item.id} item={item} />)}
                    </div>
                </div>
            </div>
            <NewRackModal isOpen={isNewRackModalOpen} onClose={() => setIsNewRackModalOpen(false)} onSubmit={handleCreateRack} />
        </>
    );
};

const RackComponent = ({ rack, onDrop, onDelete }) => {
    const [dragOverRU, setDragOverRU] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);

    // Creates a map of which RUs are occupied for quick lookup.
    const filledRUs = useMemo(() => {
        const map = new Map();
        (rack.equipment || []).forEach(item => {
            const height = (item.equipment_templates?.ru_height) || 1;
            for (let i = 0; i < height; i++) {
                map.set(item.ru_position + i, item.id);
            }
        });
        return map;
    }, [rack.equipment]);

    // Checks if a range of RUs is occupied, excluding the item being moved.
    const isOccupied = (start, end, excludeId) => {
        for (let i = start; i <= end; i++) {
            const occupiedBy = filledRUs.get(i);
            if (occupiedBy && occupiedBy !== excludeId) {
                return true;
            }
        }
        return false;
    };

    const handleDragStart = (e, item, isNew) => {
        const data = { isNew, item };
        e.dataTransfer.setData('application/json', JSON.stringify(data));
        setDraggedItem(data);
    };

    // As the mouse moves over a drop zone, update the RU it's currently over.
    const handleDragOver = (e, ru) => {
        e.preventDefault();
        if (draggedItem) {
            setDragOverRU(ru);
        }
    };

    const handleDrop = (e, ru) => {
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        const item = data.item;
        const itemHeight = item.ru_height || (item.equipment_templates?.ru_height) || 1;

        // The `ru` is the TOP of the drop zone. The item's position is its BOTTOM RU.
        const dropPosition = ru - itemHeight + 1;

        if (dropPosition < 1 || isOccupied(dropPosition, ru, data.isNew ? null : item.id)) {
            console.error("Drop failed: Invalid position or slot is occupied.");
        } else {
            onDrop(data, dropPosition);
        }
        setDragOverRU(null);
        setDraggedItem(null);
    };

    const getHighlightStyle = () => {
        if (!dragOverRU || !draggedItem) return { display: 'none' };

        const item = draggedItem.item;
        const itemHeight = item.ru_height || (item.equipment_templates?.ru_height) || 1;
        const dropPosition = dragOverRU - itemHeight + 1;

        if (dropPosition < 1) return { display: 'none' };

        const isInvalid = isOccupied(dropPosition, dragOverRU, draggedItem.isNew ? null : item.id);

        return {
            display: 'block',
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: `${(dropPosition - 1) * 1.5}rem`,
            height: `${itemHeight * 1.5}rem`,
            backgroundColor: isInvalid ? 'rgba(239, 68, 68, 0.5)' : 'rgba(59, 130, 246, 0.5)',
            border: `1px dashed ${isInvalid ? '#EF4444' : '#3B82F6'}`,
            zIndex: 10,
        };
    };

    return (
        <div className="w-full bg-gray-900/50 p-4 rounded-lg flex gap-4">
            {/* Left-side RU numbers */}
            <div className="flex flex-col-reverse justify-end">
                {Array.from({ length: rack.ru_height }, (_, i) => <div key={i} className="h-6 text-xs text-gray-500 text-right pr-2 select-none">{i + 1}</div>)}
            </div>

            <div
                className="flex-grow border-2 border-gray-600 rounded-md relative"
                onDragLeave={() => setDragOverRU(null)}
            >
                {/* Render drop zones from top to bottom visually */}
                {Array.from({ length: rack.ru_height }, (_, i) => {
                    // Translate visual index (0 at top) to RU number (42 at top)
                    const ru = rack.ru_height - i;
                    return (
                        <div
                            key={i}
                            className="h-6 border-b border-gray-700/50"
                            onDragOver={(e) => handleDragOver(e, ru)}
                            onDrop={(e) => handleDrop(e, ru)}
                        />
                    );
                })}

                {/* Container for absolutely positioned items, doesn't interfere with drop events */}
                <div className="absolute inset-0 pointer-events-none">
                    {/* Items are positioned from the bottom up inside this container */}
                    {(rack.equipment || []).map(item => (
                        <div key={item.id} className="pointer-events-auto">
                            <PlacedEquipmentItem item={item} onDragStart={(e) => handleDragStart(e, item, false)} onDelete={() => onDelete(item.id)} />
                        </div>
                    ))}
                    <div style={getHighlightStyle()} />
                </div>
            </div>

            {/* Right-side RU numbers */}
            <div className="flex flex-col-reverse justify-end">
                {Array.from({ length: rack.ru_height }, (_, i) => <div key={i} className="h-6 text-xs text-gray-500 text-left pl-2 select-none">{i + 1}</div>)}
            </div>
        </div>
    );
};

const PlacedEquipmentItem = ({ item, onDragStart, onDelete }) => {
    // This function now correctly calculates the visual position from the bottom up.
    // An item at ru_position 1 will have a "bottom" style of 0.
    const bottomPosition = (item.ru_position - 1) * 1.5;
    const itemHeight = ((item.equipment_templates && item.equipment_templates.ru_height) || 1) * 1.5;

    return (
        <div draggable onDragStart={onDragStart}
            className="absolute w-full bg-blue-500/30 border border-blue-400 rounded-sm text-white text-xs flex items-center justify-between p-1 cursor-move group"
            style={{ height: `${itemHeight}rem`, bottom: `${bottomPosition}rem`, zIndex: 20 }}>
            <span className="truncate pl-2">{item.instance_name}</span>
            <button onClick={onDelete} className="pr-2 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 size={14} />
            </button>
        </div>
    );
};

const EquipmentLibraryItem = ({ item }) => {
    const handleDragStart = (e) => {
        const data = { isNew: true, item: item };
        e.dataTransfer.setData('application/json', JSON.stringify(data));
    };

    return (
        <div draggable onDragStart={handleDragStart} className="p-2 mb-2 bg-gray-700 rounded-md cursor-grab active:cursor-grabbing">
            <p className="font-bold text-sm truncate">{item.model_number}</p>
            <p className="text-xs text-gray-400">{item.manufacturer} - {item.ru_height}RU</p>
        </div>
    );
};

const ShowInfoView = ({ showData, onSave }) => {
    const [formData, setFormData] = useState(showData.info);
    const [isUploading, setIsUploading] = useState(false);
    const [logoUrl, setLogoUrl] = useState(null);
    const [logoError, setLogoError] = useState(false);

    useEffect(() => {
        setFormData(showData.info);
        if (showData.info.logo_path) {
            setLogoError(false);
            // Create a signed URL to display the private image
            supabase.storage.from('logos').createSignedUrl(showData.info.logo_path, 3600) // 1 hour expiration
                .then(({ data, error }) => {
                    if (error) {
                        console.error("Error creating signed URL:", error);
                        setLogoError(true);
                    } else {
                        setLogoUrl(data.signedUrl);
                    }
                });
        } else {
            setLogoUrl(null);
        }
    }, [showData]);

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleLogoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const uploadFormData = new FormData();
        uploadFormData.append('file', file);
        setIsUploading(true);
        setLogoError(false);
        try {
            const result = await api.uploadLogo(uploadFormData);
            if (result.logo_path) {
                const updatedInfo = { ...formData, logo_path: result.logo_path };
                setFormData(updatedInfo);
                onSave({ ...showData, info: updatedInfo });
            }
        } catch (error) {
            console.error("Logo upload failed:", error);
            setLogoError(true);
        }
        setIsUploading(false);
    };

    const handleSave = () => onSave({ ...showData, info: formData });

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <Card className="lg:col-span-3 space-y-6">
                    <InputField label="Show Name" name="show_name" value={formData.show_name || ''} onChange={handleChange} />
                    <InputField label="Production Manager" name="production_manager" value={formData.production_manager || ''} onChange={handleChange} />
                    <InputField label="PM Email" name="pm_email" type="email" value={formData.pm_email || ''} onChange={handleChange} />
                    <InputField label="Production Video" name="production_video" value={formData.production_video || ''} onChange={handleChange} />
                </Card>
                <Card className="lg:col-span-2 space-y-4">
                    <label className="block text-sm font-medium text-gray-300">Show Logo</label>
                    <div className="w-full aspect-video bg-gray-900/50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-700 overflow-hidden">
                        {logoUrl && !logoError ? (
                            <img
                                src={logoUrl}
                                alt="Show Logo"
                                className="w-full h-full object-contain"
                                onError={() => setLogoError(true)}
                            />
                        ) : (
                            <p className="text-gray-500 text-sm px-4 text-center">
                                {logoError ? `Failed to load logo` : 'No logo uploaded'}
                            </p>
                        )}
                    </div>
                    <input type="file" id="logo-upload" className="hidden" onChange={handleLogoUpload} accept="image/*" />
                    <button onClick={() => document.getElementById('logo-upload').click()} disabled={isUploading} className="w-full flex justify-center items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 disabled:bg-gray-600 transition-colors">
                        <UploadCloud size={16} /> {isUploading ? 'Uploading...' : 'Upload Logo'}
                    </button>
                </Card>
            </div>
            <div className="mt-8 flex justify-end">
                <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors"><Save size={16} /> Save Changes</button>
            </div>
        </div>
    );
}

const InputField = ({ label, ...props }) => (
    <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
        <input {...props} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500" />
    </div>
);

function LabelManagerView({ sheetType, showData, onSave, labelFields, pdfType }) {
    const [activeSheetName, setActiveSheetName] = useState('');
    const [isNewSheetModalOpen, setIsNewSheetModalOpen] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [isAdvancedPrintModalOpen, setIsAdvancedPrintModalOpen] = useState(false);
    const [editingIndex, setEditingIndex] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    const sheets = useMemo(() => showData[sheetType] || {}, [showData, sheetType]);
    const sheetNames = useMemo(() => Object.keys(sheets), [sheets]);
    const labels = useMemo(() => (activeSheetName ? sheets[activeSheetName] || [] : []), [activeSheetName, sheets]);
    const numSlots = useMemo(() => (pdfType === 'case' ? 2 : 24), [pdfType]);

    useEffect(() => {
        if (sheetNames.length > 0 && !sheetNames.includes(activeSheetName)) {
            setActiveSheetName(sheetNames[0]);
        } else if (sheetNames.length === 0) {
            setActiveSheetName('');
        }
    }, [sheetNames, activeSheetName]);

    const handleCreateSheet = (newSheetName) => {
        if (!newSheetName || sheetNames.includes(newSheetName)) {
            alert("Sheet name cannot be empty or a duplicate.");
            return;
        }
        const updatedShowData = {
            ...showData,
            [sheetType]: { ...sheets, [newSheetName]: [] }
        };
        onSave(updatedShowData);
        setActiveSheetName(newSheetName);
        setIsNewSheetModalOpen(false);
    };

    const handleUpdateLabels = (newLabels) => {
        const updatedShowData = { ...showData, [sheetType]: { ...sheets, [activeSheetName]: newLabels } };
        onSave(updatedShowData);
    };

    const handleAddNewLabel = () => {
        const newLabel = labelFields.reduce((acc, f) => ({ ...acc, [f.name]: '' }), {});
        const newLabels = [...labels, newLabel];
        handleUpdateLabels(newLabels);
        setEditingIndex(newLabels.length - 1);
        setEditFormData(newLabel);
    };

    const handleEditClick = (label, index) => {
        setEditingIndex(index);
        setEditFormData(label);
    };

    const handleCancelEdit = () => {
        if (labels[editingIndex] && Object.values(labels[editingIndex]).every(val => val === '')) {
            const newLabels = labels.filter((_, i) => i !== editingIndex);
            handleUpdateLabels(newLabels);
        }
        setEditingIndex(null);
    };

    const handleSaveEdit = (index) => {
        const newLabels = [...labels];
        newLabels[index] = editFormData;
        handleUpdateLabels(newLabels);
        setEditingIndex(null);
    };

    const handleDeleteLabel = (indexToDelete) => {
        if (!window.confirm("Are you sure you want to delete this label?")) return;
        const newLabels = labels.filter((_, i) => i !== indexToDelete);
        handleUpdateLabels(newLabels);
    };

    const handleGeneratePdf = async (placement = null) => {
        const body = { labels };
        if (pdfType === 'case') body.logo_path = showData.info.logo_path;
        if (placement) body.placement = placement;

        try {
            const blob = await api.generatePdf(pdfType, body);
            const url = URL.createObjectURL(blob);
            setPdfPreviewUrl(url);
        } catch (e) { console.error("PDF generation failed", e); }
    };

    return (
        <>
            <Card>
                <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <select value={activeSheetName} onChange={(e) => setActiveSheetName(e.target.value)} className="appearance-none p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                                <option value="" disabled>{sheetNames.length === 0 ? 'No sheets' : 'Select a sheet'}</option>
                                {sheetNames.map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                            <ChevronsUpDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                        <button onClick={() => setIsNewSheetModalOpen(true)} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg"><Plus size={18} /></button>
                    </div>
                    {activeSheetName && (
                        <div className="flex items-center gap-2">
                            <button onClick={handleAddNewLabel} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors">
                                <Plus size={16} /> Add Label
                            </button>
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b border-gray-700">
                            <tr>
                                {labelFields.map(f => <th key={f.name} className="p-3 text-left font-bold text-gray-400 uppercase tracking-wider">{f.label}</th>)}
                                <th className="p-3 w-28 text-right font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {labels.map((label, idx) => (
                                editingIndex === idx ? (
                                    <EditableLabelRow
                                        key={idx}
                                        fields={labelFields}
                                        formData={editFormData}
                                        setFormData={setEditFormData}
                                        onSave={() => handleSaveEdit(idx)}
                                        onCancel={handleCancelEdit}
                                    />
                                ) : (
                                    <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                                        {labelFields.map(f => <td key={f.name} className="p-3 truncate">{label[f.name]}</td>)}
                                        <td className="p-3 flex justify-end gap-2">
                                            <button onClick={() => handleEditClick(label, idx)} className="text-blue-400 hover:text-blue-300"><Edit size={16} /></button>
                                            <button onClick={() => handleDeleteLabel(idx)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                )
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={() => setIsAdvancedPrintModalOpen(true)} disabled={labels.length === 0} className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-white transition-colors text-sm disabled:bg-gray-600 disabled:text-gray-400">
                        <Grid3x3 size={16} /> Advanced Print
                    </button>
                    <button onClick={() => handleGeneratePdf()} disabled={labels.length === 0} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors text-sm disabled:bg-gray-600 disabled:text-gray-400">
                        <Eye size={16} /> Generate Full Sheet
                    </button>
                </div>
            </Card>

            <NewSheetModal isOpen={isNewSheetModalOpen} onClose={() => setIsNewSheetModalOpen(false)} onSubmit={handleCreateSheet} />
            <PdfPreviewModal url={pdfPreviewUrl} onClose={() => setPdfPreviewUrl(null)} />
            {isAdvancedPrintModalOpen && <AdvancedPrintModal
                key={pdfType}
                isOpen={isAdvancedPrintModalOpen}
                onClose={() => setIsAdvancedPrintModalOpen(false)}
                labels={labels}
                onGeneratePdf={handleGeneratePdf}
                numSlots={numSlots}
                pdfType={pdfType}
            />}
        </>
    );
}

const EditableLabelRow = ({ fields, formData, setFormData, onSave, onCancel }) => {
    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    return (
        <tr className="bg-gray-800/50">
            {fields.map(field => (
                <td key={field.name} className="p-2">
                    {field.type === 'textarea' ? (
                        <textarea name={field.name} value={formData[field.name] || ''} onChange={handleChange} className="w-full p-1 bg-gray-900 border border-gray-600 rounded-md text-sm" rows="1"></textarea>
                    ) : (
                        <input type={field.type === 'color' ? 'text' : field.type} name={field.name} value={formData[field.name] || ''} onChange={handleChange} className="w-full p-1 bg-gray-900 border border-gray-600 rounded-md text-sm" />
                    )}
                </td>
            ))}
            <td className="p-2 flex justify-end gap-2">
                <button onClick={onSave} className="p-2 bg-green-600 hover:bg-green-500 rounded-lg"><Save size={16} /></button>
                <button onClick={onCancel} className="p-2 bg-red-600 hover:bg-red-500 rounded-lg"><X size={16} /></button>
            </td>
        </tr>
    );
};

const loomLabelFields = [
    { name: 'loom_name', label: 'Loom Name', type: 'text' },
    { name: 'color', label: 'Color', type: 'color' },
    { name: 'source', label: 'Source', type: 'text' },
    { name: 'destination', label: 'Destination', type: 'text' }
];
const LoomLabelView = ({ showData, onSave }) => <LabelManagerView sheetType="loom_sheets" pdfType="loom" showData={showData} onSave={onSave} labelFields={loomLabelFields} />;
const CaseLabelView = ({ showData, onSave }) => <LabelManagerView sheetType="case_sheets" pdfType="case" showData={showData} onSave={onSave} labelFields={[{ name: 'send_to', label: 'Send To', type: 'text' }, { name: 'contents', label: 'Contents', type: 'textarea' }]} />;

const Modal = ({ isOpen, onClose, children, title, maxWidth = 'max-w-md' }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className={`bg-gray-800 p-6 rounded-xl shadow-xl w-full ${maxWidth} border border-gray-700`}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">{title}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
                </div>
                {children}
            </div>
        </div>
    );
};

const NewShowModal = ({ isOpen, onClose, onSubmit }) => {
    const [inputValue, setInputValue] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onSubmit(inputValue); setInputValue(''); };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Show">
            <form onSubmit={handleSubmit}>
                <InputField label="Enter a name for the new show:" type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} autoFocus />
                <div className="flex justify-end gap-4 mt-6">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">Create</button>
                </div>
            </form>
        </Modal>
    );
};

const NewRackModal = ({ isOpen, onClose, onSubmit }) => {
    const [rackName, setRackName] = useState('');
    const [ruHeight, setRuHeight] = useState(42);
    const handleSubmit = (e) => { e.preventDefault(); onSubmit({ rackName, ruHeight }); setRackName(''); setRuHeight(42); };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Rack">
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField label="Rack Name" type="text" value={rackName} onChange={(e) => setRackName(e.target.value)} required autoFocus />
                <InputField label="RU Height" type="number" value={ruHeight} onChange={(e) => setRuHeight(e.target.value)} required min="1" />
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">Create Rack</button>
                </div>
            </form>
        </Modal>
    );
};

const NewSheetModal = ({ isOpen, onClose, onSubmit }) => {
    const [inputValue, setInputValue] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onSubmit(inputValue); setInputValue(''); };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Sheet">
            <form onSubmit={handleSubmit}>
                <InputField label="Enter a name for the new sheet:" type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} autoFocus />
                <div className="flex justify-end gap-4 mt-6">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">Create</button>
                </div>
            </form>
        </Modal>
    );
};

const PdfPreviewModal = ({ url, onClose }) => {
    if (!url) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col border border-gray-700">
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">PDF Preview</h2>
                    <div className="flex items-center gap-4">
                        <a href={url} download="labels.pdf" className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors">
                            <Download size={16} /> Download
                        </a>
                        <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24} /></button>
                    </div>
                </header>
                <div className="flex-grow p-4">
                    <iframe src={url} title="PDF Preview" className="w-full h-full border-0 rounded-lg"></iframe>
                </div>
            </div>
        </div>
    );
};

const AdvancedPrintModal = ({ isOpen, onClose, labels, onGeneratePdf, numSlots, pdfType }) => {
    const [printSlots, setPrintSlots] = useState(Array(numSlots).fill(null));
    const [draggedItem, setDraggedItem] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setPrintSlots(Array(numSlots).fill(null));
        }
    }, [isOpen, numSlots]);

    const handleDragStart = (e, item) => {
        setDraggedItem(item);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e, slotIndex) => {
        e.preventDefault();
        if (draggedItem) {
            const newSlots = [...printSlots];
            const oldIndex = newSlots.findIndex(item => item && item.originalIndex === draggedItem.originalIndex);
            if (oldIndex > -1) newSlots[oldIndex] = null;
            newSlots[slotIndex] = draggedItem;
            setPrintSlots(newSlots);
            setDraggedItem(null);
        }
    };

    const removeFromSlot = (slotIndex) => {
        const newSlots = [...printSlots];
        newSlots[slotIndex] = null;
        setPrintSlots(newSlots);
    };

    const handleGenerate = () => {
        const placement = {};
        printSlots.forEach((item, slotIndex) => {
            if (item) {
                placement[slotIndex] = item.originalIndex;
            }
        });
        onGeneratePdf(placement);
        onClose();
    };

    const title = pdfType === 'case' ? "Advanced Case Label Print" : "Advanced Loom Label Print";
    const slotText = pdfType === 'case' ? 'Page Side' : 'Slot';
    const gridCols = pdfType === 'case' ? 'grid-cols-1' : 'grid-cols-3';
    const slotHeight = pdfType === 'case' ? 'h-40' : 'h-20';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-4xl">
            <div className="grid grid-cols-3 gap-6 h-[60vh]">
                <div className="col-span-1 bg-gray-900/50 p-4 rounded-lg overflow-y-auto">
                    <h3 className="font-bold mb-4 text-white flex items-center gap-2"><List size={16} /> Available Labels</h3>
                    <div className="space-y-2">
                        {labels.map((label, index) => (
                            <div
                                key={index}
                                draggable
                                onDragStart={(e) => handleDragStart(e, { ...label, originalIndex: index })}
                                className={`p-2 rounded-md text-sm cursor-grab ${printSlots.some(s => s && s.originalIndex === index) ? 'bg-gray-700 text-gray-500' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                                {label.loom_name || label.send_to}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="col-span-2 bg-gray-900/50 p-4 rounded-lg overflow-y-auto">
                    <h3 className="font-bold mb-4 text-white flex items-center gap-2"><Grid3x3 size={16} /> Print Sheet ({numSlots} Slots)</h3>
                    <div className={`grid ${gridCols} gap-4`}>
                        {printSlots.map((item, index) => (
                            <div
                                key={index}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, index)}
                                className={`relative ${slotHeight} border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-center p-2 drag-over-target`}
                            >
                                {item ? (
                                    <>
                                        <span className="text-xs text-gray-300">{item.loom_name || item.send_to}</span>
                                        <button onClick={() => removeFromSlot(index)} className="absolute top-1 right-1 text-gray-500 hover:text-red-400">
                                            <X size={12} />
                                        </button>
                                    </>
                                ) : (
                                    <span className="text-xs text-gray-500">{slotText} {index + 1}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors">Cancel</button>
                <button type="button" onClick={handleGenerate} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">Generate PDF</button>
            </div>
        </Modal>
    );
};

const Card = ({ children, className = '' }) => (
    <div className={`bg-gray-800/50 p-6 rounded-xl ${className}`}>
        {children}
    </div>
);