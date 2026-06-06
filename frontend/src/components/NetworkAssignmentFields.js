import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';

const normalizeTrunkVlanIds = (vlanIds) => {
    if (!Array.isArray(vlanIds)) return [];

    return vlanIds
        .filter(Boolean)
        .map(vlanId => String(vlanId));
};

const normalizeHostOctet = (value) => {
    if (value === '' || value === null || value === undefined) return null;

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 254) return null;

    return parsed;
};

export const emptyNetworkAssignment = {
    assignment_type: 'single',
    ip_address: '',
    ip_end: '',
    trunk_mode: 'all',
    trunk_label: '',
    host_octet: null,
    trunk_vlan_ids: [],
    department: '',
    location: '',
    mac_address: '',
};

export const hydrateNetworkAssignment = (item = {}) => {
    const metadata = item.network_metadata || {};

    return {
        assignment_type: metadata.assignment_type || (item.ip_address ? 'single' : 'single'),
        ip_address: metadata.assignment_type === 'trunk'
            ? ''
            : metadata.ip_address || item.ip_address || '',
        ip_end: metadata.ip_end || '',
        trunk_mode: metadata.trunk_mode || 'all',
        trunk_label: metadata.trunk_label || '',
        host_octet: normalizeHostOctet(metadata.host_octet),
        trunk_vlan_ids: normalizeTrunkVlanIds(metadata.trunk_vlan_ids),
        department: metadata.department || '',
        location: metadata.location || '',
        mac_address: metadata.mac_address || '',
    };
};

export const buildNetworkAssignmentPayload = (assignment) => {
    const assignmentType = assignment.assignment_type || 'single';
    const trunkMode = assignment.trunk_mode || 'all';

    const basePayload = {
        assignment_type: assignmentType,
        department: assignment.department || null,
        location: assignment.location || null,
        mac_address: assignment.mac_address || null,
    };

    if (assignmentType === 'trunk') {
        return {
            ...basePayload,
            ip_address: null,
            ip_end: null,
            trunk_mode: trunkMode,
            trunk_label: assignment.trunk_label || null,
            host_octet: normalizeHostOctet(assignment.host_octet),
            trunk_vlan_ids: trunkMode === 'selected'
                ? normalizeTrunkVlanIds(assignment.trunk_vlan_ids)
                : [],
        };
    }

    if (assignmentType === 'range') {
        return {
            ...basePayload,
            ip_address: assignment.ip_address || null,
            ip_end: assignment.ip_end || null,
            trunk_mode: null,
            trunk_label: null,
            host_octet: null,
            trunk_vlan_ids: [],
        };
    }

    return {
        ...basePayload,
        ip_address: assignment.ip_address || null,
        ip_end: null,
        trunk_mode: null,
        trunk_label: null,
        host_octet: null,
        trunk_vlan_ids: [],
    };
};

const fieldClassName = "w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm";
const readOnlyFieldClassName = "w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 text-gray-300 sm:text-sm cursor-not-allowed";
const labelClassName = "block text-sm font-medium text-gray-300 mb-1";

