import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import { api } from '../api/api';

const AddVLANModal = ({ isOpen, onClose, onSubmit, vlan }) => {
    const [name, setName] = useState('');
    const [tag, setTag] = useState('');
    const [igmpSnoopingEnabled, setIgmpSnoopingEnabled] = useState(false);
    const [multicastFloodingEnabled, setMulticastFloodingEnabled] = useState(true);
    const [error, setError] = useState('');

    const isEditMode = vlan != null;

    useEffect(() => {
        if (!isOpen) return;

        if (isEditMode) {
            setName(vlan.name);
            setTag(vlan.tag.toString());
            setIgmpSnoopingEnabled(!!vlan.igmp_snooping_enabled);
            setMulticastFloodingEnabled(vlan.multicast_flooding_enabled !== false);
        } else {
            setName('');
            setTag('');
            // Pre-fill from the account's switch defaults, if any are set. Still fully
            // editable before saving -- this is just a starting point.
            setIgmpSnoopingEnabled(false);
            setMulticastFloodingEnabled(true);
            api.getSwitchDefaults()
                .then(defaults => {
                    if (defaults.default_igmp_snooping_enabled != null) {
                        setIgmpSnoopingEnabled(defaults.default_igmp_snooping_enabled);
                    }
                    if (defaults.default_multicast_flooding_enabled != null) {
                        setMulticastFloodingEnabled(defaults.default_multicast_flooding_enabled);
                    }
                })
                .catch(() => {}); // No defaults set yet -- fine, keep the built-in defaults above.
        }
        setError('');
    }, [isOpen, vlan, isEditMode]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim() || !tag) {
            setError('Both VLAN Name and Tag are required.');
            return;
        }
        const tagAsInt = parseInt(tag, 10);
        if (isNaN(tagAsInt) || tagAsInt <= 0) {
            setError('VLAN Tag must be a positive number.');
            return;
        }
        onSubmit({
            name, tag: tagAsInt,
            igmp_snooping_enabled: igmpSnoopingEnabled,
            multicast_flooding_enabled: multicastFloodingEnabled,
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? 'Edit VLAN' : 'Add New VLAN'}>
            <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                    <InputField
                        label="VLAN Name"
                        id="vlan-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Camera Network"
                        autoFocus
                    />
                    <InputField
                        label="VLAN Tag"
                        id="vlan-tag"
                        type="number"
                        value={tag}
                        onChange={(e) => setTag(e.target.value)}
                        placeholder="e.g., 101"
                    />
                    <div className="flex flex-col gap-2 text-sm">
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={igmpSnoopingEnabled}
                                onChange={(e) => setIgmpSnoopingEnabled(e.target.checked)}
                            />
                            IGMP Snooping Enabled
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={multicastFloodingEnabled}
                                onChange={(e) => setMulticastFloodingEnabled(e.target.checked)}
                            />
                            Multicast Flooding Enabled
                        </label>
                    </div>
                </div>
                {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
                <div className="flex justify-end gap-3 mt-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-500 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors"
                    >
                        {isEditMode ? 'Save Changes' : 'Add VLAN'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default AddVLANModal;
