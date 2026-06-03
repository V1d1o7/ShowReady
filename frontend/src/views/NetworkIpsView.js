import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useShow } from '../contexts/ShowContext';
import { useModal } from '../contexts/ModalContext';
import { useToast } from '../contexts/ToastContext';
import { api } from '../api/api';
import { Plus, Edit, Trash2, Columns, GripVertical, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import {
    buildRackLocation,
    buildEquipmentDeviceLabel,
    formatNetworkAssignment,
    getNetworkIpForEquipment,
    isValidIpv4,
} from '../utils/networkIpHelpers';
import Modal from '../components/Modal';
import NetworkAssignmentFields, {
    emptyNetworkAssignment,
    buildNetworkAssignmentPayload,
} from '../components/NetworkAssignmentFields';

const initialFormState = {
    entity_type: 'rack_equipment',
    entity_id: '',
};

const NETWORK_IP_COLUMNS_STORAGE_KEY = 'showready.networkIps.columnPrefs.v2';
const NETWORK_IP_SORT_STORAGE_KEY = 'showready.networkIps.sortPrefs.v1';

const DEFAULT_COLUMN_PREFS = [
    { id: 'assignment', label: 'Assignment', visible: true, canHide: true, sortable: true },
    { id: 'assignment_type', label: 'Type', visible: true, canHide: true, sortable: true },
    { id: 'ip_end', label: 'IP End', visible: true, canHide: true, sortable: true },
    { id: 'device_name', label: 'Device Name', visible: true, canHide: true, sortable: true },
    { id: 'department', label: 'Department', visible: true, canHide: true, sortable: true },
    { id: 'location', label: 'Location', visible: true, canHide: true, sortable: true },
    { id: 'entity_type', label: 'Entity Type', visible: true, canHide: true, sortable: true },
    { id: 'mac_address', label: 'MAC Address', visible: false, canHide: true, sortable: true },
    { id: 'status', label: 'Status', visible: true, canHide: true, sortable: true },
    { id: 'actions', label: 'Actions', visible: true, canHide: false, sortable: false },
];

const DEFAULT_SORT_PREFS = {
    key: 'location',
    direction: 'asc',
};

const naturalCollator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
});

const isTypingTarget = (target) => {
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
};

const normalizeBlank = (value) => value === '' ? null : value;

const getDefaultColumnPrefs = () => DEFAULT_COLUMN_PREFS.map(column => ({ ...column }));

const hydrateColumnPrefs = (savedPrefs) => {
    const defaultById = new Map(DEFAULT_COLUMN_PREFS.map(column => [column.id, column]));
    const usedIds = new Set();
    const hydrated = [];

    if (Array.isArray(savedPrefs)) {
        savedPrefs.forEach(savedColumn => {
            const defaultColumn = defaultById.get(savedColumn?.id);
            if (!defaultColumn || usedIds.has(defaultColumn.id)) return;

            hydrated.push({
                ...defaultColumn,
                visible: defaultColumn.canHide === false ? true : savedColumn.visible !== false,
            });

            usedIds.add(defaultColumn.id);
        });
    }

    DEFAULT_COLUMN_PREFS.forEach(defaultColumn => {
        if (!usedIds.has(defaultColumn.id)) {
            hydrated.push({ ...defaultColumn });
        }
    });

    return hydrated;
};

const loadColumnPrefs = () => {
    if (typeof window === 'undefined') return getDefaultColumnPrefs();

    try {
        const saved = window.localStorage.getItem(NETWORK_IP_COLUMNS_STORAGE_KEY);
        if (!saved) return getDefaultColumnPrefs();
        return hydrateColumnPrefs(JSON.parse(saved));
    } catch (err) {
        console.warn('Failed to load Network IP column preferences:', err);
        return getDefaultColumnPrefs();
    }
};

