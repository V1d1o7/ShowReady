import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import SelectField from './SelectField';
import MultiSelect from './MultiSelect';
import { api } from '../api/api';
import toast from 'react-hot-toast';
import { useShow } from '../contexts/ShowContext';

// Configures a Link Aggregation Group: which physical ports it bonds together, plus the
// LAG's own VLAN membership (VLAN config lives on the LAG interface, not its member
// ports -- confirmed from a real running-config; see netgear_m4300.py).
const LagConfigModal = ({ isOpen, onClose, lagId, lagConfig, availablePorts, onSave, onDelete }) => {
    const [lagName, setLagName] = useState('');
    const [memberPorts, setMemberPorts] = useState([]);
    const [pvid, setPvid] = useState('');
    const [taggedVlans, setTaggedVlans] = useState([]);
    const [availableVlans, setAvailableVlans] = useState([]);
    const nameRef = useRef(null);

    const { showId } = useShow();
    const isEditMode = lagConfig != null;

    useEffect(() => {
        if (isOpen) nameRef.current?.focus();
    }, [isOpen, lagId]);

    useEffect(() => {
        if (!isOpen) return;

        setLagName(lagConfig?.lag_name || lagConfig?.port_name || '');
        setMemberPorts((lagConfig?.member_ports || []).map(String));
        setTaggedVlans((lagConfig?.tagged_vlans || []).map(String));

        api.getVlans(showId)
            .then(vlans => {
                setAvailableVlans(vlans.map(v => ({ value: String(v.tag), label: `${v.tag} - ${v.name}` })));
                setPvid(lagConfig?.pvid ? String(lagConfig.pvid) : '');
            })
            .catch(error => {
                toast.error("Failed to load available VLANs");
                console.error("Failed to load VLANs:", error);
            });
    }, [isOpen, lagConfig, showId]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (memberPorts.length < 2) {
            toast.error("A LAG needs at least 2 member ports.");
            return;
        }
        onSave(lagId, {
            lag_name: lagName,
            member_ports: memberPorts.map(p => parseInt(p, 10)),
            pvid: pvid ? parseInt(pvid, 10) : null,
            tagged_vlans: taggedVlans.map(v => parseInt(v, 10)),
        });
    };

    const portOptions = availablePorts.map(p => ({ value: String(p), label: `Port ${p}` }));

    const vlanSelectOptions = [...availableVlans];
    taggedVlans.forEach(tv => {
        if (!vlanSelectOptions.find(v => v.value === String(tv))) {
            vlanSelectOptions.push({ value: String(tv), label: `${tv} (Deleted VLAN)` });
        }
    });

    const pvidOptions = [{ value: '', label: 'None (Untagged)' }, ...availableVlans];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? `Edit LAG ${lagId}` : `New LAG ${lagId}`} maxWidth="max-w-lg">
            <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                    <InputField
                        ref={nameRef}
                        label="LAG Name / Description"
                        value={lagName}
                        onChange={(e) => setLagName(e.target.value)}
                        placeholder="e.g., Uplink"
                    />

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Member Ports</label>
                        <MultiSelect
                            options={portOptions}
                            selected={memberPorts}
                            onChange={setMemberPorts}
                            placeholder="Select at least 2 ports..."
                        />
                    </div>

                    <SelectField
                        label="PVID (Untagged VLAN)"
                        value={pvid}
                        onChange={(e) => setPvid(e.target.value)}
                        options={pvidOptions}
                    />

                    <MultiSelect
                        label="Tagged VLANs"
                        options={vlanSelectOptions}
                        selected={taggedVlans}
                        onChange={setTaggedVlans}
                        placeholder="Select tagged VLANs..."
                    />
                </div>

                <div className="flex justify-between mt-6">
                    {isEditMode ? (
                        <button
                            type="button"
                            onClick={() => onDelete(lagId)}
                            className="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-600"
                        >
                            Delete LAG
                        </button>
                    ) : <span />}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                        >
                            Save LAG
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default LagConfigModal;
