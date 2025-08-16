import React, { useState, useEffect, useCallback } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { api } from '../api/api';
import RackComponent from '../components/RackComponent';
import EquipmentLibrarySidebar from '../components/EquipmentLibrarySidebar';
import RackList from '../components/RackList';
import NewRackModal from '../components/NewRackModal';
import { HardDrive } from 'lucide-react';
import PlacedEquipmentItem from '../components/PlacedEquipmentItem'; // Import for DragOverlay

const UserRackBuilderView = ({ library, racks, selectedRackId, onSelectRack, onNewRack, onUpdate }) => {
    const [activeDragItem, setActiveDragItem] = useState(null);
    const [expandedFolders, setExpandedFolders] = useState({});
    const sensors = useSensors(useSensor(PointerSensor));

    const handleDragStart = (event) => {
        setActiveDragItem(event.active.data.current);
    };

    const handleDragEnd = async ({ active, over }) => {
        setActiveDragItem(null);
        if (!over) return;

        const activeType = active.data.current.type;
        const overData = over.data.current;
        const overType = overData.type;

        // Case 1: Dragging a new template from the library to a rack slot
        if (activeType === 'equipment-template' && overType === 'ru-slot') {
            const template = active.data.current.template;
            const { rackId, ru, side } = overData;
            try {
                await api.addEquipmentToRack(rackId, {
                    template_id: template.id,
                    ru_position: ru,
                    rack_side: side,
                });
                onUpdate();
            } catch (error) {
                console.error("Failed to add equipment to rack", error);
                alert(`Error: ${error.message}`);
            }
        }

        // Case 2: Moving an existing item within or between racks
        if (activeType === 'placed-item' && overType === 'ru-slot') {
            const item = active.data.current.item;
            const { ru, side } = overData;
            // Prevent dropping on the same spot
            if (item.ru_position === ru && item.rack_side === side) {
                return;
            }
            try {
                await api.updateEquipmentInstance(item.id, {
                    ru_position: ru,
                    rack_side: side,
                });
                onUpdate();
            } catch (error) {
                console.error("Failed to move equipment", error);
                alert(`Error: ${error.message}`);
            }
        }
    };

    const toggleFolder = (folderId) => {
        setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
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
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-6 h-[calc(100vh-250px)]">
                <RackList 
                    racks={racks}
                    onSelectRack={onSelectRack}
                    onNewRack={onNewRack}
                    onDeleteRack={handleDeleteRack}
                    onUpdateRack={handleUpdateRack}
                    selectedRackId={selectedRackId}
                />
                <UserRackBuilderViewContent
                    selectedRackId={selectedRackId}
                    onUpdate={onUpdate}
                />
                <EquipmentLibrarySidebar
                    library={library}
                    expandedFolders={expandedFolders}
                    toggleFolder={toggleFolder}
                    onLibraryUpdate={onUpdate}
                />
            </div>
            <DragOverlay>
                {activeDragItem?.type === 'equipment-template' ? (
                    <div className="p-2 bg-gray-900 border border-amber-500 rounded-md shadow-lg">
                        <p className="font-bold text-sm text-white">{activeDragItem.template.model_number}</p>
                        <p className="text-xs text-gray-400">{activeDragItem.template.ru_height}RU</p>
                    </div>
                ) : null}
                {activeDragItem?.type === 'placed-item' ? (
                    <PlacedEquipmentItem item={activeDragItem.item} isOverlay />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

const UserRackBuilderViewContent = ({ selectedRackId, onUpdate }) => {
    const [rack, setRack] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const fetchRackDetails = async () => {
            if (!selectedRackId) {
                setRack(null);
                return;
            }
            setIsLoading(true);
            try {
                const rackData = await api.getRackDetails(selectedRackId);
                setRack(rackData);
            } catch (error) {
                console.error("Failed to fetch rack details:", error);
                setRack(null);
            } finally {
                setIsLoading(false);
            }
        };
        fetchRackDetails();
    }, [selectedRackId]);

    if (isLoading) {
        return <div className="flex-grow flex items-center justify-center text-gray-500">Loading Rack...</div>;
    }

    if (!selectedRackId) {
        return (
            <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-500">
                <HardDrive size={48} className="mb-4" />
                <h3 className="text-lg font-bold">No Rack Selected</h3>
                <p>Select a rack from the left panel to begin, or create a new one.</p>
            </div>
        )
    }

    if (!rack) {
        return null;
    }

    return (
        <div className="flex-grow overflow-x-auto pb-4 flex justify-center gap-8">
            <RackComponent
                key={`${rack.id}-front`}
                rack={rack}
                view="front"
                onUpdate={onUpdate}
            />
            <RackComponent
                key={`${rack.id}-rear`}
                rack={rack}
                view="rear"
                onUpdate={onUpdate}
            />
        </div>
    );
};

export default UserRackBuilderView;