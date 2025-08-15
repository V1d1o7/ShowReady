import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, api } from '../api/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const handleAuthChange = async (newSession) => {
            setSession(newSession);
            setProfile(null); // Reset profile on new session
            if (newSession) {
                try {
                    const profileData = await api.getProfile();
                    setProfile(profileData);
                } catch (error) {
                    console.error("Failed to fetch profile:", error);
                }
            }
            setLoading(false);
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
            handleAuthChange(newSession);
        });

        // Fetch initial session on component mount
        supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
            handleAuthChange(initialSession);
        });

        return () => subscription.unsubscribe();
    }, []);

    const value = {
        session,
        profile,
        loading,
        login: (email, password) => supabase.auth.signInWithPassword({ email, password }),
        logout: () => supabase.auth.signOut(),
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};