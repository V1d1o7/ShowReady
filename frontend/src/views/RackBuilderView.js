import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api/api';
import { Plus, HardDrive, PanelLeftOpen } from 'lucide-react';
import { 
    mergeNetworkIpIntoEquipment, 
    upsertRackEquipmentNetworkIp, 
    clearRackEquipmentNetworkIp,
    buildRackLocation
} from '../utils/networkIpHelpers';
import UserTreeView from '../components/UserTreeView';
import RackList from '../components/RackList';
import NewRackModal from '../components/NewRackModal';
import ContextualNotesDrawer from '../components/ContextualNotesDrawer';
import NewUserEquipmentModal from '../components/NewUserEquipmentModal';
import RackLibraryModal from '../components/RackLibraryModal';
import NamePromptModal from '../components/NamePromptModal';
import RackComponent from '../components/RackComponent';
import RackSideView from '../components/RackSideView';
import RackExportModal from '../components/RackExportModal';
import PdfPreviewModal from '../components/PdfPreviewModal';
import PowerReportModal from '../components/PowerReportModal';
import toast, { Toaster } from 'react-hot-toast';
import { useShow } from '../contexts/ShowContext';
import ConfirmationModal from '../components/ConfirmationModal';
import { useAuth } from '../contexts/AuthContext';

