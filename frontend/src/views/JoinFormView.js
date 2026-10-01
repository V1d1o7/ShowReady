import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/api';
import { CheckCircle, AlertTriangle, Check, User, Mail, ClipboardList, Loader2 } from 'lucide-react';
import InputField from '../components/InputField';
import Navbar from '../components/Navbar';
import toast, { Toaster } from 'react-hot-toast';

const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script';
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// Which section a standard field's display groups under. Custom fields and anything
// else (e.g. "position") fall into "details" by default — this is purely a display
// grouping, not something the owner configures, so new standard keys just need adding
// to one of these two sets to land in the right section instead of "details".
const NAME_FIELD_KEYS = new Set(['first_name', 'last_name', 'preferred_first_name', 'preferred_last_name', 'pronouns']);
const CONTACT_FIELD_KEYS = new Set(['email', 'phone_number']);

const sectionFor = (field) => {
    const [source, key] = field.field_id.split(':');
    if (source === 'standard' && NAME_FIELD_KEYS.has(key)) return 'about';
    if (source === 'standard' && CONTACT_FIELD_KEYS.has(key)) return 'contact';
    return 'details';
};

const RequiredMark = () => <span className="text-amber-400"> *</span>;

// These must live at module scope, not inside JoinFormView's body — a component defined
// inside another component's render function gets a brand-new function identity every
// render. React diffs by that identity, so on every keystroke (every state update
// re-renders JoinFormView) it would see "a different component type" at this position in
// the tree and unmount+remount the whole subtree instead of just updating it — destroying
// and recreating the real <input> DOM node, which drops focus after a single character.
// Hoisting them here keeps their identity stable across renders, so React just updates
// props in place like normal. FormSection takes renderField as a prop for the same reason
// it can't be a closure defined inside JoinFormView.
const FormSection = ({ icon: Icon, title, fields, renderField }) => {
    if (fields.length === 0) return null;
    return (
        <div>
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">
                <Icon size={13} /> {title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fields.map(renderField)}
            </div>
        </div>
    );
};

const Page = ({ children }) => (
    <div className="h-screen w-full overflow-y-auto bg-gray-900 text-gray-300">
        <Toaster position="top-center" toastOptions={{ style: { background: '#1F2937', color: '#F9FAFB', border: '1px solid #374151' } }} />

        <Navbar minimal />

        <main className="max-w-xl mx-auto px-6 py-10 sm:py-14">
            {children}
        </main>

        <footer className="max-w-xl mx-auto px-6 pb-10 text-center">
            <p className="text-xs text-gray-600">Powered by ShowReady</p>
        </footer>
    </div>
);

const StatusCard = ({ children }) => (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl p-10 text-center">
        {children}
    </div>
);

