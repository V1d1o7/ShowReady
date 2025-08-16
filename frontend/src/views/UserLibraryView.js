import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { ArrowLeft, Plus, Folder as FolderIcon, ChevronRight, ChevronDown, Trash2, GripVertical, Edit, HardDrive, Package } from 'lucide-react';
import { api } from '../api/api';
import Card from '../components/Card';
import NewUserEquipmentModal from '../components/NewUserEquipmentModal';
// We'll need new modals similar to the admin ones, let's create them inline for simplicity for now
import Modal from '../components/Modal';
import InputField from '../components/InputField';
import FolderOptions from '../components/FolderOptions';
import TreeView from './TreeView';

// A simple modal for creating a new folder in the user library
const NewUserFolderModal = ({ isOpen, onClose, onSubmit, userFolderTree }) => {
    const [name, setName] = useState('');
    const [parentId, setParentId] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, parent_id: parentId || null });
        setName('');
        setParentId('');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Folder in Your Library">
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField label="Folder Name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Parent Folder (Optional)</label>
                    <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                        <option value="">None (Root Level)</option>
                        <FolderOptions folders={userFolderTree} />
                    </select>
                </div>
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Create</button>
                </div>
            </form>
        </Modal>
    );
};

const UserLibraryView = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('equipment');
    const [library, setLibrary] = useState({ folders: [], equipment: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
    
    const fetchUserLibrary = useCallback(async () => {
        setIsLoading(true);
        try {
            // The getLibrary endpoint fetches both default and user items.
            // We filter here to get only the user's items.
            const fullLibrary = await api.getLibrary();
            const userLibrary = {
                folders: fullLibrary.folders.filter(f => !f.is_default),
                equipment: fullLibrary.equipment.filter(e => !e.is_default),
            };
            setLibrary(userLibrary);
        } catch (error) {
            console.error("Failed to fetch user library:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUserLibrary();
    }, [fetchUserLibrary]);

    const handleCreateFolder = async (folderData) => {
        try {
            await api.createUserFolder(folderData);
            await fetchUserLibrary();
        } catch (error) {
            console.error("Failed to create folder", error);
            alert(`Error: ${error.message}`);
        }
        setIsFolderModalOpen(false);
    };

    const handleCreateEquipment = async (equipmentData) => {
        try {
            await api.createUserEquipment(equipmentData);
            await fetchUserLibrary();
        } catch (error) {
            console.error("Failed to create equipment", error);
            alert(`Error: ${error.message}`);
        }
        setIsEquipmentModalOpen(false);
    };

    const userFolderTree = useMemo(() => {
        const itemsById = {};
        library.folders.forEach(item => { itemsById[item.id] = { ...item, children: [] }; });
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

    const userLibraryTree = useMemo(() => {
        // We create a single root for the user's library tree view
        const root = { id: 'user-root', name: 'My Library', children: [] };
        const itemsById = {};
        [...library.folders, ...library.equipment].forEach(item => {
            itemsById[item.id] = { ...item, children: [] };
        });
        Object.values(itemsById).forEach(item => {
            const parentId = item.parent_id || item.folder_id;
            if (parentId && itemsById[parentId]) {
                itemsById[parentId].children.push(item);
            } else {
                root.children.push(item);
            }
        });
        return [root];
    }, [library]);


    return (
        <>
            <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
                <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/account')} className="p-2 rounded-lg hover:bg-gray-700 transition-colors"><ArrowLeft size={20} /></button>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white">My Library</h1>
                    </div>
                </header>

                {/* Tab Navigation */}
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
                        <Card>
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
                                    <TreeView treeData={userLibraryTree} />
                                    // In the next phase, we will add full drag-drop and edit/delete here.
                                )}
                            </div>
                        </Card>
                    )}

                    {activeTab === 'racks' && (
                        <Card>
                             <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-white">My Saved Racks</h2>
                                <div className="flex gap-2">
                                    <button className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400">
                                        <Plus size={16} /> New Rack Template
                                    </button>
                                </div>
                            </div>
                            <div className="p-4 bg-gray-900/50 rounded-lg min-h-[300px] flex items-center justify-center">
                                <p className="text-gray-500">Rack Library management will be built here in the next phase.</p>
                            </div>
                        </Card>
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
        </>
    );
};

export default UserLibraryView;