const loadSortPrefs = () => {
    if (typeof window === 'undefined') return DEFAULT_SORT_PREFS;

    try {
        const saved = window.localStorage.getItem(NETWORK_IP_SORT_STORAGE_KEY);
        if (!saved) return DEFAULT_SORT_PREFS;

        const parsed = JSON.parse(saved);
        const validColumn = DEFAULT_COLUMN_PREFS.find(column => column.id === parsed?.key && column.sortable !== false);
        const validDirection = parsed?.direction === 'desc' ? 'desc' : 'asc';

        if (!validColumn) return DEFAULT_SORT_PREFS;

        return {
            key: parsed.key,
            direction: validDirection,
        };
    } catch (err) {
        console.warn('Failed to load Network IP sort preferences:', err);
        return DEFAULT_SORT_PREFS;
    }
};

const hydrateNetworkAssignmentFromEntry = (entry = {}) => ({
    assignment_type: entry.assignment_type || (entry.ip_end ? 'range' : 'single'),
    ip_address: entry.assignment_type === 'trunk' ? '' : entry.ip_address || '',
    ip_end: entry.ip_end || '',
    trunk_mode: entry.trunk_mode || 'all',
    trunk_label: entry.trunk_label || '',
    host_octet: entry.host_octet ?? null,
    trunk_vlan_ids: entry.trunk_vlan_ids || [],
    department: entry.department || '',
    location: entry.location || '',
    mac_address: entry.mac_address || '',
});

