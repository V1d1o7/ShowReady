/**
 * Shared helper functions for managing Network IP assignments across the frontend.
 */

export const IPV4_REGEX = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

export const isValidIpv4 = (ip) => Boolean(ip && IPV4_REGEX.test(String(ip).trim()));

/**
 * Builds a location string for rack equipment.
 */
export const buildRackLocation = (rackName, ruPosition) => {
    if (!rackName || ruPosition === null || ruPosition === undefined || ruPosition === '') return '';
    return `${rackName}.${ruPosition}`;
};

/**
 * Parses legacy placeholder strings like 10.12.TRK.12.
 * This keeps placeholder support out of the real ip_address field.
 */
export const parseLegacyTrunkPlaceholder = (value) => {
    if (!value) return null;
    const text = String(value).trim();
    const match = text.match(/^([0-9]{1,3})\.([0-9]{1,3})\.TRK\.([0-9]{1,3})$/i);
    if (!match) return null;

    const first = Number(match[1]);
    const second = Number(match[2]);
    const hostOctet = Number(match[3]);

    if (first < 0 || first > 255 || second < 0 || second > 255 || hostOctet < 1 || hostOctet > 254) {
        return null;
    }

    return {
        assignment_type: 'trunk',
        trunk_mode: 'all',
        trunk_label: text,
        host_octet: hostOctet,
    };
};

/**
 * Produces the user-facing network assignment label.
 * Real IPs stay in ip_address/ip_end; trunk placeholders stay display-only.
 */
export const formatNetworkAssignment = (entry) => {
    if (!entry) return '';

    if (entry.assignment_type === 'trunk') {
        if (entry.trunk_label) return entry.trunk_label;
        if (entry.host_octet) {
            return `${entry.trunk_mode === 'selected' ? 'Selected VLANs' : 'All VLANs'} / Host .${entry.host_octet}`;
        }
        return entry.trunk_mode === 'selected' ? 'TRK / Selected VLANs' : 'TRK / All VLANs';
    }

    if (entry.assignment_type === 'range' && entry.ip_address && entry.ip_end) {
        return `${entry.ip_address} – ${entry.ip_end}`;
    }

    return entry.ip_address || '';
};

/**
 * Finds the network IP entry for a specific equipment instance.
 */
export const getNetworkIpForEquipment = (networkIps, equipmentId) => {
    if (!networkIps || !equipmentId) return null;
    return networkIps.find(ip =>
        ip.entity_type === 'rack_equipment' &&
        ip.entity_id === equipmentId
    ) || null;
};

/**
 * Merges canonical network assignment data into a rack equipment item.
 *
 * Normal display does not fall back to legacy rack_equipment_instances.ip_address.
 * Legacy fallback is only for the transitional import path.
 */
export const mergeNetworkIpIntoEquipment = (item, networkIps, { includeLegacyFallback = false } = {}) => {
    if (!item) return item;
    const networkEntry = getNetworkIpForEquipment(networkIps, item.id);

    const legacyEntry = includeLegacyFallback && item.ip_address
        ? { assignment_type: 'single', ip_address: item.ip_address }
        : null;

    const effectiveEntry = networkEntry || legacyEntry;
    const isRealIpAssignment = !effectiveEntry || effectiveEntry.assignment_type !== 'trunk';

    return {
        ...item,
        ip_address: effectiveEntry && isRealIpAssignment ? effectiveEntry.ip_address : null,
        network_assignment_display: formatNetworkAssignment(effectiveEntry),
        network_metadata: networkEntry ? {
            id: networkEntry.id,
            assignment_type: networkEntry.assignment_type || 'single',
            ip_end: networkEntry.ip_end,
            trunk_mode: networkEntry.trunk_mode,
            trunk_vlan_ids: networkEntry.trunk_vlan_ids || [],
            trunk_label: networkEntry.trunk_label,
            host_octet: networkEntry.host_octet,
            mac_address: networkEntry.mac_address,
            department: networkEntry.department,
            location: networkEntry.location,
            status: networkEntry.status,
            notes: networkEntry.notes,
            vlan_id: networkEntry.vlan_id,
        } : null,
    };
};

/**
 * Merges network IPs into an entire racks array.
 */
export const mergeNetworkIpsIntoRackData = (racks, networkIps, options = {}) => {
    if (!racks) return [];
    if (!networkIps) return racks;

    return racks.map(rack => ({
        ...rack,
        equipment: (rack.equipment || []).map(item => mergeNetworkIpIntoEquipment(item, networkIps, options)),
    }));
};

/**
 * Builds a device label for display in the IP Manager.
 */
export const buildEquipmentDeviceLabel = (item, rackName) => {
    const instanceName = item.instance_name || item.name || 'Unnamed Instance';
    const modelNumber = item.equipment_templates?.model_number || item.equipment_templates?.name || 'Unknown Model';
    const rName = rackName || 'Unracked';
    return `${instanceName} / ${modelNumber} / ${rName}`;
};

/**
 * Common wrapper for upserting a rack equipment network assignment.
 */
export const upsertRackEquipmentNetworkIp = async ({
    api,
    showId,
    entityId,
    assignmentType = 'single',
    ipAddress,
    ipEnd,
    department,
    location,
    macAddress,
    trunkMode,
    trunkLabel,
    hostOctet,
    trunkVlanIds = [],
}) => {
    const payload = {
        entity_type: 'rack_equipment',
        entity_id: entityId,
        assignment_type: assignmentType,
        department: department || null,
        location: location || null,
        mac_address: macAddress || null,
    };

    if (assignmentType === 'trunk') {
        payload.ip_address = null;
        payload.ip_end = null;
        payload.trunk_mode = trunkMode || 'all';
        payload.trunk_label = trunkLabel || null;
        payload.host_octet = hostOctet || null;
        payload.trunk_vlan_ids = trunkVlanIds || [];
    } else if (assignmentType === 'range') {
        payload.ip_address = ipAddress || null;
        payload.ip_end = ipEnd || null;
        payload.trunk_mode = null;
        payload.trunk_label = null;
        payload.host_octet = null;
        payload.trunk_vlan_ids = [];
    } else {
        payload.ip_address = ipAddress || null;
        payload.ip_end = null;
        payload.trunk_mode = null;
        payload.trunk_label = null;
        payload.host_octet = null;
        payload.trunk_vlan_ids = [];
    }

    return await api.syncNetworkIpEntity(showId, payload);
};

/**
 * Common wrapper for clearing/deleting a rack equipment IP entry.
 */
export const clearRackEquipmentNetworkIp = async ({ api, showId, entityId }) => {
    return await api.deleteNetworkIpEntity(showId, 'rack_equipment', entityId);
};
