import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { supabase, api } from '../api/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    // Session is initialized to `undefined` to distinguish from `null` (logged out).
    const [session, setSession] = useState(undefined);
    const [profile, setProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [permissionsVersion, setPermissionsVersion] = useState(null);

    const fetchProfile = useCallback(async () => {
        try {
            const profileData = await api.getProfile();
            setProfile(profileData);
            const versionData = await api.getPermissionsVersion();
            setPermissionsVersion(versionData.version);
        } catch (error) {
            console.error("AuthContext: Failed to fetch profile:", error);
            setProfile(null);
        }
    }, []);

    // Effect to handle session setup and listen for auth changes.
    useEffect(() => {
        // On initial load, get the session.
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        // Listen for auth state changes.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
            // This smart setter prevents re-renders on background token refreshes.
            setSession(currentSession => {
                if (newSession?.user?.id !== currentSession?.user?.id) {
                    return newSession;
                }
                return currentSession;
            });
        });

        return () => subscription.unsubscribe();
    }, []);

    // Effect to handle profile fetching and loading state based on session status.
    useEffect(() => {
        // Do nothing until the initial session check is complete.
        if (session === undefined) {
            return;
        }

        if (session) {
            // Session exists, fetch profile and then finish loading.
            fetchProfile().finally(() => {
                setIsLoading(false);
            });
        } else {
            // Session is null (logged out), so no profile and loading is finished.
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


    const value = useMemo(() => ({
        session,
        profile,
        isLoading,
        refetchProfile: fetchProfile,
    }), [session, profile, isLoading, fetchProfile]);

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
