import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useShow } from '../contexts/ShowContext';
import { useModal } from '../contexts/ModalContext';
import { useToast } from '../contexts/ToastContext';
import { api } from '../api/api';
import { Plus, Edit, Trash2, Columns, Download } from 'lucide-react';
import {
    buildRackLocation,
    buildEquipmentDeviceLabel,
    formatNetworkAssignment,
    getNetworkIpForEquipment,
    isValidIpv4,
    parseLegacyTrunkPlaceholder,
} from '../utils/networkIpHelpers';
import Modal from '../components/Modal';

const initialFormState = {
    entity_type: 'rack_equipment',
    entity_id: '',
    assignment_type: 'single',
    ip_address: '',
    ip_end: '',
    trunk_mode: 'all',
    trunk_label: '',
    host_octet: '',
    mac_address: '',
    department: '',
    location: '',
};

const isTypingTarget = (target) => {
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
};

const normalizeBlank = (value) => value === '' ? null : value;

const NetworkIpsView = () => {
    const { showId, racks, refreshRacks, networkIps = [], refreshNetworkIps } = useShow();
    const { showConfirmationModal } = useModal();
    const { addToast } = useToast();

    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingIp, setEditingIp] = useState(null);
    const [formData, setFormData] = useState(initialFormState);

    const [showColDropdown, setShowColDropdown] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState({
        assignment_type: true,
        ip_end: true,
        department: true,
        location: true,
        entity_type: true,
        mac_address: false,
    });

    /**
     * Used for normal Existing Equipment selector and device label resolution.
     * This uses canonical network_ip_entries only. No legacy IP fallback here.
     */
    const equipmentList = useMemo(() => {
        if (!racks) return [];

        const items = [];

        racks.forEach(rack => {
            if (rack.rack_name === '[Unracked]') return;

            const rackName = rack.rack_name || rack.name || 'Unknown Rack';
            const rackItems = rack.equipment || rack.rack_items || [];

            rackItems.forEach(item => {
                const template = item.equipment_templates || {};
                const supportsIp = template.has_ip_address === true;
                const networkEntry = getNetworkIpForEquipment(networkIps, item.id);

                if (!supportsIp && !networkEntry) return;

                const instanceName = item.instance_name || item.name || 'Unnamed Instance';
                const modelNumber = template.model_number || template.name || 'Unknown Model';
                const ruPosition = item.ru_position ?? item.u_position ?? '';

                items.push({
                    id: item.id,
                    instanceName,
                    modelNumber,
                    rackName,
                    ruPosition,
                    currentAssignment: networkEntry || null,
                    currentDisplay: formatNetworkAssignment(networkEntry),
                    displayLabel: buildEquipmentDeviceLabel(item, rackName),
                    location: buildRackLocation(rackName, ruPosition),
                });
            });
        });

        return items.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
    }, [racks, networkIps]);

    /**
     * Used ONLY for the transitional Import Legacy IPs button.
     * Allows old rack_equipment_instances.ip_address to be read once into the canonical table.
     */
    const legacyImportEquipmentList = useMemo(() => {
        if (!racks) return [];

        const candidates = [];
        racks.forEach(rack => {
            if (rack.rack_name === '[Unracked]') return;

            const rackName = rack.rack_name || rack.name || 'Unknown Rack';
            const rackItems = rack.equipment || rack.rack_items || [];

            rackItems.forEach(item => {
                const existing = getNetworkIpForEquipment(networkIps, item.id);
                if (existing || !item.ip_address) return;

                const legacyValue = String(item.ip_address).trim();
                const parsedTrunk = parseLegacyTrunkPlaceholder(legacyValue);

                if (!isValidIpv4(legacyValue) && !parsedTrunk) return;

                candidates.push({
                    id: item.id,
                    legacyValue,
                    parsedTrunk,
                    location: buildRackLocation(rackName, item.ru_position),
                });
            });
        });

        return candidates;
    }, [racks, networkIps]);

    const getDeviceName = useCallback((ipEntry) => {
        if (ipEntry.entity_type === 'reservation') return 'Reservation Block';
        if (ipEntry.entity_type === 'rack_equipment' && ipEntry.entity_id) {
            const eq = equipmentList.find(e => e.id === ipEntry.entity_id);
            if (eq) return eq.displayLabel;
        }
        return '-';
    }, [equipmentList]);

    const fetchIps = useCallback(async () => {
        if (!showId || !refreshNetworkIps) return;
        setIsLoading(true);
        setError(null);
        try {
            await refreshNetworkIps();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [showId, refreshNetworkIps]);

    useEffect(() => {
        fetchIps();
    }, [fetchIps]);

    const hydrateFormFromEntry = (ip) => ({
        entity_type: ip.entity_type || 'rack_equipment',
        entity_id: ip.entity_id || '',
        assignment_type: ip.assignment_type || (ip.ip_end ? 'range' : 'single'),
        ip_address: ip.ip_address || '',
        ip_end: ip.ip_end || '',
        trunk_mode: ip.trunk_mode || 'all',
        trunk_label: ip.trunk_label || '',
        host_octet: ip.host_octet || '',
        mac_address: ip.mac_address || '',
        department: ip.department || '',
        location: ip.location || '',
    });

    const handleOpenModal = useCallback((ip = null) => {
        if (ip) {
            setEditingIp(ip);
            setFormData(hydrateFormFromEntry(ip));
        } else {
            setEditingIp(null);
            setFormData(initialFormState);
        }
        setIsModalOpen(true);
    }, []);

    const handleCloseModal = useCallback(() => {
        setIsModalOpen(false);
        setEditingIp(null);
        setFormData(initialFormState);
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

    const handleDeleteIp = (ipEntry) => {
        showConfirmationModal('Are you sure you want to delete this network assignment?', async () => {
            try {
                if (ipEntry.entity_type === 'rack_equipment' && ipEntry.entity_id) {
                    await api.deleteNetworkIpEntity(showId, 'rack_equipment', ipEntry.entity_id);

                    // Compatibility mirror cleanup only. network_ip_entries is canonical.
                    await api.updateEquipmentInstance(ipEntry.entity_id, { ip_address: null }).catch(err => console.warn('Mirror cleanup failed', err));

                    if (refreshRacks) await refreshRacks();
                } else {
                    await api.deleteNetworkIp(showId, ipEntry.id);
                }

                addToast('Network assignment deleted successfully', 'success');
                fetchIps();
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
                if (value === 'reservation' && prev.assignment_type === 'trunk') {
                    next.assignment_type = 'single';
                }
            }

            if (name === 'assignment_type') {
                if (value === 'single') {
                    next.ip_end = '';
                    next.trunk_mode = 'all';
                    next.trunk_label = '';
                    next.host_octet = '';
                } else if (value === 'range') {
                    next.trunk_mode = 'all';
                    next.trunk_label = '';
                    next.host_octet = '';
                } else if (value === 'trunk') {
                    next.ip_address = '';
                    next.ip_end = '';
                    next.trunk_mode = prev.trunk_mode || 'all';
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
            assignment_type: assignment?.assignment_type || prev.assignment_type || 'single',
            ip_address: assignment?.ip_address || prev.ip_address,
            ip_end: assignment?.ip_end || prev.ip_end,
            trunk_mode: assignment?.trunk_mode || prev.trunk_mode || 'all',
            trunk_label: assignment?.trunk_label || prev.trunk_label,
            host_octet: assignment?.host_octet || prev.host_octet,
            mac_address: assignment?.mac_address || prev.mac_address,
            department: assignment?.department || prev.department,
            location: assignment?.location || eq?.location || prev.location,
        }));
    };

    const buildPayload = () => {
        const payload = {
            ...formData,
            host_octet: formData.host_octet === '' ? null : Number(formData.host_octet),
        };

        if (payload.entity_type === 'reservation') {
            payload.entity_id = null;
            payload.status = 'reserved';
            if (payload.assignment_type === 'trunk') payload.assignment_type = 'single';
        } else if (payload.entity_type === 'rack_equipment') {
            payload.status = 'assigned';
        }

        if (payload.assignment_type === 'single') {
            payload.ip_end = null;
            payload.trunk_mode = null;
            payload.trunk_label = null;
            payload.host_octet = null;
            payload.trunk_vlan_ids = [];
        } else if (payload.assignment_type === 'range') {
            payload.trunk_mode = null;
            payload.trunk_label = null;
            payload.host_octet = null;
            payload.trunk_vlan_ids = [];
        } else if (payload.assignment_type === 'trunk') {
            payload.ip_address = null;
            payload.ip_end = null;
            payload.trunk_mode = payload.trunk_mode || 'all';
            payload.trunk_vlan_ids = [];
        }

        Object.keys(payload).forEach(key => {
            payload[key] = normalizeBlank(payload[key]);
        });

        return payload;
    };

    const validatePayload = () => {
        if (formData.entity_type === 'rack_equipment' && !formData.entity_id) {
            addToast('Please select existing equipment.', 'error');
            return false;
        }

        if (formData.entity_type === 'reservation' && formData.assignment_type === 'trunk') {
            addToast('Reservation blocks cannot use trunk assignments.', 'error');
            return false;
        }

        if (formData.assignment_type === 'single') {
            if (!formData.ip_address) {
                addToast('IP Address is required for single IP assignments.', 'error');
                return false;
            }
            if (!isValidIpv4(formData.ip_address)) {
                addToast('Invalid IP Address format.', 'error');
                return false;
            }
        }

        if (formData.assignment_type === 'range') {
            if (!formData.ip_address || !formData.ip_end) {
                addToast('IP Address and IP End are required for range assignments.', 'error');
                return false;
            }
            if (!isValidIpv4(formData.ip_address) || !isValidIpv4(formData.ip_end)) {
                addToast('Invalid range IP format.', 'error');
                return false;
            }
        }

        if (formData.assignment_type === 'trunk') {
            if (!formData.trunk_mode) {
                addToast('Trunk Mode is required.', 'error');
                return false;
            }
            if (formData.host_octet !== '') {
                const hostOctet = Number(formData.host_octet);
                if (!Number.isInteger(hostOctet) || hostOctet < 1 || hostOctet > 254) {
                    addToast('Host Octet must be a number from 1 to 254.', 'error');
                    return false;
                }
            }
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
                });

                // Compatibility mirror only. Do not store trunk placeholders in rack_equipment_instances.ip_address.
                await api.updateEquipmentInstance(payload.entity_id, {
                    ip_address: payload.assignment_type === 'single' ? payload.ip_address : null,
                });

                if (refreshRacks) await refreshRacks();

                addToast('Network assignment synced successfully', 'success');
                await fetchIps();
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
            await fetchIps();
            handleCloseModal();
        } catch (err) {
            const action = editingIp ? 'update' : 'create';
            addToast(`Failed to ${action} network assignment: ${err.message}`, 'error');
        }
    };

    const handleSyncFromRackBuilder = async () => {
        if (!showId) return;

        if (legacyImportEquipmentList.length === 0) {
            addToast('No valid legacy rack IP values found to import.', 'info');
            return;
        }

        showConfirmationModal(`Import ${legacyImportEquipmentList.length} legacy network assignment${legacyImportEquipmentList.length === 1 ? '' : 's'} from Rack Builder?`, async () => {
            setIsSyncing(true);
            let syncedCount = 0;
            let failedCount = 0;

            try {
                for (const eq of legacyImportEquipmentList) {
                    try {
                        const payload = eq.parsedTrunk
                            ? {
                                entity_type: 'rack_equipment',
                                entity_id: eq.id,
                                assignment_type: 'trunk',
                                ip_address: null,
                                ip_end: null,
                                trunk_mode: eq.parsedTrunk.trunk_mode,
                                trunk_label: eq.parsedTrunk.trunk_label,
                                host_octet: eq.parsedTrunk.host_octet,
                                trunk_vlan_ids: [],
                                location: eq.location || null,
                            }
                            : {
                                entity_type: 'rack_equipment',
                                entity_id: eq.id,
                                assignment_type: 'single',
                                ip_address: eq.legacyValue,
                                ip_end: null,
                                location: eq.location || null,
                            };

                        await api.syncNetworkIpEntity(showId, payload);
                        syncedCount += 1;
                    } catch (err) {
                        failedCount += 1;
                        console.error(`Failed to import rack equipment ${eq.id}:`, err);
                    }
                }

                await fetchIps();
                addToast(`Imported ${syncedCount} assignment${syncedCount === 1 ? '' : 's'}${failedCount ? `; ${failedCount} failed` : ''}.`, failedCount ? 'error' : 'success');
            } finally {
                setIsSyncing(false);
            }
        });
    };

    const getStatusBadgeClass = (status) => {
        switch (status) {
            case 'assigned': return 'bg-green-900 text-green-300';
            case 'reserved': return 'bg-yellow-900 text-yellow-300';
            case 'conflict': return 'bg-red-900 text-red-300';
            case 'offline': return 'bg-gray-700 text-gray-300';
            default: return 'bg-gray-700 text-gray-300';
        }
    };

    const assignmentOptions = formData.entity_type === 'reservation'
        ? [
            { value: 'single', label: 'Single IP' },
            { value: 'range', label: 'IP Range' },
        ]
        : [
            { value: 'single', label: 'Single IP' },
            { value: 'trunk', label: 'Trunk / Multi-VLAN' },
        ];

    return (
        <div className="p-4 sm:p-6 lg:p-8 h-full flex flex-col">
            <header className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Network IPs</h1>
                    <p className="text-sm text-gray-400 mt-1">Track rack equipment IPs, ranges, reservations, and trunk/multi-VLAN assignments for this show.</p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleSyncFromRackBuilder}
                        disabled={isSyncing}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-amber-400 border border-amber-900/30 rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm disabled:opacity-50"
                        title="Transitional: Import valid legacy rack equipment IPs and TRK placeholders"
                    >
                        <Download size={18} className={isSyncing ? 'animate-spin' : ''} />
                        Import Legacy IPs
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setShowColDropdown(!showColDropdown)}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm"
                        >
                            <Columns size={18} /> Columns
                        </button>
                        {showColDropdown && (
                            <div className="absolute right-0 mt-2 w-52 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 p-2 flex flex-col gap-1">
                                {Object.keys(visibleColumns).map(col => (
                                    <label key={col} className="flex items-center gap-2 p-2 hover:bg-gray-700 rounded cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={visibleColumns[col]}
                                            onChange={() => setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))}
                                            className="rounded bg-gray-900 border-gray-600 text-amber-500 focus:ring-amber-500"
                                        />
                                        <span className="text-sm text-gray-200 capitalize">{col.replace('_', ' ')}</span>
                                    </label>
                                ))}
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
                                <th className="px-6 py-3 text-left font-medium text-gray-300 uppercase tracking-wider">Assignment</th>
                                {visibleColumns.assignment_type && <th className="px-6 py-3 text-left font-medium text-gray-300 uppercase tracking-wider">Type</th>}
                                {visibleColumns.ip_end && <th className="px-6 py-3 text-left font-medium text-gray-300 uppercase tracking-wider">IP End</th>}
                                <th className="px-6 py-3 text-left font-medium text-gray-300 uppercase tracking-wider">Device Name</th>
                                {visibleColumns.department && <th className="px-6 py-3 text-left font-medium text-gray-300 uppercase tracking-wider">Department</th>}
                                {visibleColumns.location && <th className="px-6 py-3 text-left font-medium text-gray-300 uppercase tracking-wider">Location</th>}
                                {visibleColumns.entity_type && <th className="px-6 py-3 text-left font-medium text-gray-300 uppercase tracking-wider">Entity Type</th>}
                                {visibleColumns.mac_address && <th className="px-6 py-3 text-left font-medium text-gray-300 uppercase tracking-wider">MAC Address</th>}
                                <th className="px-6 py-3 text-left font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-right font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {networkIps.length > 0 ? networkIps.map((ip) => (
                                <tr
                                    key={ip.id}
                                    className={`hover:bg-gray-700 cursor-pointer ${ip.status === 'conflict' ? 'bg-red-900/20' : ''}`}
                                    onDoubleClick={() => handleOpenModal(ip)}
                                    title="Double-click to edit"
                                >
                                    <td className="px-6 py-4 whitespace-nowrap font-mono text-white">{formatNetworkAssignment(ip) || '-'}</td>
                                    {visibleColumns.assignment_type && <td className="px-6 py-4 whitespace-nowrap text-gray-300 capitalize">{(ip.assignment_type || 'single').replace('_', ' ')}</td>}
                                    {visibleColumns.ip_end && <td className="px-6 py-4 whitespace-nowrap font-mono text-gray-400">{ip.assignment_type === 'range' ? ip.ip_end || '-' : '-'}</td>}
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-300">{getDeviceName(ip)}</td>
                                    {visibleColumns.department && <td className="px-6 py-4 whitespace-nowrap text-gray-300">{ip.department || '-'}</td>}
                                    {visibleColumns.location && <td className="px-6 py-4 whitespace-nowrap text-gray-300">{ip.location || '-'}</td>}
                                    {visibleColumns.entity_type && <td className="px-6 py-4 whitespace-nowrap text-gray-300 capitalize">{ip.entity_type?.replace('_', ' ')}</td>}
                                    {visibleColumns.mac_address && <td className="px-6 py-4 whitespace-nowrap font-mono text-gray-400">{ip.mac_address || '-'}</td>}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(ip.status)}`}>
                                            {ip.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onDoubleClick={(e) => e.stopPropagation()}>
                                        <div className="flex justify-end gap-3">
                                            <button onClick={() => handleOpenModal(ip)} className="text-gray-400 hover:text-white" aria-label="Edit network assignment">
                                                <Edit size={18} />
                                            </button>
                                            <button onClick={() => handleDeleteIp(ip)} className="text-red-500 hover:text-red-400" aria-label="Delete network assignment">
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="10" className="text-center py-10 text-gray-400">
                                        No network assignments found. Click "New IP Entry", press N, or import from Rack Builder.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingIp ? 'Edit Network Assignment' : 'New Network Assignment'} maxWidth="max-w-2xl">
                <form onSubmit={handleSubmit} className="space-y-4">
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
                                        <option key={eq.id} value={eq.id}>{eq.displayLabel}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Assignment Type</label>
                            <select
                                name="assignment_type"
                                value={formData.assignment_type}
                                onChange={handleFormChange}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                            >
                                {assignmentOptions.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        {formData.assignment_type !== 'trunk' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">IP Address</label>
                                <input
                                    type="text"
                                    name="ip_address"
                                    value={formData.ip_address}
                                    onChange={handleFormChange}
                                    placeholder="192.168.1.50"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                                />
                            </div>
                        )}

                        {formData.assignment_type === 'range' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">IP End</label>
                                <input
                                    type="text"
                                    name="ip_end"
                                    value={formData.ip_end}
                                    onChange={handleFormChange}
                                    placeholder="192.168.1.60"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                                />
                            </div>
                        )}

                        {formData.assignment_type === 'trunk' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Trunk Mode</label>
                                    <select
                                        name="trunk_mode"
                                        value={formData.trunk_mode}
                                        onChange={handleFormChange}
                                        className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                                    >
                                        <option value="all">All VLANs</option>
                                        <option value="selected" disabled>Selected VLANs (coming soon)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Host Octet</label>
                                    <input
                                        type="number"
                                        name="host_octet"
                                        min="1"
                                        max="254"
                                        value={formData.host_octet}
                                        onChange={handleFormChange}
                                        placeholder="12"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                                    />
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Trunk Label</label>
                                    <input
                                        type="text"
                                        name="trunk_label"
                                        value={formData.trunk_label}
                                        onChange={handleFormChange}
                                        placeholder="10.12.TRK.12"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Display-only shorthand. It is not stored as a real IP address.</p>
                                </div>
                            </>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Department</label>
                            <input
                                type="text"
                                name="department"
                                value={formData.department}
                                onChange={handleFormChange}
                                placeholder="Video, LX, Audio, Automation, Vendor, etc."
                                className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Location</label>
                            <input
                                type="text"
                                name="location"
                                value={formData.location}
                                onChange={handleFormChange}
                                placeholder="VID-ENG.12"
                                className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">MAC Address</label>
                            <input
                                type="text"
                                name="mac_address"
                                value={formData.mac_address}
                                onChange={handleFormChange}
                                placeholder="00:00:00:00:00:00"
                                className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                            />
                        </div>
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