// Standalone public page, rendered outside the main App shell (own Toaster, since the
// global one isn't mounted here). Plain top-to-bottom block flow, not flex vertical
// centering — centering a flex item that can grow taller than its container clips the
// top of the content (the overflow extends equally in both directions from the centered
// point, but the scrollable range only ever starts at zero), which is exactly what was
// cutting off the top of this page. A simple mx-auto column with normal flow has no such
// ceiling: it scrolls from true the top no matter how tall the form gets.
const JoinFormView = () => {
    const { slug } = useParams();
    const [form, setForm] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [values, setValues] = useState({});
    const [honeypot, setHoneypot] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState(null);
    const [turnstileReady, setTurnstileReady] = useState(false);
    const turnstileContainerRef = useRef(null);
    const turnstileWidgetIdRef = useRef(null);

    const fetchForm = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.getPublicOnboardingForm(slug);
            setForm(data);
        } catch (err) {
            setError(err.message || 'This link is invalid.');
        } finally {
            setIsLoading(false);
        }
    }, [slug]);

    useEffect(() => {
        fetchForm();
    }, [fetchForm]);

    // Load the Turnstile script once, globally — this is the only page in the app that needs it.
    useEffect(() => {
        if (window.turnstile) {
            setTurnstileReady(true);
            return;
        }
        if (document.getElementById(TURNSTILE_SCRIPT_ID)) {
            return;
        }
        const script = document.createElement('script');
        script.id = TURNSTILE_SCRIPT_ID;
        script.src = TURNSTILE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => setTurnstileReady(true);
        document.body.appendChild(script);
    }, []);

    // Explicit render (not the auto-render data-sitekey div) so we can capture the token via
    // callback and reset the widget after a failed submit.
    useEffect(() => {
        if (!turnstileReady || !turnstileContainerRef.current || turnstileWidgetIdRef.current !== null) {
            return;
        }
        turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
            sitekey: process.env.REACT_APP_TURNSTILE_SITE_KEY,
            callback: (token) => setTurnstileToken(token),
            'expired-callback': () => setTurnstileToken(null),
        });
    }, [turnstileReady, form]);

    const resetTurnstile = () => {
        setTurnstileToken(null);
        if (window.turnstile && turnstileWidgetIdRef.current !== null) {
            window.turnstile.reset(turnstileWidgetIdRef.current);
        }
    };

    const handleChange = (fieldId, value) => {
        setValues(prev => ({ ...prev, [fieldId]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!turnstileToken) {
            toast.error('Please complete the verification.');
            return;
        }
        setIsSubmitting(true);
        try {
            await api.submitOnboardingForm(slug, { turnstile_token: turnstileToken, honeypot, values });
            setSubmitted(true);
        } catch (err) {
            toast.error(err.message || 'Failed to submit the form.');
            resetTurnstile();
        } finally {
            setIsSubmitting(false);
        }
    };

    const sections = useMemo(() => {
        const groups = { about: [], contact: [], details: [] };
        (form?.fields || []).forEach(f => groups[sectionFor(f)].push(f));
        return groups;
    }, [form]);

    const renderField = (field) => {
        const label = <>{field.label}{field.required && <RequiredMark />}</>;
        const value = values[field.field_id] ?? '';

        if (field.field_type === 'yesno') {
            const checked = !!value;
            return (
                <button
                    type="button"
                    key={field.field_id}
                    onClick={() => handleChange(field.field_id, !checked)}
                    className="flex items-center gap-2.5 text-sm text-gray-300 py-2"
                >
                    <span className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${checked ? 'bg-amber-500 border-amber-500' : 'border-gray-600'}`}>
                        {checked && <Check size={13} className="text-black" strokeWidth={3} />}
                    </span>
                    {label}
                </button>
            );
        }

        if (field.field_type === 'dropdown') {
            return (
                <div key={field.field_id}>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
                    <select
                        value={value}
                        required={field.required}
                        onChange={(e) => handleChange(field.field_id, e.target.value)}
                        className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                    >
                        <option value="">Select...</option>
                        {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </div>
            );
        }

        const inputType = { text: 'text', email: 'email', tel: 'tel', number: 'number', date: 'date' }[field.field_type] || 'text';
        return (
            <InputField
                key={field.field_id}
                label={label}
                type={inputType}
                required={field.required}
                value={value}
                onChange={(e) => handleChange(field.field_id, e.target.value)}
            />
        );
    };

    if (isLoading) {
        return (
            <Page>
                <StatusCard>
                    <Loader2 size={28} className="mx-auto text-gray-500 animate-spin mb-3" />
                    <p className="text-gray-400">Loading...</p>
                </StatusCard>
            </Page>
        );
    }

    if (error) {
        return (
            <Page>
                <StatusCard>
                    <AlertTriangle size={40} className="mx-auto text-amber-500 mb-4" />
                    <h1 className="text-xl font-bold text-white mb-2">Link Not Found</h1>
                    <p className="text-gray-400">{error}</p>
                </StatusCard>
            </Page>
        );
    }

    if (submitted) {
        return (
            <Page>
                <StatusCard>
                    <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <CheckCircle size={28} className="text-emerald-400" />
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Thanks!</h1>
                    <p className="text-gray-400">You've been added to the crew roster.</p>
                </StatusCard>
            </Page>
        );
    }

    return (
        <Page>
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-white tracking-tight">Join the Crew</h1>
                {form.intro_text && (
                    <p className="mt-3 text-gray-400 leading-relaxed whitespace-pre-wrap">{form.intro_text}</p>
                )}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl p-6 sm:p-8">
                <form onSubmit={handleSubmit} className="space-y-7">
                    {/* Honeypot — visually hidden, not display:none, real users never see or fill it. */}
                    <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
                        <label htmlFor="website">Leave this field blank</label>
                        <input
                            id="website"
                            name="website"
                            type="text"
                            tabIndex={-1}
                            autoComplete="off"
                            value={honeypot}
                            onChange={(e) => setHoneypot(e.target.value)}
                        />
                    </div>

                    <FormSection icon={User} title="About You" fields={sections.about} renderField={renderField} />
                    <FormSection icon={Mail} title="Contact Info" fields={sections.contact} renderField={renderField} />
                    <FormSection icon={ClipboardList} title="Additional Details" fields={sections.details} renderField={renderField} />

                    <div className="pt-5 border-t border-gray-700/60 space-y-5">
                        <div ref={turnstileContainerRef} className="flex justify-center" />

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-3 rounded-lg font-bold text-black bg-amber-500 hover:bg-amber-400 transition-colors disabled:opacity-50"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit'}
                        </button>
                    </div>
                </form>
            </div>
        </Page>
    );
};

export default JoinFormView;
