import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Plus, Folder as FolderIcon, ChevronRight, ChevronDown } from 'lucide-react';
import { api } from '../api/api';
import Card from '../components/Card';
import InputField from '../components/InputField';
import Modal from '../components/Modal';

// A simple TreeView component tailored for the admin panel
const AdminTreeView = ({ folders, equipment }) => {
    const [expandedFolders, setExpandedFolders] = useState({});

    const toggleFolder = (folderId) => {
        setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
    };

    const tree = useMemo(() => {
        const itemsById = {};
        [...folders, ...equipment].forEach(item => {
            itemsById[item.id] = { ...item, children: [] };
        });

        const roots = [];
        Object.values(itemsById).forEach(item => {
            const parentId = item.parent_id || item.folder_id;
            if (parentId && itemsById[parentId]) {
                itemsById[parentId].children.push(item);
            } else if (!parentId) { // Only root items
                roots.push(item);
            }
        });
        return roots;
    }, [folders, equipment]);

    const renderNode = (node) => {
        const isFolder = 'parent_id' in node || (node.children && node.children.some(child => 'parent_id' in child));

        if (isFolder) {
            return (
                <li key={node.id}>
                    <div
                        className="flex items-center cursor-pointer p-1 rounded-md hover:bg-gray-700"
                        onClick={() => toggleFolder(node.id)}
                    >
                        {expandedFolders[node.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <FolderIcon size={16} className="mx-2 flex-shrink-0" />
                        <span className="truncate">{node.name}</span>
                    </div>
                    {expandedFolders[node.id] && (
                        <ul className="pl-4 border-l border-gray-700 ml-3">
                            {node.children.map(child => renderNode(child))}
                        </ul>
                    )}
                </li>
            );
        }

        // Render equipment
        return (
            <li key={node.id} className="p-2 my-1 rounded-md">
                <p className="font-bold text-sm truncate">{node.model_number}</p>
                <p className="text-xs text-gray-400">{node.manufacturer} - {node.ru_height}RU</p>
            </li>
        );
    };

    return <ul>{tree.map(node => renderNode(node))}</ul>;
};


const NewFolderModal = ({ isOpen, onClose, onSubmit, folders }) => {
    const [name, setName] = useState('');
    const [parentId, setParentId] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, parent_id: parentId || null });
        setName('');
        setParentId('');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Default Folder">
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField label="Folder Name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Parent Folder (Optional)</label>
                    <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                        <option value="">None (Root Level)</option>
                        {folders.map(folder => (
                            <option key={folder.id} value={folder.id}>{folder.name}</option>
                        ))}
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

const NewEquipmentModal = ({ isOpen, onClose, onSubmit, folders }) => {
    const [formData, setFormData] = useState({
        model_number: '',
        manufacturer: '',
        ru_height: 1,
        folder_id: ''
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const dataToSubmit = {
            ...formData,
            ru_height: parseInt(formData.ru_height, 10),
            folder_id: formData.folder_id || null
        };
        onSubmit(dataToSubmit);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Equipment Template">
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField label="Model Number" name="model_number" value={formData.model_number} onChange={handleChange} required autoFocus />
                <InputField label="Manufacturer" name="manufacturer" value={formData.manufacturer} onChange={handleChange} required />
                <InputField label="RU Height" name="ru_height" type="number" min="1" value={formData.ru_height} onChange={handleChange} required />
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Parent Folder (Optional)</label>
                    <select name="folder_id" value={formData.folder_id} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                        <option value="">None (Root Level)</option>
                        {folders.map(folder => (
                            <option key={folder.id} value={folder.id}>{folder.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Create Equipment</button>
                </div>
            </form>
        </Modal>
    );
};


const AdminView = ({ onBack }) => {
    const [library, setLibrary] = useState({ folders: [], equipment: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);

    const fetchAdminLibrary = async () => {
        setIsLoading(true);
        try {
            const libraryData = await api.getAdminLibrary();
            setLibrary(libraryData);
        } catch (error) {
            console.error("Failed to fetch admin library:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAdminLibrary();
    }, []);
    
    const handleCreateFolder = async (folderData) => {
        try {
            await api.createAdminFolder(folderData);
            await fetchAdminLibrary();
        } catch(error) {
            console.error("Failed to create folder", error);
            alert(`Error: ${error.message}`);
        }
        setIsFolderModalOpen(false);
    };

    const handleCreateEquipment = async (equipmentData) => {
        try {
            await api.createAdminEquipment(equipmentData);
            await fetchAdminLibrary();
        } catch(error) {
            console.error("Failed to create equipment", error);
            alert(`Error: ${error.message}`);
        }
        setIsEquipmentModalOpen(false);
    };

    if (isLoading) {
        return <div className="p-8 text-center text-gray-400">Loading Admin Library...</div>;
    }

    return (
        <>
            <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
                <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-700 transition-colors"><ArrowLeft size={20} /></button>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white">Super Admin Panel</h1>
                    </div>
                </header>
                <main className="space-y-8">
                    <Card>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-white">Default Equipment Library</h2>
                            <div className="flex gap-2">
                                <button onClick={() => setIsFolderModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600">
                                    <Plus size={16} /> New Folder
                                </button>
                                <button onClick={() => setIsEquipmentModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400">
                                    <Plus size={16} /> New Equipment
                                </button>
                            </div>
                        </div>
                        <div className="p-4 bg-gray-900/50 rounded-lg">
                           <AdminTreeView folders={library.folders} equipment={library.equipment} />
                        </div>
                    </Card>
                </main>
            </div>
            <NewFolderModal 
                isOpen={isFolderModalOpen} 
                onClose={() => setIsFolderModalOpen(false)} 
                onSubmit={handleCreateFolder}
                folders={library.folders}
            />
            <NewEquipmentModal 
                isOpen={isEquipmentModalOpen} 
                onClose={() => setIsEquipmentModalOpen(false)} 
                onSubmit={handleCreateEquipment}
                folders={library.folders}
            />
        </>
    );
};

export default AdminView;