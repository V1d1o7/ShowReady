import React from 'react';

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
        host_octet: metadata.host_octet ?? null,
        trunk_vlan_ids: metadata.trunk_vlan_ids || [],
        department: metadata.department || '',
        location: metadata.location || '',
        mac_address: metadata.mac_address || '',
    };
};

export const buildNetworkAssignmentPayload = (assignment) => {
    const assignmentType = assignment.assignment_type || 'single';

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
            trunk_mode: assignment.trunk_mode || 'all',
            trunk_label: assignment.trunk_label || null,
            host_octet: assignment.host_octet ?? null,
            trunk_vlan_ids: assignment.trunk_vlan_ids || [],
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
    const assignment = {
        ...emptyNetworkAssignment,
        ...(value || {}),
    };

    const effectiveLocationMode = showLocation === false ? 'hidden' : locationMode;

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
                next.host_octet = null;
                next.trunk_vlan_ids = next.trunk_vlan_ids || [];
            }
        }

        onChange(next);
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
                            onChange={(e) => updateField('trunk_mode', e.target.value)}
                            className={fieldClassName}
                        >
                            <option value="all">All VLANs</option>
                            <option value="selected" disabled>Selected VLANs (coming soon)</option>
                        </select>
                    </div>

                    <div className="sm:col-span-2">
                        <label className={labelClassName}>Trunk Label</label>
                        <input
                            type="text"
                            value={assignment.trunk_label}
                            onChange={(e) => updateField('trunk_label', e.target.value)}
                            placeholder="TRK / All VLANs, 10.12.TRK, Video Trunk, etc."
                            className={fieldClassName}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Display label for this trunk assignment. This is not stored as a real IP address.
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