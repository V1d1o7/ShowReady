import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import toast from 'react-hot-toast';
import { api } from '../api/api';

const FeatureConfigModal = ({ isOpen, onClose, feature, limitsConfig, tiers, onSaveSuccess }) => {
    const [localLimits, setLocalLimits] = useState({});
    const [isSaving, setIsSaving] = useState(false);

    // Initialize state with current values from the tiers prop
    useEffect(() => {
        if (isOpen && tiers.length > 0) {
            const initial = {};
            tiers.forEach(tier => {
                initial[tier.name] = {};
                limitsConfig.forEach(conf => {
                    initial[tier.name][conf.key] = tier[conf.key];
                });
            });
            setLocalLimits(initial);
        }
    }, [isOpen, tiers, limitsConfig]);

    const handleChange = (tierName, key, value) => {
        setLocalLimits(prev => ({
            ...prev,
            [tierName]: {
                ...prev[tierName],
                [key]: value
            }
        }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        const toastId = toast.loading("Saving configuration...");

        try {
            // Update each tier's limits
            const promises = tiers.map(tier => {
                const tierUpdates = localLimits[tier.name];
                if (!tierUpdates) return Promise.resolve();

                // Dynamic Payload Construction
                const payload = {};
                
                limitsConfig.forEach(conf => {
                    let val = tierUpdates[conf.key];
                    
                    // Handle empty strings, nulls, and negative inputs
                    if (val !== undefined && val !== "") {
                        val = parseInt(val);
                        // Convert negative values or NaNs to -1 (Backend treats -1 or None as Unlimited)
                        if (isNaN(val) || val < 0) val = -1;
                        payload[conf.key] = val;
                    }
                });

                if (Object.keys(payload).length > 0) {
                    return api.updateTierLimits(tier.name, payload);
                }
                return Promise.resolve();
            });

            await Promise.all(promises);
            toast.success("Limits updated!", { id: toastId });
            onSaveSuccess(); // Refresh parent data
            onClose();
        } catch (error) {
            toast.error(`Failed: ${error.message}`, { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    if (!feature) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Configure ${feature.display_name}`}>
            <form onSubmit={handleSave} className="space-y-6">
                <p className="text-sm text-gray-400 bg-gray-800 p-3 rounded">
                    Adjust the specific limits for this feature across each tier.
                </p>

                <div className="grid grid-cols-1 gap-6 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                    {tiers.map(tier => (
                        <div key={tier.name} className="bg-gray-900/50 p-4 rounded border border-gray-700">
                            <h4 className="text-amber-500 font-bold uppercase text-sm mb-3 border-b border-gray-700 pb-1">
                                {tier.name}
                            </h4>
                            
                            <div className="space-y-4">
                                {limitsConfig.map(conf => {
                                    const val = localLimits[tier.name]?.[conf.key];
                                    return (
                                        <div key={conf.key}>
                                            <label className="block text-xs text-gray-300 font-bold mb-1 flex items-center gap-2">
                                                <conf.icon size={12} /> {conf.label}
                                            </label>
                                            <div className="relative">
                                                <input 
                                                    type="number"
                                                    value={val === null ? '' : val}
                                                    onChange={(e) => handleChange(tier.name, conf.key, e.target.value)}
                                                    placeholder={conf.placeholder}
                                                    className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:border-amber-500 outline-none"
                                                />
                                                {(val === -1 || val === null) && (
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-500 font-bold pointer-events-none">
                                                        ∞
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-gray-500 mt-1">{conf.description}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">
                        Cancel
                    </button>
                    <button type="submit" disabled={isSaving} className="px-6 py-2 bg-amber-500 text-black font-bold rounded hover:bg-amber-400 transition-colors disabled:opacity-50">
                        {isSaving ? 'Saving...' : 'Save Limits'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default FeatureConfigModal;