const NetworkAssignmentFields = ({
    value,
    onChange,
    showLocation = true,
    locationMode = 'editable',
    locationPlaceholder = 'VID-ENG.12',
    locationHelpText = '',
    className = '',
}) => {
    const showContext = useShow() || {};
    const { showId } = showContext;

    const [vlans, setVlans] = useState([]);
    const [isLoadingVlans, setIsLoadingVlans] = useState(false);
    const [vlanLoadError, setVlanLoadError] = useState('');

    const assignment = {
        ...emptyNetworkAssignment,
        ...(value || {}),
        host_octet: normalizeHostOctet(value?.host_octet),
        trunk_vlan_ids: normalizeTrunkVlanIds(value?.trunk_vlan_ids),
    };

    const effectiveLocationMode = showLocation === false ? 'hidden' : locationMode;

    useEffect(() => {
        if (!showId || assignment.assignment_type !== 'trunk') return;

        let isMounted = true;

        const fetchVlans = async () => {
            setIsLoadingVlans(true);
            setVlanLoadError('');

            try {
                const data = await api.getVlans(showId);
                if (isMounted) setVlans(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error('Failed to load VLANs for network assignment:', err);

                if (isMounted) {
                    setVlans([]);
                    setVlanLoadError(err.message || 'Failed to load VLANs.');
                }
            } finally {
                if (isMounted) setIsLoadingVlans(false);
            }
        };

        fetchVlans();

        return () => {
            isMounted = false;
        };
    }, [showId, assignment.assignment_type]);

    const sortedVlans = useMemo(() => {
        return [...vlans].sort((a, b) => {
            const tagA = Number(a.tag);
            const tagB = Number(b.tag);

            if (!Number.isNaN(tagA) && !Number.isNaN(tagB) && tagA !== tagB) {
                return tagA - tagB;
            }

            return String(a.name || '').localeCompare(String(b.name || ''));
        });
    }, [vlans]);

    const selectedVlanSet = useMemo(() => {
        return new Set(normalizeTrunkVlanIds(assignment.trunk_vlan_ids));
    }, [assignment.trunk_vlan_ids]);

    const selectedVlanLabels = useMemo(() => {
        if (selectedVlanSet.size === 0) return [];

        return sortedVlans
            .filter(vlan => selectedVlanSet.has(String(vlan.id)))
            .map(vlan => `${vlan.tag} ${vlan.name}`);
    }, [selectedVlanSet, sortedVlans]);

    const updateFields = (updates) => {
        onChange({
            ...assignment,
            ...updates,
        });
    };

    const updateField = (field, fieldValue) => {
        const next = {
            ...assignment,
            [field]: fieldValue,
        };

        if (field === 'assignment_type') {
            if (fieldValue === 'single') {
                next.ip_end = '';
                next.trunk_mode = 'all';
                next.trunk_label = '';
                next.host_octet = null;
                next.trunk_vlan_ids = [];
            }

            if (fieldValue === 'range') {
                next.trunk_mode = 'all';
                next.trunk_label = '';
                next.host_octet = null;
                next.trunk_vlan_ids = [];
            }

            if (fieldValue === 'trunk') {
                next.ip_address = '';
                next.ip_end = '';
                next.trunk_mode = next.trunk_mode || 'all';
                next.host_octet = normalizeHostOctet(next.host_octet);
                next.trunk_vlan_ids = normalizeTrunkVlanIds(next.trunk_vlan_ids);
            }
        }

        onChange(next);
    };

    const handleTrunkModeChange = (mode) => {
        updateFields({
            trunk_mode: mode,
            trunk_vlan_ids: mode === 'selected' ? assignment.trunk_vlan_ids : [],
        });
    };

    const handleToggleVlan = (vlanId) => {
        const normalizedId = String(vlanId);
        const nextVlanIds = selectedVlanSet.has(normalizedId)
            ? assignment.trunk_vlan_ids.filter(id => String(id) !== normalizedId)
            : [...assignment.trunk_vlan_ids, normalizedId];

        updateField('trunk_vlan_ids', nextVlanIds);
    };

    return (
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${className}`}>
            <div>
                <label className={labelClassName}>Assignment Type</label>
                <select
                    value={assignment.assignment_type}
                    onChange={(e) => updateField('assignment_type', e.target.value)}
                    className={fieldClassName}
                >
                    <option value="single">Single IP</option>
                    <option value="range">IP Range</option>
                    <option value="trunk">Trunk / Multi-VLAN</option>
                </select>
            </div>

            {assignment.assignment_type !== 'trunk' && (
                <div>
                    <label className={labelClassName}>IP Address</label>
                    <input
                        type="text"
                        value={assignment.ip_address}
                        onChange={(e) => updateField('ip_address', e.target.value)}
                        placeholder="192.168.1.50"
                        className={fieldClassName}
                    />
                </div>
            )}

            {assignment.assignment_type === 'range' && (
                <div>
                    <label className={labelClassName}>IP End</label>
                    <input
                        type="text"
                        value={assignment.ip_end}
                        onChange={(e) => updateField('ip_end', e.target.value)}
                        placeholder="192.168.1.60"
                        className={fieldClassName}
                    />
                </div>
            )}

            {assignment.assignment_type === 'trunk' && (
                <>
                    <div>
                        <label className={labelClassName}>Trunk Mode</label>
                        <select
                            value={assignment.trunk_mode}
                            onChange={(e) => handleTrunkModeChange(e.target.value)}
                            className={fieldClassName}
                        >
                            <option value="all">All VLANs</option>
                            <option value="selected">Selected VLANs</option>
                        </select>
                    </div>

                    <div>
                        <label className={labelClassName}>Host Octet</label>
                        <input
                            type="number"
                            min="1"
                            max="254"
                            value={assignment.host_octet ?? ''}
                            onChange={(e) => updateField('host_octet', normalizeHostOctet(e.target.value))}
                            placeholder="101"
                            className={fieldClassName}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Used to describe the matching host address across VLANs, e.g. 10.show.VLAN.101.
                        </p>
                    </div>

                    {assignment.trunk_mode === 'selected' && (
                        <div className="sm:col-span-2">
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <label className={labelClassName}>Selected VLANs</label>

                                {selectedVlanSet.size > 0 && (
                                    <span className="text-xs text-gray-400">
                                        {selectedVlanSet.size} selected
                                    </span>
                                )}
                            </div>

                            <div className="border border-gray-700 rounded-md bg-gray-900/50 p-3 max-h-44 overflow-y-auto">
                                {isLoadingVlans ? (
                                    <p className="text-sm text-gray-400">Loading VLANs...</p>
                                ) : vlanLoadError ? (
                                    <p className="text-sm text-red-400">{vlanLoadError}</p>
                                ) : sortedVlans.length === 0 ? (
                                    <p className="text-sm text-gray-400">
                                        No VLANs have been created for this show yet. Add them in VLAN Management first.
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {sortedVlans.map(vlan => {
                                            const vlanId = String(vlan.id);

                                            return (
                                                <label
                                                    key={vlan.id}
                                                    className="flex items-center gap-2 text-sm text-gray-200 bg-gray-800/80 border border-gray-700 rounded px-3 py-2 hover:bg-gray-700 cursor-pointer"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedVlanSet.has(vlanId)}
                                                        onChange={() => handleToggleVlan(vlanId)}
                                                        className="rounded bg-gray-700 border-gray-500 text-amber-500 focus:ring-amber-500"
                                                    />

                                                    <span className="font-mono text-gray-300">{vlan.tag}</span>
                                                    <span className="truncate">{vlan.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {selectedVlanLabels.length > 0 && (
                                <p className="text-xs text-gray-500 mt-2">
                                    Selected: {selectedVlanLabels.join(', ')}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="sm:col-span-2">
                        <label className={labelClassName}>Trunk Label</label>
                        <input
                            type="text"
                            value={assignment.trunk_label}
                            onChange={(e) => updateField('trunk_label', e.target.value)}
                            placeholder="TRK / All VLANs, VLANs 20/30/40 host .101, Video Trunk, etc."
                            className={fieldClassName}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Optional display override. Leave blank to auto-label from trunk mode and host octet.
                        </p>
                    </div>
                </>
            )}

            <div>
                <label className={labelClassName}>Department</label>
                <input
                    type="text"
                    value={assignment.department}
                    onChange={(e) => updateField('department', e.target.value)}
                    placeholder="Video, LX, Audio, Automation, Vendor, etc."
                    className={fieldClassName}
                />
            </div>

            {effectiveLocationMode !== 'hidden' && (
                <div>
                    <label className={labelClassName}>Location</label>

                    {effectiveLocationMode === 'readonly' ? (
                        <>
                            <input
                                type="text"
                                value={assignment.location || ''}
                                readOnly
                                className={readOnlyFieldClassName}
                            />

                            <p className="text-xs text-gray-500 mt-1">
                                {locationHelpText || 'Location is pulled from the racked equipment position.'}
                            </p>
                        </>
                    ) : (
                        <input
                            type="text"
                            value={assignment.location}
                            onChange={(e) => updateField('location', e.target.value)}
                            placeholder={locationPlaceholder}
                            className={fieldClassName}
                        />
                    )}
                </div>
            )}

            <div>
                <label className={labelClassName}>MAC Address</label>
                <input
                    type="text"
                    value={assignment.mac_address}
                    onChange={(e) => updateField('mac_address', e.target.value)}
                    placeholder="00:00:00:00:00:00"
                    className={fieldClassName}
                />
            </div>
        </div>
    );
};

export default NetworkAssignmentFields;