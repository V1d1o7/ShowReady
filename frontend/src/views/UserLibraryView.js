import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Package, HardDrive } from 'lucide-react';
import { api } from '../api/api';
import Card from '../components/Card';
import NewUserEquipmentModal from '../components/NewUserEquipmentModal';
import NewUserFolderModal from '../components/NewUserFolderModal';
import EditUserFolderModal from '../components/EditUserFolderModal';
import EditUserEquipmentModal from '../components/EditUserEquipmentModal';
import UserTreeView from '../components/UserTreeView';
import UserRackBuilderView from './UserRackBuilderView';
import RackList from '../components/RackList';
import NewRackModal from '../components/NewRackModal';

const UserLibraryView = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('equipment');
    const [library, setLibrary] = useState({ folders: [], equipment: [] });
    const [racks, setRacks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
    const [isRackModalOpen, setIsRackModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [selectedRackId, setSelectedRackId] = useState(null);
    
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [fullLibrary, racksData] = await Promise.all([
                api.getLibrary(),
                api.getLibraryRacks()
            ]);
            
            setLibrary(fullLibrary);
            setRacks(racksData);

            if (!selectedRackId && racksData.length > 0) {
                setSelectedRackId(racksData[0].id);
            } else if (racksData.length === 0) {
                setSelectedRackId(null);
            }

        } catch (error) {
            console.error("Failed to fetch user library:", error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRackId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCreateFolder = async (folderData) => {
        try {
            await api.createUserFolder(folderData);
            fetchData();
        } catch (error) {
            console.error("Failed to create folder", error);
            alert(`Error: ${error.message}`);
        }
        setIsFolderModalOpen(false);
    };

    const handleCreateEquipment = async (equipmentData) => {
        try {
            await api.createUserEquipment(equipmentData);
            fetchData();
        } catch (error) {
            console.error("Failed to create equipment", error);
            alert(`Error: ${error.message}`);
        }
        setIsEquipmentModalOpen(false);
    };
    
    const handleCreateRack = async (rackData) => {
        try {
            const newRack = await api.createRack({ rack_name: rackData.rackName, ru_height: parseInt(rackData.ruHeight, 10), saved_to_library: true });
            await fetchData();
            setSelectedRackId(newRack.id);
        } catch (error) {
            console.error("Failed to create rack template:", error);
            alert(`Error: ${error.message}`);
        }
        setIsRackModalOpen(false);
    };

    const handleDeleteFolder = async (folderId) => {
        if (!window.confirm("Are you sure? This will also delete all equipment and subfolders inside.")) return;
        try { 
            await api.deleteUserFolder(folderId); 
            fetchData();
        } catch(error) { 
            console.error("Failed to delete folder", error); 
            alert(`Error: ${error.message}`);
        }
    };

    const handleDeleteEquipment = async (equipmentId) => {
        if (!window.confirm("Are you sure?")) return;
        try { 
            await api.deleteUserEquipment(equipmentId);
            fetchData();
        } catch(error) { 
            console.error("Failed to delete equipment", error); 
            alert(`Error: ${error.message}`);
        }
    };
    
    const handleEditItem = (item, type) => {
        setEditingItem({ ...item, type });
    };

    const handleUpdateItem = async (updatedData) => {
        if (!editingItem) return;
        try {
            if (editingItem.type === 'folder') {
                await api.updateUserFolder(editingItem.id, updatedData);
            } else {
                await api.updateUserEquipment(editingItem.id, updatedData);
            }
            fetchData();
        } catch(error) {
            console.error("Failed to update item", error);
            alert(`Error: ${error.message}`);
        } finally {
            setEditingItem(null);
        }
    };

    const userFolderTree = useMemo(() => {
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

    return (
        <>
            <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">
                <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/account')} className="p-2 rounded-lg hover:bg-gray-700 transition-colors"><ArrowLeft size={20} /></button>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white">My Library</h1>
                    </div>
                </header>

                <div className="flex border-b border-gray-700 mb-6">
                    <button onClick={() => setActiveTab('equipment')} className={`flex items-center gap-2 px-4 py-3 font-bold ${activeTab === 'equipment' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-400'}`}>
                        <Package size={18} /> Equipment Library
                    </button>
                    <button onClick={() => setActiveTab('racks')} className={`flex items-center gap-2 px-4 py-3 font-bold ${activeTab === 'racks' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-400'}`}>
                        <HardDrive size={18} /> Rack Library
                    </button>
                </div>

                <main>
                    {activeTab === 'equipment' && (
                         <Card className="max-w-4xl mx-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-white">My Custom Equipment</h2>
                                <div className="flex gap-2">
                                    <button onClick={() => setIsFolderModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600">
                                        <Plus size={16} /> New Folder
                                    </button>
                                    <button onClick={() => setIsEquipmentModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400">
                                        <Plus size={16} /> New Equipment
                                    </button>
                                </div>
                            </div>
                            <div className="p-4 bg-gray-900/50 rounded-lg min-h-[300px]">
                                {isLoading ? (
                                    <p>Loading library...</p>
                                ) : (
                                    <UserTreeView 
                                        folders={library.folders.filter(f => !f.is_default)}
                                        equipment={library.equipment.filter(e => !e.is_default)}
                                        onDeleteFolder={handleDeleteFolder} 
                                        onDeleteEquipment={handleDeleteEquipment} 
                                        onEditItem={handleEditItem}
                                    />
                                )}
                            </div>
                        </Card>
                    )}

                    {activeTab === 'racks' && (
                        <UserRackBuilderView 
                            library={library}
                            racks={racks}
                            selectedRackId={selectedRackId}
                            onSelectRack={setSelectedRackId}
                            onNewRack={() => setIsRackModalOpen(true)}
                            onUpdate={fetchData} 
                        />
                    )}
                </main>
            </div>
            
            <NewUserFolderModal
                isOpen={isFolderModalOpen}
                onClose={() => setIsFolderModalOpen(false)}
                onSubmit={handleCreateFolder}
                userFolderTree={userFolderTree}
            />
            <NewUserEquipmentModal
                isOpen={isEquipmentModalOpen}
                onClose={() => setIsEquipmentModalOpen(false)}
                onSubmit={handleCreateEquipment}
                userFolderTree={userFolderTree}
            />
             <NewRackModal 
                isOpen={isRackModalOpen} 
                onClose={() => setIsRackModalOpen(false)} 
                onSubmit={handleCreateRack} 
            />
            
            {editingItem && editingItem.type === 'folder' && (
                <EditUserFolderModal 
                    isOpen={!!editingItem} 
                    onClose={() => setEditingItem(null)} 
                    onSubmit={handleUpdateItem} 
                    folder={editingItem} 
                    userFolderTree={userFolderTree}
                />
            )}
            {editingItem && editingItem.type === 'equipment' && (
                <EditUserEquipmentModal 
                    isOpen={!!editingItem} 
                    onClose={() => setEditingItem(null)} 
                    onSubmit={handleUpdateItem} 
                    equipment={editingItem} 
                    userFolderTree={userFolderTree}
                />
            )}
        </>
    );
};

export default UserLibraryView;