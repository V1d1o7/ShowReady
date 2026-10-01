import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api/api';
import { Copy, RefreshCw, Save, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import ToggleSwitch from './ToggleSwitch';
import ConfirmationModal from './ConfirmationModal';

const STANDARD_FIELDS = [
    { source: 'standard', key: 'first_name', label: 'First Name' },
    { source: 'standard', key: 'last_name', label: 'Last Name' },
    { source: 'standard', key: 'preferred_first_name', label: 'Preferred First Name' },
    { source: 'standard', key: 'preferred_last_name', label: 'Preferred Last Name' },
    { source: 'standard', key: 'pronouns', label: 'Pronouns' },
    { source: 'standard', key: 'email', label: 'Email' },
    { source: 'standard', key: 'phone_number', label: 'Phone Number' },
    { source: 'standard', key: 'position', label: 'Position' },
];

const fieldId = (source, key) => `${source}:${key}`;

// Same "pretty checkbox" convention already used in RosterView's View menu (a bordered
// square that fills amber + shows a check mark) instead of a bare native checkbox.
const SquareCheckbox = ({ checked, onClick, disabled }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
            disabled ? 'border-gray-700 bg-gray-800/50 cursor-not-allowed' :
            checked ? 'bg-amber-500 border-amber-500' : 'border-gray-600 hover:border-gray-500'
        }`}
    >
        {checked && <Check size={13} className={disabled ? 'text-gray-500' : 'text-black'} strokeWidth={3} />}
    </button>
);

const OnboardingLinkPanel = () => {
    const [config, setConfig] = useState(null);
    const [customFieldDefs, setCustomFieldDefs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [slugInput, setSlugInput] = useState('');
    const [introInput, setIntroInput] = useState('');
    const [selection, setSelection] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });

    const catalog = useMemo(() => [
        ...STANDARD_FIELDS,
        ...[...customFieldDefs].sort((a, b) => a.sort_order - b.sort_order)
            .map(def => ({ source: 'custom', key: def.key, label: def.label })),
    ], [customFieldDefs]);

    const applyConfig = useCallback((data, defs) => {
        setConfig(data);
        setSlugInput(data.slug);
        setIntroInput(data.intro_text || '');
        const byId = {};
        (data.form_fields || []).forEach(f => {
            byId[fieldId(f.source, f.key)] = { included: true, required: !!f.required };
        });
        const merged = {};
        [...STANDARD_FIELDS, ...defs.map(def => ({ source: 'custom', key: def.key }))].forEach(entry => {
            const id = fieldId(entry.source, entry.key);
            merged[id] = byId[id] || { included: false, required: false };
        });
        setSelection(merged);
    }, []);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [linkData, defs] = await Promise.all([api.getOnboardingLink(), api.getRosterCustomFields()]);
            setCustomFieldDefs(defs);
            applyConfig(linkData, defs);
        } catch (error) {
            toast.error(error.message || 'Failed to load onboarding link.');
        } finally {
            setIsLoading(false);
        }
    }, [applyConfig]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleToggleEnabled = async () => {
        try {
            const updated = await api.updateOnboardingLink({ enabled: !config.enabled });
            setConfig(updated);
        } catch (error) {
            toast.error(error.message || 'Failed to update link.');
        }
    };

    const handleSaveSlug = async () => {
        try {
            const updated = await api.updateOnboardingLink({ slug: slugInput });
            setConfig(updated);
            toast.success('Link updated.');
        } catch (error) {
            toast.error(error.message || 'That link is already taken.');
        }
    };

    const handleRegenerate = () => {
        setConfirmModal({
            isOpen: true,
            message: 'This will invalidate the current link — anyone with the old URL will no longer be able to use it. Continue?',
            onConfirm: async () => {
                setConfirmModal({ isOpen: false, message: '', onConfirm: null });
                try {
                    const updated = await api.regenerateOnboardingSlug();
                    setConfig(updated);
                    setSlugInput(updated.slug);
                    toast.success('New link generated.');
                } catch (error) {
                    toast.error(error.message || 'Failed to generate a new link.');
                }
            },
        });
    };

    const toggleIncluded = (id) => {
        setSelection(prev => ({ ...prev, [id]: { ...prev[id], included: !prev[id].included, required: prev[id].included ? false : prev[id].required } }));
    };

    const toggleRequired = (id) => {
        setSelection(prev => ({ ...prev, [id]: { ...prev[id], required: !prev[id].required } }));
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        try {
            const form_fields = catalog
                .filter(entry => selection[fieldId(entry.source, entry.key)]?.included)
                .map(entry => ({
                    source: entry.source,
                    key: entry.key,
                    required: !!selection[fieldId(entry.source, entry.key)]?.required,
                }));
            const updated = await api.updateOnboardingLink({ form_fields, intro_text: introInput });
            setConfig(updated);
            toast.success('Changes saved.');
        } catch (error) {
            toast.error(error.message || 'Failed to save changes.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}/join/${config.slug}`;
        navigator.clipboard.writeText(url);
        toast.success('Link copied!');
    };

    if (isLoading) {
        return <div className="text-center py-16 text-gray-500">Loading...</div>;
    }

    return (
        <div className="max-w-5xl w-full mx-auto space-y-5 pb-10">
            {confirmModal.isOpen && (
                <ConfirmationModal
                    message={confirmModal.message}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal({ isOpen: false, message: '', onConfirm: null })}
                />
            )}

            {/* Two columns on large screens (link settings + intro on the left, the field
                list — whose height varies with how many custom fields exist — on the
                right) so a long field list doesn't force a single narrow column to be
                enormously tall. Both columns live inside the tab's one shared scroll
                region (no nested scroll areas), so the page scrolls as a whole. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                <div className="space-y-5">
                    <div className="bg-gray-800/40 border border-gray-800 rounded-lg p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-lg font-bold text-white">Your Onboarding Link</h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {config.enabled
                                        ? 'Live — anyone with this link can submit and be added to your roster.'
                                        : "Off — turn this on when you're ready to share it."}
                                </p>
                            </div>
                            <ToggleSwitch checked={config.enabled} onChange={handleToggleEnabled} id="onboarding-enabled" />
                        </div>

                        <div className="flex items-center bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
                            <span className="pl-3 text-gray-500 text-sm whitespace-nowrap hidden sm:inline">{window.location.origin}/join/</span>
                            <input
                                value={slugInput}
                                onChange={(e) => setSlugInput(e.target.value.toLowerCase())}
                                className="flex-1 min-w-0 p-2.5 bg-transparent focus:outline-none text-gray-200"
                            />
                            <button onClick={handleCopyLink} title="Copy link" className="p-2.5 text-gray-400 hover:text-white border-l border-gray-700">
                                <Copy size={16} />
                            </button>
                        </div>

                        <div className="flex justify-end gap-2 mt-3">
                            <button onClick={handleSaveSlug} className="text-sm px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 font-semibold rounded-lg hover:bg-gray-700 transition-colors">
                                Save Link
                            </button>
                            <button onClick={handleRegenerate} className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 font-semibold rounded-lg hover:bg-gray-700 transition-colors">
                                <RefreshCw size={14} /> New Link
                            </button>
                        </div>
                    </div>

                    <div className="bg-gray-800/40 border border-gray-800 rounded-lg p-5">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-2">Intro Message</h3>
                        <textarea
                            value={introInput}
                            onChange={(e) => setIntroInput(e.target.value)}
                            rows={5}
                            placeholder="Optional message shown at the top of the form..."
                            className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500 text-gray-200 resize-y leading-relaxed"
                        />
                    </div>
                </div>

                <div className="bg-gray-800/40 border border-gray-800 rounded-lg p-5">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Form Fields</h3>
                    <div className="rounded-lg border border-gray-800 overflow-hidden">
                        <div className="flex items-center px-4 py-2 bg-gray-900/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                            <span className="flex-1">Field</span>
                            <span className="w-16 text-center">Include</span>
                            <span className="w-16 text-center">Required</span>
                        </div>
                        <div className="divide-y divide-gray-800">
                            {catalog.map(entry => {
                                const id = fieldId(entry.source, entry.key);
                                const state = selection[id] || { included: false, required: false };
                                return (
                                    <div key={id} className="flex items-center px-4 py-2">
                                        <span className="flex-1 text-sm text-gray-200">{entry.label}</span>
                                        <div className="w-16 flex justify-center">
                                            <SquareCheckbox checked={state.included} onClick={() => toggleIncluded(id)} />
                                        </div>
                                        <div className="w-16 flex justify-center">
                                            <SquareCheckbox checked={state.required} disabled={!state.included} onClick={() => toggleRequired(id)} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <button
                onClick={handleSaveChanges}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
                <Save size={18} /> {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
    );
};

export default OnboardingLinkPanel;
