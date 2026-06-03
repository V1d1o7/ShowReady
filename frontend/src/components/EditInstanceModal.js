import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import NetworkAssignmentFields, {
    hydrateNetworkAssignment,
    buildNetworkAssignmentPayload,
} from './NetworkAssignmentFields';

const EditInstanceModal = ({ isOpen, onClose, onSubmit, item }) => {
    const [name, setName] = useState('');
    const [networkAssignment, setNetworkAssignment] = useState(hydrateNetworkAssignment());

    const template = item?.equipment_templates || {};

    useEffect(() => {
        if (!item) return;

        setName(item.instance_name || '');
        setNetworkAssignment(hydrateNetworkAssignment(item));
    }, [item]);

    const handleSubmit = (e) => {
        e.preventDefault();

        const dataToSubmit = {
            instance_name: name,
        };

        if (template.has_ip_address) {
            const payload = buildNetworkAssignmentPayload(networkAssignment);

            dataToSubmit.network_assignment = payload;

            // Legacy mirror only. Canonical data lives in network_ip_entries.
            dataToSubmit.ip_address = payload.assignment_type === 'single'
                ? payload.ip_address
                : null;
        }

        onSubmit(dataToSubmit);
    };

    if (!isOpen || !item) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit: ${item.instance_name}`}>
            <form onSubmit={handleSubmit} className="space-y-5">
                <p className="text-sm text-gray-400 -mb-2">Model: {template.model_number}</p>

                <InputField
                    label="Instance Name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                />

                {template.has_ip_address && (
                    <div className="border border-gray-700 rounded-lg p-4 bg-gray-900/40">
                        <div className="mb-4">
                            <h3 className="text-sm font-semibold text-white">Network Assignment</h3>
                            <p className="text-xs text-gray-400 mt-1">
                                Assign a single IP, IP range, or trunk directly from the rack.
                            </p>
                        </div>

                        <NetworkAssignmentFields
                            value={networkAssignment}
                            onChange={setNetworkAssignment}
                            locationMode="hidden"
                        />
                    </div>
                )}

                <div className="flex justify-end gap-4 pt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold"
                    >
                        Cancel
                    </button>

                    <button
                        type="submit"
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black"
                    >
                        Save Changes
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default EditInstanceModal;