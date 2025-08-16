import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/api';
import EquipmentLibrarySidebar from '../components/EquipmentLibrarySidebar';
import RackList from '../components/RackList';
import { HardDrive } from 'lucide-react';
import RackComponent from '../components/RackComponent';

const UserRackBuilderView = ({ library, racks, selectedRackId, onSelectRack, onNewRack, onUpdate }) => {
    const [draggedItem, setDraggedItem] = useState(null);
    const [activeRack, setActiveRack] = useState(null);
    const [isLoadingRack, setIsLoadingRack] = useState(false);

    const fetchRackDetails = useCallback(async (rackId) => {
        if (!rackId) {
            setActiveRack(null);
            return;
        }
        setIsLoadingRack(true);
        try {
            const detailedRack = await api.getRackDetails(rackId);
            setActiveRack(detailedRack);
        } catch (error) {
            console.error("Failed to fetch rack details:", error);
            setActiveRack(null);
        } finally {
            setIsLoadingRack(false);
        }
    }, []);

    useEffect(() => {
        if (selectedRackId) {
            fetchRackDetails(selectedRackId);
        } else if (racks.length > 0 && !selectedRackId) {
            onSelectRack(racks[0].id);
        } else {
            setActiveRack(null);
        }
    }, [selectedRackId, racks, fetchRackDetails, onSelectRack]);

    const handleDragStart = (e, item, isNew = false) => {
        const template = isNew ? item : item.equipment_templates;
        const data = { isNew, item, template };
        e.dataTransfer.setData('application/json', JSON.stringify(data));
        e.dataTransfer.effectAllowed = 'move';
        // A slight delay allows the dataTransfer to be set before the state update, making the process more reliable.
        setTimeout(() => setDraggedItem(data), 0);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
    };

    const handleAddEquipment = async (item, ru_position, rack_side) => {
        if (!activeRack) return;
        const payload = {
            template_id: item.id,
            ru_position,
            rack_side,
        };
        try {
            await api.addEquipmentToRack(activeRack.id, payload);
            await fetchRackDetails(activeRack.id); // Refetch to get the updated state
        } catch (error) {
            console.error("Failed to add equipment to rack", error);
            alert(`Error: ${error.message || 'Could not add equipment.'}`);
        }
    };

    const handleMoveEquipment = async (item, new_ru_position, rack_side) => {
        if (!activeRack) return;
        const payload = {
            ru_position: new_ru_position,
            rack_side,
        };
        try {
            await api.updateEquipmentInstance(item.id, payload);
            await fetchRackDetails(activeRack.id);
        } catch (error) {
            console.error("Failed to move equipment", error);
            alert(`Error: ${error.message || 'Could not move equipment.'}`);
        }
    };

    const handleDeleteEquipment = async (instanceId) => {
        if (!activeRack || !window.confirm("Are you sure you want to remove this equipment?")) return;
        try {
            await api.deleteEquipmentFromRack(instanceId);
            await fetchRackDetails(activeRack.id);
        } catch (error) {
            console.error("Failed to delete equipment:", error);
            alert(`Error: ${error.message}`);
        }
    };

    const handleDrop = (data, ru_position, side) => {
        if (data.isNew) {
            handleAddEquipment(data.item, ru_position, side);
        } else {
            handleMoveEquipment(data.item, ru_position, side);
        }
    };

    const handleDeleteRack = async (rackId) => {
        if (!window.confirm("Are you sure you want to delete this rack template?")) return;
        try {
            await api.deleteRack(rackId);
            onUpdate();
        } catch (error) {
            console.error("Failed to delete rack:", error);
            alert(`Error: ${error.message}`);
        }
    };

    const handleUpdateRack = async (rackId, rackData) => {
        try {
            await api.updateRack(rackId, rackData);
            onUpdate();
        } catch (error) {
            console.error("Failed to update rack:", error)
            alert(`Error: ${error.message}`);
        }
    };

    return (
        <div className="flex gap-6 h-[calc(100vh-250px)]" onDragEnd={handleDragEnd}>
            <RackList
                racks={racks}
                onSelectRack={onSelectRack}
                onNewRack={onNewRack}
                onDeleteRack={handleDeleteRack}
                onUpdateRack={handleUpdateRack}
                selectedRackId={selectedRackId}
            />

            <div className="flex-grow overflow-x-auto pb-4 flex justify-center gap-8">
                {isLoadingRack ? (
                    <div className="flex-grow flex items-center justify-center text-gray-500">Loading Rack...</div>
                ) : activeRack ? (
                    <>
                        <RackComponent
                            key={`${activeRack.id}-front`}
                            rack={activeRack}
                            view="front"
                            onDrop={handleDrop}
                            onDelete={handleDeleteEquipment}
                            onDragStart={(e, item) => handleDragStart(e, item, false)}
                            draggedItem={draggedItem}
                        />
                        <RackComponent
                            key={`${activeRack.id}-rear`}
                            rack={activeRack}
                            view="rear"
                            onDrop={handleDrop}
                            onDelete={handleDeleteEquipment}
                            onDragStart={(e, item) => handleDragStart(e, item, false)}
                            draggedItem={draggedItem}
                        />
                    </>
                ) : (
                    <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-500">
                        <HardDrive size={48} className="mb-4" />
                        <h3 className="text-lg font-bold">No Rack Selected</h3>
                        <p>Select a rack from the left panel to begin, or create a new one.</p>
                    </div>
                )}
            </div>

            <EquipmentLibrarySidebar
                library={library}
                onDragStart={(e, item) => handleDragStart(e, item, true)}
                onLibraryUpdate={onUpdate}
            />
        </div>
    );
};

export default UserRackBuilderView;