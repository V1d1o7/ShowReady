import React, { useState } from 'react';
import InputField from '../components/InputField';
import { supabase } from '../api/api';

function Auth() {
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
            if (!firstName || !lastName) {
                setAuthError('First name and last name are required.');
                setLoading(false);
                return;
            }
            const metaData = {
                first_name: firstName,
                last_name: lastName,
                company_name: companyName,
                production_role: productionRole,
                production_role_other: productionRole === 'Other' ? otherRole : '',
            };
            response = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: metaData
                }
            });
        } else {
            response = await supabase.auth.signInWithPassword({ email, password });
        }

        if (response.error) {
            setAuthError(response.error.message);
        } else if (isSignUp) {
            alert('Account created! Please check your email to confirm your registration.');
        }

        setLoading(false);
    };

    const handleGoogleLogin = async () => {
        await supabase.auth.signInWithOAuth({
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

export default Auth;