const NetworkIpsView = () => {
    const { showId, racks, networkIps = [], refreshNetworkIps } = useShow();
    const { showConfirmationModal } = useModal();
    const { addToast } = useToast();

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingIp, setEditingIp] = useState(null);
    const [formData, setFormData] = useState(initialFormState);
    const [networkAssignment, setNetworkAssignment] = useState(emptyNetworkAssignment);

    const [showColDropdown, setShowColDropdown] = useState(false);
    const [columnPrefs, setColumnPrefs] = useState(loadColumnPrefs);
    const [sortPrefs, setSortPrefs] = useState(loadSortPrefs);
    const [draggingColumnId, setDraggingColumnId] = useState(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        try {
            window.localStorage.setItem(NETWORK_IP_COLUMNS_STORAGE_KEY, JSON.stringify(columnPrefs));
        } catch (err) {
            console.warn('Failed to save Network IP column preferences:', err);
        }
    }, [columnPrefs]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        try {
            window.localStorage.setItem(NETWORK_IP_SORT_STORAGE_KEY, JSON.stringify(sortPrefs));
        } catch (err) {
            console.warn('Failed to save Network IP sort preferences:', err);
        }
    }, [sortPrefs]);

    /**
     * Used for Existing Equipment selector and device label resolution.
     * Includes unracked equipment so users can still assign IPs without a rack location.
     */
    const equipmentList = useMemo(() => {
        if (!racks) return [];

        const items = [];

        racks.forEach(rack => {
            const rackName = rack.rack_name || rack.name || 'Unknown Rack';
            const isUnracked = rackName === '[Unracked]';
            const rackItems = rack.equipment || rack.rack_items || [];

            rackItems.forEach(item => {
                const template = item.equipment_templates || {};
                const supportsIp = template.has_ip_address === true;
                const networkEntry = getNetworkIpForEquipment(networkIps, item.id);

                if (!supportsIp && !networkEntry) return;

                const instanceName = item.instance_name || item.name || 'Unnamed Instance';
                const modelNumber = template.model_number || template.name || 'Unknown Model';
                const ruPosition = item.ru_position ?? item.u_position ?? '';
                const derivedLocation = isUnracked ? '' : buildRackLocation(rackName, ruPosition);

                items.push({
                    id: item.id,
                    instanceName,
                    modelNumber,
                    rackName: isUnracked ? 'Unracked' : rackName,
                    ruPosition,
                    isUnracked,
                    currentAssignment: networkEntry || null,
                    currentDisplay: formatNetworkAssignment(networkEntry),

                    // Device name only. Used by the IP table Device Name column.
                    deviceName: instanceName,

                    // Full label. Used by selectors where model/location context is helpful.
                    displayLabel: buildEquipmentDeviceLabel(
                        item,
                        isUnracked ? 'Unracked' : rackName
                    ),

                    location: derivedLocation,
                });
            });
        });

        return items.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
    }, [racks, networkIps]);

    const selectedEquipment = useMemo(() => {
        if (!formData.entity_id) return null;
        return equipmentList.find(item => item.id === formData.entity_id) || null;
    }, [equipmentList, formData.entity_id]);

    const isRackedEquipmentLocation = Boolean(
        formData.entity_type === 'rack_equipment'
        && selectedEquipment
        && !selectedEquipment.isUnracked
        && selectedEquipment.location
    );

    const effectiveNetworkAssignment = useMemo(() => {
        if (!isRackedEquipmentLocation) return networkAssignment;

        return {
            ...networkAssignment,
            location: selectedEquipment.location,
        };
    }, [networkAssignment, selectedEquipment, isRackedEquipmentLocation]);

    const getEquipmentForIp = useCallback((ipEntry) => {
        if (ipEntry.entity_type !== 'rack_equipment' || !ipEntry.entity_id) return null;
        return equipmentList.find(e => e.id === ipEntry.entity_id) || null;
    }, [equipmentList]);

    const getDeviceName = useCallback((ipEntry) => {
        if (ipEntry.entity_type === 'reservation') return 'Reservation Block';

        const eq = getEquipmentForIp(ipEntry);
        if (eq) return eq.deviceName || eq.instanceName || '-';

        return '-';
    }, [getEquipmentForIp]);

    const getSortValue = useCallback((ipEntry, columnId) => {
        const eq = getEquipmentForIp(ipEntry);

        switch (columnId) {
            case 'assignment':
                return formatNetworkAssignment(ipEntry) || '';

            case 'assignment_type':
                return ipEntry.assignment_type || 'single';

            case 'ip_end':
                return ipEntry.ip_end || '';

            case 'device_name':
                return getDeviceName(ipEntry);

            case 'department':
                return ipEntry.department || '';

            case 'location':
                return ipEntry.location || eq?.location || '';

            case 'entity_type':
                return ipEntry.entity_type || '';

            case 'mac_address':
                return ipEntry.mac_address || '';

            case 'status':
                return ipEntry.status || '';

            default:
                return '';
        }
    }, [getDeviceName, getEquipmentForIp]);

    const sortedNetworkIps = useMemo(() => {
        const sortableColumn = DEFAULT_COLUMN_PREFS.find(column => column.id === sortPrefs.key && column.sortable !== false);
        if (!sortableColumn) return [...networkIps];

        return [...networkIps].sort((a, b) => {
            const primaryA = getSortValue(a, sortPrefs.key);
            const primaryB = getSortValue(b, sortPrefs.key);

            let result = naturalCollator.compare(String(primaryA || ''), String(primaryB || ''));

            if (result === 0 && sortPrefs.key !== 'location') {
                result = naturalCollator.compare(
                    String(getSortValue(a, 'location') || ''),
                    String(getSortValue(b, 'location') || '')
                );
            }

            if (result === 0 && sortPrefs.key !== 'device_name') {
                result = naturalCollator.compare(
                    String(getSortValue(a, 'device_name') || ''),
                    String(getSortValue(b, 'device_name') || '')
                );
            }

            if (result === 0 && sortPrefs.key !== 'assignment') {
                result = naturalCollator.compare(
                    String(getSortValue(a, 'assignment') || ''),
                    String(getSortValue(b, 'assignment') || '')
                );
            }

            return sortPrefs.direction === 'desc' ? -result : result;
        });
    }, [networkIps, sortPrefs, getSortValue]);

    const fetchIps = useCallback(async ({ silent = false } = {}) => {
        if (!showId || !refreshNetworkIps) return;

        if (!silent) {
            setIsLoading(true);
        }

        setError(null);

        try {
            await refreshNetworkIps();
        } catch (err) {
            setError(err.message);
        } finally {
            if (!silent) {
                setIsLoading(false);
            }
        }
    }, [showId, refreshNetworkIps]);

    useEffect(() => {
        fetchIps();
    }, [fetchIps]);

    const hydrateFormFromEntry = (ip) => ({
        entity_type: ip.entity_type || 'rack_equipment',
        entity_id: ip.entity_id || '',
    });

    const handleOpenModal = useCallback((ip = null) => {
        if (ip) {
            setEditingIp(ip);
            setFormData(hydrateFormFromEntry(ip));
            setNetworkAssignment(hydrateNetworkAssignmentFromEntry(ip));
        } else {
            setEditingIp(null);
            setFormData(initialFormState);
            setNetworkAssignment(emptyNetworkAssignment);
        }

        setIsModalOpen(true);
    }, []);

    const handleCloseModal = useCallback(() => {
        setIsModalOpen(false);
        setEditingIp(null);
        setFormData(initialFormState);
        setNetworkAssignment(emptyNetworkAssignment);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (isTypingTarget(e.target)) return;

            if (e.key.toLowerCase() === 'n') {
                e.preventDefault();
                if (!isModalOpen) handleOpenModal();
            } else if (e.key === 'Escape') {
                if (isModalOpen) handleCloseModal();
                if (showColDropdown) setShowColDropdown(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isModalOpen, showColDropdown, handleOpenModal, handleCloseModal]);

    const visibleTableColumns = useMemo(() => {
        return columnPrefs.filter(column => column.visible || column.canHide === false);
    }, [columnPrefs]);

    const handleToggleColumn = (columnId) => {
        setColumnPrefs(prev => prev.map(column => {
            if (column.id !== columnId || column.canHide === false) return column;
            return { ...column, visible: !column.visible };
        }));
    };

    const handleMoveColumn = (columnId, direction) => {
        setColumnPrefs(prev => {
            const currentIndex = prev.findIndex(column => column.id === columnId);
            if (currentIndex === -1) return prev;

            const nextIndex = currentIndex + direction;
            if (nextIndex < 0 || nextIndex >= prev.length) return prev;

            const next = [...prev];
            const [movedColumn] = next.splice(currentIndex, 1);
            next.splice(nextIndex, 0, movedColumn);

            return next;
        });
    };

    const handleColumnDragStart = (e, columnId) => {
        setDraggingColumnId(columnId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', columnId);
    };

    const handleColumnDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleColumnDrop = (e, targetColumnId) => {
        e.preventDefault();

        const sourceColumnId = e.dataTransfer.getData('text/plain') || draggingColumnId;
        setDraggingColumnId(null);

        if (!sourceColumnId || sourceColumnId === targetColumnId) return;

        setColumnPrefs(prev => {
            const sourceIndex = prev.findIndex(column => column.id === sourceColumnId);
            const targetIndex = prev.findIndex(column => column.id === targetColumnId);

            if (sourceIndex === -1 || targetIndex === -1) return prev;

            const next = [...prev];
            const [movedColumn] = next.splice(sourceIndex, 1);
            next.splice(targetIndex, 0, movedColumn);

            return next;
        });
    };

    const handleResetColumns = () => {
        setColumnPrefs(getDefaultColumnPrefs());
    };

    const handleSortColumn = (column) => {
        if (!column || column.sortable === false) return;

        setSortPrefs(prev => {
            if (prev.key === column.id) {
                return {
                    key: column.id,
                    direction: prev.direction === 'asc' ? 'desc' : 'asc',
                };
            }

            return {
                key: column.id,
                direction: 'asc',
            };
        });
    };

    const renderSortIcon = (column) => {
        if (column.sortable === false) return null;

        if (sortPrefs.key !== column.id) {
            return <ArrowUpDown size={13} className="text-gray-500" />;
        }

        return sortPrefs.direction === 'asc'
            ? <ArrowUp size={13} className="text-amber-300" />
            : <ArrowDown size={13} className="text-amber-300" />;
    };

    const handleDeleteIp = (ipEntry) => {
        showConfirmationModal('Are you sure you want to delete this network assignment?', async () => {
            try {
                if (ipEntry.entity_type === 'rack_equipment' && ipEntry.entity_id) {
                    await api.deleteNetworkIpEntity(showId, 'rack_equipment', ipEntry.entity_id);

                    // Compatibility mirror cleanup only. network_ip_entries is canonical.
                    await api.updateEquipmentInstance(ipEntry.entity_id, { ip_address: null })
                        .catch(err => console.warn('Mirror cleanup failed', err));
                } else {
                    await api.deleteNetworkIp(showId, ipEntry.id);
                }

                addToast('Network assignment deleted successfully', 'success');
                await fetchIps({ silent: true });
            } catch (err) {
                addToast(`Failed to delete network assignment: ${err.message}`, 'error');
            }
        });
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;

        setFormData(prev => {
            const next = { ...prev, [name]: value };

            if (name === 'entity_type') {
                next.entity_id = value === 'reservation' ? '' : prev.entity_id;

                if (value === 'reservation' && networkAssignment.assignment_type === 'trunk') {
                    setNetworkAssignment(current => ({
                        ...current,
                        assignment_type: 'single',
                        trunk_mode: 'all',
                        trunk_label: '',
                        host_octet: null,
                        trunk_vlan_ids: [],
                    }));
                }
            }

            return next;
        });
    };

    const handleEquipmentChange = (e) => {
        const selectedId = e.target.value;
        const eq = equipmentList.find(item => item.id === selectedId);
        const assignment = eq?.currentAssignment;

        setFormData(prev => ({
            ...prev,
            entity_id: selectedId,
        }));

        if (assignment) {
            const hydrated = hydrateNetworkAssignmentFromEntry(assignment);

            setNetworkAssignment({
                ...hydrated,
                location: eq?.location || hydrated.location || '',
            });
        } else {
            setNetworkAssignment(prev => ({
                ...prev,
                location: eq?.location || '',
            }));
        }
    };

    const buildPayload = () => {
        const assignmentPayload = buildNetworkAssignmentPayload(effectiveNetworkAssignment);

        const payload = {
            ...assignmentPayload,
            entity_type: formData.entity_type,
            entity_id: formData.entity_type === 'reservation' ? null : formData.entity_id,
        };

        if (payload.entity_type === 'reservation') {
            payload.status = 'reserved';
        } else if (payload.entity_type === 'rack_equipment') {
            payload.status = 'assigned';
        }

        if (isRackedEquipmentLocation) {
            payload.location = selectedEquipment.location;
        }

        Object.keys(payload).forEach(key => {
            payload[key] = normalizeBlank(payload[key]);
        });

        return payload;
    };

    const validatePayload = () => {
        const assignmentType = effectiveNetworkAssignment.assignment_type || 'single';

        if (formData.entity_type === 'rack_equipment' && !formData.entity_id) {
            addToast('Please select existing equipment.', 'error');
            return false;
        }

        if (formData.entity_type === 'reservation' && assignmentType === 'trunk') {
            addToast('Reservation blocks cannot use trunk assignments.', 'error');
            return false;
        }

        if (assignmentType === 'single') {
            if (!effectiveNetworkAssignment.ip_address) {
                addToast('IP Address is required for single IP assignments.', 'error');
                return false;
            }

            if (!isValidIpv4(effectiveNetworkAssignment.ip_address)) {
                addToast('Invalid IP Address format.', 'error');
                return false;
            }
        }

        if (assignmentType === 'range') {
            if (!effectiveNetworkAssignment.ip_address || !effectiveNetworkAssignment.ip_end) {
                addToast('IP Address and IP End are required for range assignments.', 'error');
                return false;
            }

            if (!isValidIpv4(effectiveNetworkAssignment.ip_address) || !isValidIpv4(effectiveNetworkAssignment.ip_end)) {
                addToast('Invalid range IP format.', 'error');
                return false;
            }
        }

        if (assignmentType === 'trunk' && !effectiveNetworkAssignment.trunk_mode) {
            addToast('Trunk Mode is required.', 'error');
            return false;
        }

        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validatePayload()) return;

        const payload = buildPayload();

        if (payload.entity_type === 'rack_equipment' && payload.entity_id) {
            try {
                await api.syncNetworkIpEntity(showId, {
                    entity_type: 'rack_equipment',
                    entity_id: payload.entity_id,
                    assignment_type: payload.assignment_type,
                    ip_address: payload.ip_address,
                    ip_end: payload.ip_end,
                    trunk_mode: payload.trunk_mode,
                    trunk_label: payload.trunk_label,
                    host_octet: payload.host_octet,
                    trunk_vlan_ids: payload.trunk_vlan_ids || [],
                    department: payload.department,
                    location: payload.location,
                    mac_address: payload.mac_address,
                    status: payload.status,
                });

                // Compatibility mirror only.
                // Only a real single IP belongs in rack_equipment_instances.ip_address.
                await api.updateEquipmentInstance(payload.entity_id, {
                    ip_address: payload.assignment_type === 'single' ? payload.ip_address : null,
                });

                addToast('Network assignment synced successfully', 'success');
                await fetchIps({ silent: true });
                handleCloseModal();
            } catch (err) {
                console.error('Failed to sync network assignment:', err);
                addToast(`Failed to update rack equipment assignment: ${err.message}`, 'error');
            }

            return;
        }

        try {
            if (editingIp) {
                await api.updateNetworkIp(showId, editingIp.id, payload);
                addToast('Network assignment updated successfully', 'success');
            } else {
                await api.createNetworkIp(showId, payload);
                addToast('Network assignment created successfully', 'success');
            }

            await fetchIps({ silent: true });
            handleCloseModal();
        } catch (err) {
            const action = editingIp ? 'update' : 'create';
            addToast(`Failed to ${action} network assignment: ${err.message}`, 'error');
        }
    };

    const getStatusBadgeClass = (status) => {
        switch (status) {
            case 'assigned':
                return 'bg-green-900 text-green-300';
            case 'reserved':
                return 'bg-yellow-900 text-yellow-300';
            case 'conflict':
                return 'bg-red-900 text-red-300';
            case 'offline':
                return 'bg-gray-700 text-gray-300';
            default:
                return 'bg-gray-700 text-gray-300';
        }
    };

    const renderColumnCell = (columnId, ip) => {
        switch (columnId) {
            case 'assignment':
                return (
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-white">
                        {formatNetworkAssignment(ip) || '-'}
                    </td>
                );

            case 'assignment_type':
                return (
                    <td className="px-6 py-4 whitespace-nowrap text-gray-300 capitalize">
                        {(ip.assignment_type || 'single').replace('_', ' ')}
                    </td>
                );

            case 'ip_end':
                return (
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-gray-400">
                        {ip.assignment_type === 'range' ? ip.ip_end || '-' : '-'}
                    </td>
                );

            case 'device_name':
                return (
                    <td className="px-6 py-4 whitespace-nowrap text-gray-300">
                        {getDeviceName(ip)}
                    </td>
                );

            case 'department':
                return (
                    <td className="px-6 py-4 whitespace-nowrap text-gray-300">
                        {ip.department || '-'}
                    </td>
                );

            case 'location':
                return (
                    <td className="px-6 py-4 whitespace-nowrap text-gray-300">
                        {ip.location || '-'}
                    </td>
                );

            case 'entity_type':
                return (
                    <td className="px-6 py-4 whitespace-nowrap text-gray-300 capitalize">
                        {ip.entity_type?.replace('_', ' ') || '-'}
                    </td>
                );

            case 'mac_address':
                return (
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-gray-400">
                        {ip.mac_address || '-'}
                    </td>
                );

            case 'status':
                return (
                    <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(ip.status)}`}>
                            {ip.status || '-'}
                        </span>
                    </td>
                );

            case 'actions':
                return (
                    <td
                        className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
                        onDoubleClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => handleOpenModal(ip)}
                                className="text-gray-400 hover:text-white"
                                aria-label="Edit network assignment"
                            >
                                <Edit size={18} />
                            </button>

                            <button
                                onClick={() => handleDeleteIp(ip)}
                                className="text-red-500 hover:text-red-400"
                                aria-label="Delete network assignment"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </td>
                );

            default:
                return null;
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 h-full flex flex-col">
            <header className="flex items-center justify-between mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Network IPs</h1>
                    <p className="text-sm text-gray-400 mt-1">
                        Track rack equipment IPs, ranges, reservations, and trunk/multi-VLAN assignments for this show.
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative">
                        <button
                            onClick={() => setShowColDropdown(!showColDropdown)}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm"
                        >
                            <Columns size={18} /> Columns
                        </button>

                        {showColDropdown && (
                            <div className="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 p-3">
                                <div className="flex items-start justify-between gap-3 border-b border-gray-700 pb-3 mb-3">
                                    <div>
                                        <p className="text-sm font-semibold text-white">Table Columns</p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Drag to reorder. Uncheck optional columns to hide them.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleResetColumns}
                                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
                                    >
                                        <RotateCcw size={14} /> Reset
                                    </button>
                                </div>

                                <div className="flex flex-col gap-1 max-h-96 overflow-y-auto pr-1">
                                    {columnPrefs.map((column, index) => (
                                        <div
                                            key={column.id}
                                            draggable
                                            onDragStart={(e) => handleColumnDragStart(e, column.id)}
                                            onDragOver={handleColumnDragOver}
                                            onDrop={(e) => handleColumnDrop(e, column.id)}
                                            onDragEnd={() => setDraggingColumnId(null)}
                                            className={`flex items-center gap-2 p-2 rounded border transition-colors ${
                                                draggingColumnId === column.id
                                                    ? 'bg-gray-700 border-amber-500/60 opacity-70'
                                                    : 'bg-gray-900/60 border-gray-700 hover:bg-gray-700'
                                            }`}
                                        >
                                            <GripVertical size={16} className="text-gray-500 cursor-grab shrink-0" />

                                            <input
                                                type="checkbox"
                                                checked={column.visible || column.canHide === false}
                                                disabled={column.canHide === false}
                                                onChange={() => handleToggleColumn(column.id)}
                                                className="rounded bg-gray-900 border-gray-600 text-amber-500 focus:ring-amber-500 disabled:opacity-50"
                                            />

                                            <span className="text-sm text-gray-200 flex-grow">{column.label}</span>

                                            {column.canHide === false && (
                                                <span className="text-[10px] uppercase tracking-wide text-gray-500">
                                                    Always visible
                                                </span>
                                            )}

                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveColumn(column.id, -1)}
                                                    disabled={index === 0}
                                                    className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400"
                                                    aria-label={`Move ${column.label} left`}
                                                >
                                                    ↑
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveColumn(column.id, 1)}
                                                    disabled={index === columnPrefs.length - 1}
                                                    className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400"
                                                    aria-label={`Move ${column.label} right`}
                                                >
                                                    ↓
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => handleOpenModal()}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors"
                    >
                        <Plus size={18} /> New IP Entry
                    </button>
                </div>
            </header>

            <div className="flex-grow overflow-y-auto bg-gray-800 rounded-lg shadow-md">
                {isLoading ? (
                    <div className="text-center py-16 text-gray-400">Loading Network IPs...</div>
                ) : error && networkIps.length === 0 ? (
                    <div className="text-center py-16 text-red-400">Error: {error}</div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-700 text-sm">
                        <thead className="bg-gray-800 sticky top-0 z-10">
                            <tr>
                                {visibleTableColumns.map(column => (
                                    <th
                                        key={column.id}
                                        draggable
                                        onDragStart={(e) => handleColumnDragStart(e, column.id)}
                                        onDragOver={handleColumnDragOver}
                                        onDrop={(e) => handleColumnDrop(e, column.id)}
                                        onDragEnd={() => setDraggingColumnId(null)}
                                        className={`px-6 py-3 text-left font-medium text-gray-300 uppercase tracking-wider select-none cursor-grab ${
                                            draggingColumnId === column.id ? 'bg-gray-700 text-amber-300' : 'hover:bg-gray-700'
                                        } ${column.id === 'actions' ? 'text-right' : ''}`}
                                        title="Drag header to reorder column"
                                    >
                                        <span className={`inline-flex items-center gap-2 ${column.id === 'actions' ? 'justify-end w-full' : ''}`}>
                                            <GripVertical size={14} className="text-gray-500 shrink-0" />

                                            {column.sortable === false ? (
                                                <span>{column.label}</span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSortColumn(column);
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className={`inline-flex items-center gap-1 hover:text-white ${
                                                        sortPrefs.key === column.id ? 'text-amber-300' : 'text-gray-300'
                                                    }`}
                                                    title={`Sort by ${column.label}`}
                                                >
                                                    {column.label}
                                                    {renderSortIcon(column)}
                                                </button>
                                            )}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {sortedNetworkIps.length > 0 ? sortedNetworkIps.map((ip) => (
                                <tr
                                    key={ip.id}
                                    className={`hover:bg-gray-700 cursor-pointer ${ip.status === 'conflict' ? 'bg-red-900/20' : ''}`}
                                    onDoubleClick={() => handleOpenModal(ip)}
                                    title="Double-click to edit"
                                >
                                    {visibleTableColumns.map(column => (
                                        <React.Fragment key={column.id}>
                                            {renderColumnCell(column.id, ip)}
                                        </React.Fragment>
                                    ))}
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={visibleTableColumns.length} className="text-center py-10 text-gray-400">
                                        No network assignments found. Click "New IP Entry" or press N.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingIp ? 'Edit Network Assignment' : 'New Network Assignment'}
                maxWidth="max-w-3xl"
            >
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Entry Type</label>
                            <select
                                name="entity_type"
                                value={formData.entity_type}
                                onChange={handleFormChange}
                                disabled={Boolean(editingIp)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm disabled:opacity-60"
                            >
                                <option value="rack_equipment">Existing Equipment</option>
                                <option value="reservation">Reservation Block</option>
                            </select>
                        </div>

                        {formData.entity_type === 'rack_equipment' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Equipment</label>
                                <select
                                    name="entity_id"
                                    value={formData.entity_id || ''}
                                    onChange={handleEquipmentChange}
                                    disabled={Boolean(editingIp)}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm disabled:opacity-60"
                                >
                                    <option value="">Select Equipment...</option>
                                    {equipmentList.map(eq => (
                                        <option key={eq.id} value={eq.id}>
                                            {eq.displayLabel}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="border border-gray-700 rounded-lg p-4 bg-gray-900/40">
                        <div className="mb-4">
                            <h3 className="text-sm font-semibold text-white">Network Assignment</h3>
                            <p className="text-xs text-gray-400 mt-1">
                                Assign a single IP, IP range, or trunk/multi-VLAN assignment.
                            </p>
                        </div>

                        <NetworkAssignmentFields
                            value={effectiveNetworkAssignment}
                            onChange={setNetworkAssignment}
                            locationMode={isRackedEquipmentLocation ? 'readonly' : 'editable'}
                            locationHelpText={
                                isRackedEquipmentLocation
                                    ? 'Location is pulled from the selected equipment’s rack and RU position.'
                                    : ''
                            }
                        />

                        {formData.entity_type === 'reservation' && effectiveNetworkAssignment.assignment_type === 'trunk' && (
                            <p className="text-xs text-red-400 mt-3">
                                Reservation blocks cannot use trunk assignments. Use Existing Equipment for trunk assignments.
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            type="button"
                            onClick={handleCloseModal}
                            className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            className="px-4 py-2 bg-amber-500 text-black font-bold rounded-md hover:bg-amber-400 transition-colors"
                        >
                            {editingIp ? 'Update Assignment' : 'Create Assignment'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default NetworkIpsView;