const RackBuilderView = () => {
    const { showId, showData, showOwnerId, networkIps, refreshNetworkIps } = useShow();
    const { user, profile } = useAuth();
    const showName = showData?.info?.show_name;
    const [racks, setRacks] = useState([]);
    const [library, setLibrary] = useState({ folders: [], equipment: [] });
    const [isLoading, setIsLoading] = useState(true);
    
    // Modals State
    const [isNewRackModalOpen, setIsNewRackModalOpen] = useState(false);
    const [isNewEquipModalOpen, setIsNewEquipModalOpen] = useState(false);
    const [isRackLibraryOpen, setIsRackLibraryOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false); 
    const [isPowerReportOpen, setIsPowerReportOpen] = useState(false); 
    const [isNamePromptOpen, setIsNamePromptOpen] = useState(false);
    const [confirmationModal, setConfirmationModal] = useState({ isOpen: false, message: '', onConfirm: () => {} });
    const [pdfPreview, setPdfPreview] = useState({ isOpen: false, url: '' });
    
    // Data State
    const [powerReportData, setPowerReportData] = useState([]);
    const [rackToCopy, setRackToCopy] = useState(null);
    const [selectedRackId, setSelectedRackId] = useState(null);
    const [activeRack, setActiveRack] = useState(null);
    
    // UI State
    const [draggedItem, setDraggedItem] = useState(null);
    const [dragOverData, setDragOverData] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [viewMode, setViewMode] = useState('front_rear'); 
    
    // Notes
    const [isNotesDrawerOpen, setIsNotesDrawerOpen] = useState(false);
    const [notesContext, setNotesContext] = useState({ entityType: null, entityId: null });

    const openNotesDrawer = (entityType, entityId) => {
        setNotesContext({ entityType, entityId });
        setIsNotesDrawerOpen(true);
    };

    // --- Data Fetching ---

    useEffect(() => {
        const fetchInitialData = async () => {
            if (!showId) return;
            setIsLoading(true);
            try {
                const [userLib, adminLib, racksData] = await Promise.all([
                    api.getLibrary(),
                    api.getAdminLibrary().catch(err => {
                        console.warn("Could not fetch admin library", err);
                        return { folders: [], equipment: [] };
                    }),
                    api.getRacksForShow(showId)
                ]);

                const equipmentMap = new Map();
                if (adminLib?.equipment) adminLib.equipment.forEach(e => equipmentMap.set(e.id, e));
                if (userLib?.equipment) userLib.equipment.forEach(e => equipmentMap.set(e.id, e));

                const folderMap = new Map();
                if (adminLib?.folders) adminLib.folders.forEach(f => folderMap.set(f.id, f));
                if (userLib?.folders) userLib.folders.forEach(f => folderMap.set(f.id, f));

                setLibrary({
                    folders: Array.from(folderMap.values()),
                    equipment: Array.from(equipmentMap.values())
                });

                const visibleRacks = racksData.filter(r => r.rack_name !== '[Unracked]');
                setRacks(visibleRacks);
                
                if (visibleRacks.length > 0 && !selectedRackId) {
                    setSelectedRackId(visibleRacks[0].id);
                }
            } catch (error) {
                console.error("Failed to fetch initial data:", error);
                toast.error("Failed to load initial data.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchInitialData();
    }, [showId]);

    useEffect(() => {
        if (!activeRack || !networkIps) return;
        
        setActiveRack(current => {
            // mergeNetworkIpIntoEquipment uses includeLegacyFallback: false by default
            const mergedEquipment = (current.equipment || []).map(item => mergeNetworkIpIntoEquipment(item, networkIps));
            
            const isDifferent = mergedEquipment.some((item, idx) => {
                const prev = current.equipment[idx];
                return item.ip_address !== prev?.ip_address ||
                       item.network_assignment_display !== prev?.network_assignment_display ||
                       item.network_metadata?.status !== prev?.network_metadata?.status ||
                       item.network_metadata?.id !== prev?.network_metadata?.id;
            });
            if (!isDifferent) return current;
            return { ...current, equipment: mergedEquipment };
        });
    }, [networkIps, activeRack?.id]);

    useEffect(() => {
        const fetchActiveRack = async () => {
            if (selectedRackId) {
                try {
                    const detailedRack = await api.getRackDetails(selectedRackId);
                    const mergedRack = {
                        ...detailedRack,
                        equipment: (detailedRack.equipment || []).map(item => mergeNetworkIpIntoEquipment(item, networkIps))
                    };
                    setActiveRack(mergedRack);
                } catch (error) {
                    console.error("Failed to fetch active rack:", error);
                    toast.error("Failed to load selected rack.");
                    if (error.message.includes("Not Found")) {
                        setActiveRack(null);
                        setSelectedRackId(null);
                    }
                }
            } else {
                setActiveRack(null);
            }
        };
        fetchActiveRack();
    }, [selectedRackId]);

    const fetchData = useCallback(async () => {
        if (!showId) return;
        try {
            const racksData = await api.getRacksForShow(showId);
            const visibleRacks = racksData.filter(r => r.rack_name !== '[Unracked]');
            setRacks(visibleRacks);
            if (!selectedRackId && visibleRacks.length > 0) {
                setSelectedRackId(visibleRacks[0].id);
            }
        } catch (error) {
            console.error("Failed to refresh racks:", error);
        }
    }, [showId, selectedRackId]);

    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const handleOpenPowerReport = async () => {
        if (!showId) return;
        toast.loading('Calculating Power Usage...');
        try {
            const detailedRacks = await api.getDetailedRacksForShow(showId);
            const visibleRacks = detailedRacks.filter(r => r.rack_name !== '[Unracked]');
            setPowerReportData(visibleRacks);
            setIsPowerReportOpen(true);
            toast.dismiss();
        } catch (error) {
            console.error("Failed to fetch data for power report:", error);
            toast.dismiss();
            toast.error(`Failed to generate Power Report: ${error.message}`);
        }
    };

    const handleProcessExport = async (options) => {
        const { scope, includeFrontRear, includeSide, includeEquipmentList, includePowerReport, includePanels, voltage, pageSize } = options;

        if (!showId) return;

        toast.loading('Generating Export Package...');
        try {
            const detailedRacks = await api.getDetailedRacksForShow(showId);
            let racksToPrint = detailedRacks.filter(r => r.rack_name !== '[Unracked]');
            
            if (scope === 'selected' && activeRack) {
                racksToPrint = racksToPrint.filter(r => r.id === activeRack.id);
            }

            if (racksToPrint.length === 0) {
                toast.error("No valid racks found to export.");
                return;
            }

            const payload = {
                racks: racksToPrint,
                show_name: showName,
                page_size: pageSize,
                include_front_rear: includeFrontRear,
                include_side_view: includeSide,
                include_equipment_list: includeEquipmentList,
                include_power_report: includePowerReport, 
                include_panels: includePanels,
                power_report_voltage: voltage 
            };

            const pdfBlob = await api.generateRacksPdf(payload);
            const url = window.URL.createObjectURL(pdfBlob);
            setPdfPreview({ isOpen: true, url });
            toast.success('Export generated successfully!');
        } catch (err) {
            console.error("Failed to generate PDF:", err);
            toast.error(`Failed to generate Export: ${err.message}`);
        } finally {
            toast.dismiss();
        }
    };

    const handleSelectRack = (rackId) => setSelectedRackId(rackId);

    const handleCreateRack = async (rackData) => {
        try {
            const newRack = await api.createRack({ rack_name: rackData.rackName, ru_height: parseInt(rackData.ruHeight, 10), show_id: showId });
            await fetchData();
            setSelectedRackId(newRack.id);
        } catch (error) {
            console.error("Failed to create rack:", error);
            toast.error(`Error: ${error.message}`);
        }
        setIsNewRackModalOpen(false);
    };
    
    const handleDeleteRack = (rackId) => {
        setConfirmationModal({
            isOpen: true,
            message: "Are you sure you want to delete this rack? This action cannot be undone.",
            onConfirm: async () => {
                try {
                    await api.deleteRack(rackId);
                    const newRacks = racks.filter(r => r.id !== rackId);
                    setRacks(newRacks);

                    if (selectedRackId === rackId) {
                        const newSelectedId = newRacks.length > 0 ? newRacks[0].id : null;
                        setSelectedRackId(newSelectedId);
                        if (newSelectedId) {
                            const detailedRack = await api.getRackDetails(newSelectedId);
                            setActiveRack(detailedRack);
                        } else {
                            setActiveRack(null);
                        }
                    }
                    toast.success("Rack deleted successfully.");
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                } catch (error) {
                    console.error("Failed to delete rack:", error);
                    toast.error(`Error: ${error.message}`);
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                }
            }
        });
    };

    const handleUpdateRack = async (rackId, rackData) => {
        try {
            await api.updateRack(rackId, rackData);
            fetchData();
        } catch (error) {
            console.error("Failed to update rack:", error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleUpdateEquipmentInstance = async (instanceId, updatedData) => {
        try {
            const { ip_address, ...nonIpData } = updatedData;
            
            // 1. Update non-IP equipment fields normally (instance_name, custom_fields, etc.)
            let updatedInstance = await api.updateEquipmentInstance(instanceId, nonIpData);
            
            // 2. Sync IP to canonical network_ip_entries (Source of Truth)
            if (ip_address !== undefined) {
                try {
                    const locationStr = buildRackLocation(activeRack?.rack_name, updatedData.ru_position || updatedInstance.ru_position);
                    
                    await upsertRackEquipmentNetworkIp({
                        api,
                        showId,
                        entityId: instanceId,
                        ipAddress: ip_address,
                        location: locationStr
                    });
                    
                    // 3. Update legacy rack_equipment_instances.ip_address only as a compatibility mirror
                    // This follows a successful canonical sync.
                    updatedInstance = await api.updateEquipmentInstance(instanceId, { ip_address: ip_address || null });
                    
                    if (refreshNetworkIps) await refreshNetworkIps();
                } catch (syncErr) {
                    console.error("Failed to sync IP to canonical table:", syncErr);
                    toast.error(`Equipment updated, but IP sync failed: ${syncErr.message}`);
                    return;
                }
            }

            setActiveRack(currentRack => {
                const updatedItems = currentRack.equipment.map(item => {
                    if (item.id === instanceId) {
                        return { 
                            ...item, 
                            ...updatedInstance,
                            equipment_templates: updatedInstance.equipment_templates || item.equipment_templates,
                            ip_address: ip_address !== undefined ? ip_address : updatedInstance.ip_address
                        };
                    }
                    return item;
                });
                return { ...currentRack, equipment: updatedItems };
            });
            toast.success("Equipment updated successfully!");
        } catch (error) {
            console.error("Failed to update equipment:", error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleCreateUserEquipment = async (equipmentData) => {
        try {
            await api.createUserEquipment(equipmentData);
             const [userLib, adminLib] = await Promise.all([
                api.getLibrary(),
                api.getAdminLibrary().catch(() => ({ folders: [], equipment: [] }))
            ]);
            
            const equipmentMap = new Map();
            if (adminLib?.equipment) adminLib.equipment.forEach(e => equipmentMap.set(e.id, e));
            if (userLib?.equipment) userLib.equipment.forEach(e => equipmentMap.set(e.id, e));

            const folderMap = new Map();
            if (adminLib?.folders) adminLib.folders.forEach(f => folderMap.set(f.id, f));
            if (userLib?.folders) userLib.folders.forEach(f => folderMap.set(f.id, f));

            setLibrary({
                folders: Array.from(folderMap.values()),
                equipment: Array.from(equipmentMap.values())
            });
        } catch (error) {
            console.error("Failed to create user equipment:", error);
            toast.error(`Error: ${error.message}`);
        }
        setIsNewEquipModalOpen(false);
    };

    const handleDeleteEquipment = (instanceId) => {
        setConfirmationModal({
            isOpen: true,
            message: "Are you sure you want to remove this equipment from the rack?",
            onConfirm: async () => {
                try {
                    // Delete canonical IP entry first
                    try {
                        await clearRackEquipmentNetworkIp({ api, showId, entityId: instanceId });
                        if (refreshNetworkIps) await refreshNetworkIps();
                    } catch (clearErr) {
                        console.error("Failed to clear network IP for deleted equipment:", clearErr);
                    }

                    await api.deleteEquipmentFromRack(instanceId);
                    
                    setActiveRack(currentRack => ({
                        ...currentRack,
                        equipment: currentRack.equipment.filter(item => item.id !== instanceId)
                    }));
                    toast.success("Equipment removed successfully.");
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                } catch (error) {
                    console.error("Failed to delete equipment:", error);
                    toast.error(`Error: ${error.message}`);
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                }
            }
        });
    };

    const handleLoadRackFromLibrary = (templateRack) => {
        setIsRackLibraryOpen(false);
        setRackToCopy(templateRack);
        setIsNamePromptOpen(true);
    };

    const handleConfirmCopyRack = async (newName) => {
        if (!rackToCopy) return;
        try {
            const newRack = await api.copyRackFromLibrary(rackToCopy.id, showId, newName);
            setRacks(prevRacks => [...prevRacks, newRack]);
            setSelectedRackId(newRack.id);
            setActiveRack(newRack);
            toast.success("Rack loaded successfully!");
        } catch (error) {
            console.error("Failed to load rack from library:", error);
            toast.error(`Error: ${error.message}`);
        }
        setIsNamePromptOpen(false);
        setRackToCopy(null);
    };

    const handleContextMenu = (e, item) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, item: item });
    };

    const handleCopyToLibrary = async () => {
        if (!contextMenu) return;
        try {
            await api.copyEquipmentToLibrary({ template_id: contextMenu.item.id, folder_id: null });
            const [userLib, adminLib] = await Promise.all([
                api.getLibrary(),
                api.getAdminLibrary().catch(() => ({ folders: [], equipment: [] }))
            ]);
             const equipmentMap = new Map();
            if (adminLib?.equipment) adminLib.equipment.forEach(e => equipmentMap.set(e.id, e));
            if (userLib?.equipment) userLib.equipment.forEach(e => equipmentMap.set(e.id, e));

            const folderMap = new Map();
            if (adminLib?.folders) adminLib.folders.forEach(f => folderMap.set(f.id, f));
            if (userLib?.folders) userLib.folders.forEach(f => folderMap.set(f.id, f));

            setLibrary({
                folders: Array.from(folderMap.values()),
                equipment: Array.from(equipmentMap.values())
            });

            toast.success(`${contextMenu.item.model_number} copied to your library!`);
        } catch (error) {
            console.error("Failed to copy equipment:", error);
            toast.error(`Error: ${error.message}`);
        }
        setContextMenu(null);
    };

    const getItemSlot = (item) => {
        const width = item.equipment_templates.width;
        const side = item.rack_side;
        if (width === 'full') return { start: 0, end: 1 };
        if (width === 'half') {
            if (side.endsWith('-right')) return { start: 0.5, end: 1 };
            return { start: 0, end: 0.5 };
        }
        if (width === 'third') {
            if (side.endsWith('-middle')) return { start: 1/3, end: 2/3 };
            if (side.endsWith('-right')) return { start: 2/3, end: 1 };
            return { start: 0, end: 1/3 };
        }
        return { start: 0, end: 1 };
    };
    
    const getTargetSlot = (itemTemplate, targetSide) => {
        const width = itemTemplate.width;
        if (width === 'full') return { start: 0, end: 1 };
        if (width === 'half') {
            if (targetSide.endsWith('-right')) return { start: 0.5, end: 1 };
            return { start: 0, end: 0.5 };
        }
        if (width === 'third') {
            if (targetSide.endsWith('-middle')) return { start: 1/3, end: 2/3 };
            if (targetSide.endsWith('-right')) return { start: 2/3, end: 1 };
            return { start: 0, end: 1/3 };
        }
        return { start: 0, end: 1 };
    }
    
    const checkCollision = useCallback((rackData, itemToPlace, targetRu, targetSide) => {
        if (!rackData || !itemToPlace) return true;
        const itemTemplate = itemToPlace.isNew ? itemToPlace.item : itemToPlace.item.equipment_templates;
        if (!itemTemplate) return true;
    
        const startNew = targetRu;
        const endNew = targetRu + itemTemplate.ru_height - 1;
    
        if (startNew < 1 || endNew > rackData.ru_height) return true;
    
        const newFace = targetSide.split('-')[0];
        const newSlot = getTargetSlot(itemTemplate, targetSide);
    
        for (let ru = startNew; ru <= endNew; ru++) {
            const itemsInRu = rackData.equipment.filter(item => {
                if (!itemToPlace.isNew && item.id === itemToPlace.item.id) return false;
                const template = item.equipment_templates;
                if (!template || !item.rack_side) return false;
                const face = item.rack_side.split('-')[0];
                if (face !== newFace) return false;
                const startExisting = item.ru_position;
                const endExisting = startExisting + template.ru_height - 1;
                return ru >= startExisting && ru <= endExisting;
            });
    
            for (const item of itemsInRu) {
                const existingSlot = getItemSlot(item);
                const epsilon = 0.0001;
                if (newSlot.start < existingSlot.end - epsilon && newSlot.end > existingSlot.start + epsilon) {
                    return true;
                }
            }
        }
        return false;
    }, []);

    const handleDragStart = (e, item, isNew = false) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ isNew, item }));
        setDraggedItem({ isNew, item });
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const cleanup = () => {
            setDraggedItem(null);
            setDragOverData(null);
        };

        if (!draggedItem || !dragOverData || !activeRack || dragOverData.rackId !== activeRack.id) {
            cleanup();
            return;
        }

        const { ru, side } = dragOverData;

        if (checkCollision(activeRack, draggedItem, ru, side)) {
            toast.error("Placement overlaps with existing equipment or is out of bounds.");
            cleanup();
            return;
        }

        const itemTemplate = draggedItem.isNew ? draggedItem.item : draggedItem.item.equipment_templates;
        if (!itemTemplate) {
            cleanup();
            return;
        }
        
        const finalSide = (() => {
            if (itemTemplate.width === 'full') {
                return side.split('-')[0];
            }
            return side;
        })();
        
        if (draggedItem.isNew) {
            const optimisticId = `optimistic-${Date.now()}`;
            const optimisticItem = {
                id: optimisticId,
                rack_id: activeRack.id,
                ru_position: ru,
                rack_side: finalSide,
                instance_name: `${draggedItem.item.model_number}`,
                equipment_templates: { ...itemTemplate },
            };

            setActiveRack(currentRack => ({
                ...currentRack,
                equipment: [...currentRack.equipment, optimisticItem]
            }));
            
            const payload = { template_id: draggedItem.item.id, ru_position: ru, rack_side: finalSide };
            api.addEquipmentToRack(activeRack.id, payload)
               .then(newlyAddedItem => {
                    const finalNewItem = { ...newlyAddedItem };
                    if (finalNewItem.equipment_templates) {
                        if (!finalNewItem.equipment_templates.width && itemTemplate.width) {
                            finalNewItem.equipment_templates.width = itemTemplate.width;
                        }
                    } else {
                        finalNewItem.equipment_templates = itemTemplate;
                    }

                    setActiveRack(currentRack => ({
                        ...currentRack,
                        equipment: currentRack.equipment.map(item => 
                            item.id === optimisticId ? finalNewItem : item
                        )
                    }));
               })
               .catch(err => {
                    toast.error(`Error adding equipment: ${err.message}`);
                    setActiveRack(currentRack => ({
                        ...currentRack,
                        equipment: currentRack.equipment.filter(item => item.id !== optimisticId)
                    }));
               });
        } else {
            const originalEquipmentState = activeRack.equipment;
            const movedItemId = draggedItem.item.id;
            const originalItem = originalEquipmentState.find(i => i.id === movedItemId);

            const updatedEquipment = originalEquipmentState.map(equip =>
                equip.id === movedItemId ? { ...equip, ru_position: ru, rack_side: finalSide } : equip
            );
            
            setActiveRack({ ...activeRack, equipment: updatedEquipment });

            const payload = { ru_position: ru, rack_side: finalSide };
            api.updateEquipmentInstance(movedItemId, payload)
                .then(updatedInstanceFromServer => {
                    const finalInstance = {
                        ...originalItem,
                        ...updatedInstanceFromServer 
                    };

                    const existingNetworkEntry = networkIps.find(ip => ip.entity_type === 'rack_equipment' && ip.entity_id === movedItemId);
                    if (existingNetworkEntry) {
                        upsertRackEquipmentNetworkIp({
                            api,
                            showId,
                            entityId: movedItemId,
                            assignmentType: existingNetworkEntry.assignment_type || 'single',
                            ipAddress: existingNetworkEntry.ip_address,
                            ipEnd: existingNetworkEntry.ip_end,
                            trunkMode: existingNetworkEntry.trunk_mode,
                            trunkLabel: existingNetworkEntry.trunk_label,
                            hostOctet: existingNetworkEntry.host_octet,
                            trunkVlanIds: existingNetworkEntry.trunk_vlan_ids || [],
                            macAddress: existingNetworkEntry.mac_address,
                            department: existingNetworkEntry.department,
                            location: buildRackLocation(activeRack?.rack_name, updatedInstanceFromServer.ru_position)
                        }).then(() => refreshNetworkIps?.()).catch(err => console.error("Location sync failed", err));
                    }

                    setActiveRack(currentRack => ({
                        ...currentRack,
                        equipment: currentRack.equipment.map(item => 
                            item.id === movedItemId ? finalInstance : item
                        )
                    }));
                })
                .catch(err => {
                    toast.error(`Failed to save move: ${err.message}`);
                    setActiveRack({ ...activeRack, equipment: originalEquipmentState });
                });
        }
        cleanup();
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDragOverData(null);
    };

    const userFolderTree = useMemo(() => {
        if (!library.folders) return [];
        const userFolders = library.folders.filter(f => !f.is_default);
        const itemsById = {};
        userFolders.forEach(item => { itemsById[item.id] = { ...item, children: [] }; });
        const roots = [];
        Object.values(itemsById).forEach(item => {
            if (item.parent_id && itemsById[item.parent_id]) {
                itemsById[item.parent_id].children.push(item);
            } else {
                roots.push(item);
            }
        });
        return roots;
    }, [library.folders]);

    if (isLoading) return <div className="p-8 text-center text-gray-400">Loading Rack Builder...</div>;

    return (
        <div className="flex flex-row gap-8 h-full" onDragEnd={handleDragEnd}>
            <Toaster position="bottom-center" />
            
            {isSidebarCollapsed ? (
                <div className="p-2">
                    <button onClick={() => setIsSidebarCollapsed(false)} className="p-2 text-gray-400 hover:text-amber-400">
                        <PanelLeftOpen size={20} />
                    </button>
                </div>
            ) : (
                <RackList
                    racks={racks}
                    onSelectRack={handleSelectRack}
                    onNewRack={() => setIsNewRackModalOpen(true)}
                    onDeleteRack={handleDeleteRack}
                    onUpdateRack={handleUpdateRack}
                    selectedRackId={selectedRackId}
                    onLoadFromRackLibrary={() => setIsRackLibraryOpen(true)}
                    onExport={() => setIsExportModalOpen(true)} 
                    onPowerReport={handleOpenPowerReport} 
                    title="Show Racks"
                    onCollapse={() => setIsSidebarCollapsed(true)}
                    onOpenNotes={profile?.permitted_features?.includes('contextual_notes') ? (rackId) => openNotesDrawer('rack', rackId) : undefined}
                />
            )}

            <div className="flex-grow overflow-auto pb-4 flex flex-col items-center">
                {activeRack && (
                    <div className="bg-gray-800 rounded-t-lg p-4 w-full max-w-[732px] mb-[-1px] flex justify-center items-center">
                        <h3 className="text-lg font-bold text-white truncate">{activeRack.rack_name}</h3>
                        <div className="ml-auto flex items-center gap-2 bg-gray-700 rounded-lg p-1">
                            <button 
                                onClick={() => setViewMode('front_rear')}
                                className={`px-3 py-1 text-sm rounded-md ${viewMode === 'front_rear' ? 'bg-amber-500 text-black' : 'text-gray-300 hover:bg-gray-600'}`}
                            >
                                Front/Rear
                            </button>
                            <button 
                                onClick={() => setViewMode('side')}
                                className={`px-3 py-1 text-sm rounded-md ${viewMode === 'side' ? 'bg-amber-500 text-black' : 'text-gray-300 hover:bg-gray-600'}`}
                            >
                                Side
                            </button>
                        </div>
                    </div>
                )}
                <div className="flex justify-center gap-8">
                    {activeRack ? (
                        viewMode === 'side' ? (
                            <RackSideView rack={activeRack} showHeader={false} />
                        ) : (
                            <>
                                <RackComponent
                                    key={`${activeRack.id}-front`}
                                    rack={activeRack}
                                    view="front"
                                    onDrop={handleDrop}
                                    onDelete={handleDeleteEquipment}
                                    onUpdate={handleUpdateEquipmentInstance}
                                    onDragStart={handleDragStart}
                                    draggedItem={draggedItem}
                                    dragOverData={dragOverData}
                                    onDragOverRack={setDragOverData}
                                    onOpenNotes={profile?.permitted_features?.includes('contextual_notes') ? openNotesDrawer : undefined}
                                    equipmentLibrary={library.equipment}
                                    showHeader={false}
                                />
                                <RackComponent
                                    key={`${activeRack.id}-rear`}
                                    rack={activeRack}
                                    view="rear"
                                    onDrop={handleDrop}
                                    onDelete={handleDeleteEquipment}
                                    onUpdate={handleUpdateEquipmentInstance}
                                    onDragStart={handleDragStart}
                                    draggedItem={draggedItem}
                                    dragOverData={dragOverData}
                                    onDragOverRack={setDragOverData}
                                    onOpenNotes={profile?.permitted_features?.includes('contextual_notes') ? openNotesDrawer : undefined}
                                    equipmentLibrary={library.equipment}
                                    showHeader={false}
                                />
                            </>
                        )
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center text-gray-500 w-full h-full">
                            <HardDrive size={48} className="mb-4" />
                            <h3 className="text-lg font-bold">No Rack Selected</h3>
                            <p>Select a rack from the left panel to begin, or create a new one.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="w-72 flex-shrink-0 bg-gray-800 p-3 rounded-xl flex flex-col">
                <div className="flex-shrink-0 flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Library</h2>
                    <button onClick={() => setIsNewEquipModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400">
                        <Plus size={16} /> New
                    </button>
                </div>
                <div className="flex-grow min-h-0 overflow-y-auto pr-2">
                    <UserTreeView library={library} onDragStart={(e, item) => handleDragStart(e, item, true)} />
                </div>
            </div>
            
            {contextMenu && (
                <div className="absolute z-50 bg-gray-800 border border-gray-700 rounded-md shadow-lg p-2 text-white" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    {contextMenu.item.is_default && (
                        <button onClick={handleCopyToLibrary} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700 rounded">
                             Copy to My Library
                        </button>
                    )}
                </div>
            )}
            
            <NewRackModal isOpen={isNewRackModalOpen} onClose={() => setIsNewRackModalOpen(false)} onSubmit={handleCreateRack} />
            <NewUserEquipmentModal isOpen={isNewEquipModalOpen} onClose={() => setIsNewEquipModalOpen(false)} onSubmit={handleCreateUserEquipment} userFolderTree={userFolderTree} />
            <RackLibraryModal isOpen={isRackLibraryOpen} onClose={() => setIsRackLibraryOpen(false)} onRackLoad={handleLoadRackFromLibrary} />
            
            <RackExportModal 
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleProcessExport}
                rackCount={racks.length}
                selectedRackName={activeRack ? activeRack.rack_name : null}
            />

            <PowerReportModal 
                isOpen={isPowerReportOpen} 
                onClose={() => setIsPowerReportOpen(false)} 
                data={powerReportData} 
            />

            <NamePromptModal
                isOpen={isNamePromptOpen}
                onClose={() => {
                    setIsNamePromptOpen(false);
                    setRackToCopy(null);
                }}
                onSubmit={handleConfirmCopyRack}
                title="Name New Rack"
                initialValue={rackToCopy ? `${rackToCopy.rack_name} (Copy)` : ''}
            />
            {confirmationModal.isOpen && (
                <ConfirmationModal
                    message={confirmationModal.message}
                    onConfirm={confirmationModal.onConfirm}
                    onCancel={() => setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} })}
                />
            )}
            <PdfPreviewModal
                isOpen={pdfPreview.isOpen}
                url={pdfPreview.url}
                onClose={() => {
                    window.URL.revokeObjectURL(pdfPreview.url);
                    setPdfPreview({ isOpen: false, url: '' });
                }}
            />
            <ContextualNotesDrawer
                entityType={notesContext.entityType}
                entityId={notesContext.entityId}
                showId={showId}
                isOpen={isNotesDrawerOpen}
                onClose={() => setIsNotesDrawerOpen(false)}
                isOwner={showOwnerId === user?.id}
            />
        </div>
    );
};

export default RackBuilderView;
