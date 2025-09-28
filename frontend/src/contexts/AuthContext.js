import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { supabase, api } from '../api/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    // Session is initialized to `undefined` to distinguish from `null` (logged out).
    const [session, setSession] = useState(undefined);
    const [profile, setProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [permissionsVersion, setPermissionsVersion] = useState(null);
    const [isImpersonating, setIsImpersonating] = useState(() => !!sessionStorage.getItem('impersonation_active'));

    const startImpersonation = useCallback(async (userId) => {
        try {
            // 1. Get the admin's current session to store it
            const { data: { session: adminSession } } = await supabase.auth.getSession();
            if (!adminSession) {
                throw new Error("No active admin session found.");
            }
            sessionStorage.setItem('admin_session', JSON.stringify(adminSession));

            // 2. Request the impersonation token from the backend
            const impersonationToken = await api.startImpersonation(userId);

            // 3. Set the new session on the Supabase client
            await supabase.auth.setSession({
                access_token: impersonationToken.access_token,
                refresh_token: adminSession.refresh_token, // Can reuse the admin's refresh token
            });
            
            // 4. Update state and mark that we are impersonating
            sessionStorage.setItem('impersonation_active', 'true');
            setIsImpersonating(true);

            // 5. The onAuthStateChange listener will automatically trigger a profile refetch
            // Force a page reload to ensure all components reset their state correctly.
            window.location.reload();
        } catch (error) {
            console.error("Failed to start impersonation:", error);
            // Clean up in case of failure
            sessionStorage.removeItem('admin_session');
            sessionStorage.removeItem('impersonation_active');
            setIsImpersonating(false);
            throw error; // Re-throw to be caught by the calling component
        }
    }, []);

    const stopImpersonation = useCallback(async () => {
        try {
            // 1. Retrieve the original admin session
            const adminSessionString = sessionStorage.getItem('admin_session');
            if (!adminSessionString) {
                // If no session, sign out to be safe
                await supabase.auth.signOut();
                return;
            }
            const adminSession = JSON.parse(adminSessionString);

            // 2. Call the backend endpoint for auditing
            await api.stopImpersonation();

            // 3. Restore the original session
            await supabase.auth.setSession(adminSession);
            
            // 4. Clean up storage and state
            sessionStorage.removeItem('admin_session');
            sessionStorage.removeItem('impersonation_active');
            setIsImpersonating(false);

            // 5. Force a reload to return to the admin state
            window.location.reload();
        } catch (error) {
            console.error("Failed to stop impersonation:", error);
            // Force a sign out as a fallback to prevent being stuck
            await supabase.auth.signOut();
            window.location.reload();
        }
    }, []);

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
        isImpersonating,
        startImpersonation,
        stopImpersonation,
        refetchProfile: fetchProfile,
    }), [session, profile, isLoading, fetchProfile, isImpersonating, startImpersonation, stopImpersonation]);

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