import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useShow } from '../contexts/ShowContext';
import { useModal } from '../contexts/ModalContext';
import { useToast } from '../contexts/ToastContext';
import { api } from '../api/api';
import { Plus, Edit, Trash2, Columns, RefreshCw } from 'lucide-react';
import Modal from '../components/Modal';

const initialFormState = {
    entity_type: 'rack_equipment',
    entity_id: '',
    ip_address: '',
    ip_end: '',
    mac_address: '',
    department: '',
    location: '',
};

const isValidIpv4 = (ip) => {
    if (!ip) return false;
    const regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return regex.test(ip);
};

const isTypingTarget = (target) => {
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
};

const buildRackLocation = (rackName, ruPosition) => {
    if (!rackName || ruPosition === null || ruPosition === undefined || ruPosition === '') return '';
    return `${rackName}.${ruPosition}`;
};

const NetworkIpsView = () => {
    const { showId, racks, refreshRacks } = useShow();
    const { showConfirmationModal } = useModal();
    const { addToast } = useToast();

    const [ips, setIps] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingIp, setEditingIp] = useState(null);
    const [formData, setFormData] = useState(initialFormState);

    const [showColDropdown, setShowColDropdown] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState({
        ip_end: true,
        department: true,
        location: true,
        entity_type: true,
        mac_address: false,
    });

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
                const hasIp = Boolean(item.ip_address);

                if (!supportsIp && !hasIp) return;

                const instanceName = item.instance_name || item.name || 'Unnamed Instance';
                const modelNumber = template.model_number || template.name || 'Unknown Model';
                const ruPosition = item.ru_position ?? item.u_position ?? '';

                items.push({
                    id: item.id,
                    instanceName,
                    modelNumber,
                    rackName,
                    ruPosition,
                    currentIp: item.ip_address || '',
                    displayLabel: `${instanceName} / ${modelNumber} / ${rackName}`,
                    location: buildRackLocation(rackName, ruPosition),
                });
            });
        });

        return items.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
    }, [racks]);

    const getDeviceName = useCallback((ipEntry) => {
        if (ipEntry.entity_type === 'reservation') return 'Reservation Block';
        if (ipEntry.entity_type === 'rack_equipment' && ipEntry.entity_id) {
            const eq = equipmentList.find(e => e.id === ipEntry.entity_id);
            if (eq) return eq.displayLabel;
        }
        return '-';
    }, [equipmentList]);

    const fetchIps = useCallback(async () => {
        if (!showId) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.getNetworkIps(showId);
            setIps(data || []);
        } catch (err) {
            setError(err.message);
            addToast(`Failed to fetch Network IPs: ${err.message}`, 'error');
            console.error('Failed to fetch Network IPs:', err);
        } finally {
            setIsLoading(false);
        }
    }, [showId, addToast]);

    useEffect(() => {
        fetchIps();
    }, [fetchIps]);

    const handleOpenModal = useCallback((ip = null) => {
        if (ip) {
            setEditingIp(ip);
            setFormData({
                entity_type: ip.entity_type || 'rack_equipment',
                entity_id: ip.entity_id || '',
                ip_address: ip.ip_address || '',
                ip_end: ip.ip_end || '',
                mac_address: ip.mac_address || '',
                department: ip.department || '',
                location: ip.location || '',
            });
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
        showConfirmationModal('Are you sure you want to delete this IP entry?', async () => {
            try {
                if (ipEntry.entity_type === 'rack_equipment' && ipEntry.entity_id) {
                    await api.updateEquipmentInstance(ipEntry.entity_id, { ip_address: null });
                    await api.syncNetworkIpEntity(showId, {
                        entity_type: 'rack_equipment',
                        entity_id: ipEntry.entity_id,
                        ip_address: null,
                        mac_address: null,
                        department: null,
                        location: null,
                    });
                    if (refreshRacks) await refreshRacks();
                } else {
                    await api.deleteNetworkIp(showId, ipEntry.id);
                }

                addToast('IP entry deleted successfully', 'success');
                fetchIps();
            } catch (err) {
                addToast(`Failed to delete IP entry: ${err.message}`, 'error');
            }
        });
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;

        setFormData(prev => {
            const next = { ...prev, [name]: value };

            if (name === 'entity_type') {
                if (value === 'reservation') {
                    next.entity_id = '';
                    next.ip_end = prev.ip_end || '';
                } else if (value === 'rack_equipment') {
                    next.ip_end = '';
                }
            }

            return next;
        });
    };

    const handleEquipmentChange = (e) => {
        const selectedId = e.target.value;
        const eq = equipmentList.find(item => item.id === selectedId);

        setFormData(prev => ({
            ...prev,
            entity_id: selectedId,
            ip_address: eq?.currentIp || prev.ip_address,
            location: eq?.location || prev.location,
        }));
    };

    const buildPayload = () => {
        const payload = { ...formData };

        if (payload.entity_type === 'reservation') {
            payload.entity_id = null;
            payload.status = 'reserved';
        } else if (payload.entity_type === 'rack_equipment') {
            payload.ip_end = null;
            payload.status = 'assigned';
        }

        Object.keys(payload).forEach(key => {
            if (payload[key] === '') {
                payload[key] = null;
            }
        });

        return payload;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.entity_type === 'rack_equipment' && !formData.entity_id) {
            addToast('Please select existing equipment.', 'error');
            return;
        }

        if (formData.ip_address && !isValidIpv4(formData.ip_address)) {
            addToast('Invalid IP Address format.', 'error');
            return;
        }

        if (formData.ip_end && !isValidIpv4(formData.ip_end)) {
            addToast('Invalid IP End format.', 'error');
            return;
        }

        const payload = buildPayload();

        if (payload.entity_type === 'rack_equipment' && payload.entity_id) {
            try {
                await api.updateEquipmentInstance(payload.entity_id, {
                    ip_address: payload.ip_address || null,
                });

                await api.syncNetworkIpEntity(showId, {
                    entity_type: 'rack_equipment',
                    entity_id: payload.entity_id,
                    ip_address: payload.ip_address || null,
                    department: payload.department || null,
                    location: payload.location || null,
                    mac_address: payload.mac_address || null,
                });

                if (refreshRacks) await refreshRacks();

                addToast(payload.ip_address ? 'IP entry synced successfully' : 'Rack equipment IP cleared', 'success');
                await fetchIps();
                handleCloseModal();
            } catch (err) {
                console.error('Failed to sync IP to equipment instance:', err);
                addToast(`Failed to update rack equipment IP: ${err.message}`, 'error');
            }
            return;
        }

        try {
            if (editingIp) {
                await api.updateNetworkIp(showId, editingIp.id, payload);
                addToast('IP entry updated successfully', 'success');
            } else {
                await api.createNetworkIp(showId, payload);
                addToast('IP entry created successfully', 'success');
            }
            await fetchIps();
            handleCloseModal();
        } catch (err) {
            const action = editingIp ? 'update' : 'create';
            addToast(`Failed to ${action} IP entry: ${err.message}`, 'error');
        }
    };

    const handleSyncFromRackBuilder = async () => {
        if (!showId) return;
        const equipmentWithIps = equipmentList.filter(eq => eq.currentIp);

        if (equipmentWithIps.length === 0) {
            addToast('No rack equipment with IP addresses found to sync.', 'info');
            return;
        }

        setIsSyncing(true);
        let syncedCount = 0;
        let failedCount = 0;

        try {
            for (const eq of equipmentWithIps) {
                try {
                    await api.syncNetworkIpEntity(showId, {
                        entity_type: 'rack_equipment',
                        entity_id: eq.id,
                        ip_address: eq.currentIp,
                        location: eq.location || null,
                    });
                    syncedCount += 1;
                } catch (err) {
                    failedCount += 1;
                    console.error(`Failed to sync rack equipment ${eq.id}:`, err);
                }
            }

            await fetchIps();
            addToast(`Synced ${syncedCount} rack IP${syncedCount === 1 ? '' : 's'}${failedCount ? `; ${failedCount} failed` : ''}.`, failedCount ? 'error' : 'success');
        } finally {
            setIsSyncing(false);
        }
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

    return (
        <div className="p-4 sm:p-6 lg:p-8 h-full flex flex-col">
            <header className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Network IPs</h1>
                    <p className="text-sm text-gray-400 mt-1">Track rack equipment IPs and reservation blocks for this show.</p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleSyncFromRackBuilder}
                        disabled={isSyncing}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                        Sync from Rack Builder
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setShowColDropdown(!showColDropdown)}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm"
                        >
                            <Columns size={18} /> Columns
                        </button>
                        {showColDropdown && (
                            <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 p-2 flex flex-col gap-1">
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
                ) : error && ips.length === 0 ? (
                    <div className="text-center py-16 text-red-400">Error: {error}</div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-700 text-sm">
                        <thead className="bg-gray-800 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-3 text-left font-medium text-gray-300 uppercase tracking-wider">IP Address</th>
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
                            {ips.length > 0 ? ips.map((ip) => (
                                <tr key={ip.id} className={`hover:bg-gray-700 ${ip.status === 'conflict' ? 'bg-red-900/20' : ''}`}>
                                    <td className="px-6 py-4 whitespace-nowrap font-mono text-white">{ip.ip_address || '-'}</td>
                                    {visibleColumns.ip_end && <td className="px-6 py-4 whitespace-nowrap font-mono text-gray-400">{ip.ip_end || '-'}</td>}
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
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end gap-3">
                                            <button onClick={() => handleOpenModal(ip)} className="text-gray-400 hover:text-white" aria-label="Edit IP entry">
                                                <Edit size={18} />
                                            </button>
                                            <button onClick={() => handleDeleteIp(ip)} className="text-red-500 hover:text-red-400" aria-label="Delete IP entry">
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="9" className="text-center py-10 text-gray-400">
                                        No IP entries found. Click "New IP Entry", press N, or sync from Rack Builder.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingIp ? 'Edit IP Entry' : 'New IP Entry'} maxWidth="max-w-2xl">
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

                        {formData.entity_type === 'reservation' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">IP End (Optional Range)</label>
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
                            {editingIp ? 'Update IP Entry' : 'Create IP Entry'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default NetworkIpsView;
