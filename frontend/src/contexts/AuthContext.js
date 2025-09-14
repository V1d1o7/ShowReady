import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { supabase, api } from '../api/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [permissionsVersion, setPermissionsVersion] = useState(null);

    const fetchProfile = useCallback(async () => {
        // This function now relies on the `session` from the closure.
        // It should only be called when we know a session exists.
        try {
            const profileData = await api.getProfile();
            setProfile(profileData);
            const versionData = await api.getPermissionsVersion();
            setPermissionsVersion(versionData.version);
        } catch (error) {
            console.error("AuthContext: Failed to fetch profile:", error);
            setProfile(null); // Clear profile on error
        }
    }, []);

    // Effect for handling auth state changes ONLY.
    // This sets the session and lets the next effect handle the profile fetching.
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Effect for fetching the profile when the session is first loaded or changes.
    useEffect(() => {
        setIsLoading(true);
        if (session) {
            fetchProfile().then(() => {
                setIsLoading(false);
            });
        } else {
            // No session, so not loading and no profile.
            setProfile(null);
            setIsLoading(false);
        }
    }, [session, fetchProfile]);

    // Effect for checking for permission updates on tab focus
    useEffect(() => {
        const checkForUpdates = async () => {
            // Only check if the tab is visible and we have a valid session/version
            if (document.visibilityState === 'visible' && session && permissionsVersion) {
                try {
                    const latestVersionData = await api.getPermissionsVersion();
                    const latestVersion = latestVersionData.version;
                    if (latestVersion > permissionsVersion) {
                        console.log("New permissions version detected. Refetching profile.");
                        await fetchProfile();
                    }
                } catch (error) {
                    console.error("Failed to check for permission updates:", error);
                }
            }
        };

        document.addEventListener('visibilitychange', checkForUpdates);
        return () => {
            document.removeEventListener('visibilitychange', checkForUpdates);
        };
    }, [permissionsVersion, session, fetchProfile]);


    const value = {
        session,
        profile,
        isLoading,
        refetchProfile: fetchProfile,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
