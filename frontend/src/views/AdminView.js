import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Folder as FolderIcon, ChevronRight, ChevronDown, Trash2 } from 'lucide-react';
import { api } from '../api/api';
import Card from '../components/Card';
import InputField from '../components/InputField';
import Modal from '../components/Modal';

// --- HELPER COMPONENT FOR HIERARCHICAL DROPDOWNS ---
const FolderOptions = ({ folders, currentFolderId = null, indent = 0 }) => {
    const prefix = '\u00A0\u00A0'.repeat(indent); // Indentation using non-breaking spaces
    
    return folders.map(folder => {
        if (folder.id === currentFolderId) return null;

        return (
            <React.Fragment key={folder.id}>
                <option value={folder.id}>{prefix}{folder.name}</option>
                {folder.children && folder.children.length > 0 && (
                    <FolderOptions folders={folder.children} currentFolderId={currentFolderId} indent={indent + 1} />
                )}
            </React.Fragment>
        );
    });
};

const AdminTreeView = ({ folders, equipment, onDeleteFolder, onDeleteEquipment }) => {
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
            } else if (!parentId) {
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
                    <div className="flex items-center group p-1 rounded-md hover:bg-gray-700">
                        <div className="flex items-center flex-grow cursor-pointer" onClick={() => toggleFolder(node.id)}>
                            {expandedFolders[node.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <FolderIcon size={16} className="mx-2 flex-shrink-0" />
                            <span className="truncate">{node.name}</span>
                            {node.nomenclature_prefix && <span className="ml-2 text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">{node.nomenclature_prefix}</span>}
                        </div>
                        <button onClick={() => onDeleteFolder(node.id)} className="ml-auto text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 size={14} />
                        </button>
                    </div>
                    {expandedFolders[node.id] && (
                        <ul className="pl-4 border-l border-gray-700 ml-3">
                            {node.children.map(child => renderNode(child))}
                        </ul>
                    )}
                </li>
            );
        }

        return (
             <li key={node.id} className="flex items-center group p-2 my-1 rounded-md hover:bg-gray-700">
                <div className="flex-grow">
                    <p className="font-bold text-sm truncate">{node.model_number} <span className="text-gray-400 font-normal">({node.width}-width)</span></p>
                    <p className="text-xs text-gray-400">{node.manufacturer} - {node.ru_height}RU</p>
                </div>
                <button onClick={() => onDeleteEquipment(node.id)} className="ml-auto text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={14} />
                </button>
            </li>
        );
    };

    return <ul>{tree.map(node => renderNode(node))}</ul>;
};

const NewFolderModal = ({ isOpen, onClose, onSubmit, folderTree }) => {
    const [name, setName] = useState('');
    const [parentId, setParentId] = useState('');
    const [prefix, setPrefix] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, parent_id: parentId || null, nomenclature_prefix: prefix || null });
        setName(''); setParentId(''); setPrefix('');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Default Folder">
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField label="Folder Name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
                <InputField label="Nomenclature Prefix (Optional)" type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g., KVM" />
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Parent Folder (Optional)</label>
                    <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                        <option value="">None (Root Level)</option>
                        <FolderOptions folders={folderTree} />
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

const NewEquipmentModal = ({ isOpen, onClose, onSubmit, folderTree }) => {
    const [formData, setFormData] = useState({ model_number: '', manufacturer: '', ru_height: 1, width: 'full', folder_id: '' });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleSubmit = (e) => {
        e.preventDefault();
        const dataToSubmit = { ...formData, ru_height: parseInt(formData.ru_height, 10), folder_id: formData.folder_id || null };
        onSubmit(dataToSubmit);
        setFormData({ model_number: '', manufacturer: '', ru_height: 1, width: 'full', folder_id: '' });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Equipment Template">
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField label="Model Number" name="model_number" value={formData.model_number} onChange={handleChange} required autoFocus />
                <InputField label="Manufacturer" name="manufacturer" value={formData.manufacturer} onChange={handleChange} required />
                <div className="grid grid-cols-2 gap-4">
                    <InputField label="RU Height" name="ru_height" type="number" min="1" value={formData.ru_height} onChange={handleChange} required />
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Width</label>
                        <select name="width" value={formData.width} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                            <option value="full">Full</option>
                            <option value="half">Half</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Parent Folder (Optional)</label>
                    <select name="folder_id" value={formData.folder_id} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                        <option value="">None (Root Level)</option>
                        <FolderOptions folders={folderTree} />
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


const AdminView = () => {
    const navigate = useNavigate();
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

    useEffect(() => { fetchAdminLibrary(); }, []);
    
    const handleCreateFolder = async (folderData) => {
        try { await api.createAdminFolder(folderData); await fetchAdminLibrary(); }
        catch(error) { console.error("Failed to create folder", error); alert(`Error: ${error.message}`); }
        setIsFolderModalOpen(false);
    };

    const handleCreateEquipment = async (equipmentData) => {
        try { await api.createAdminEquipment(equipmentData); await fetchAdminLibrary(); }
        catch(error) { console.error("Failed to create equipment", error); alert(`Error: ${error.message}`); }
        setIsEquipmentModalOpen(false);
    };

    const handleDeleteFolder = async (folderId) => {
        if (!window.confirm("Are you sure you want to delete this folder? It must be empty.")) return;
        
        const originalLibrary = { ...library };
        
        // Optimistically update the UI
        setLibrary(prev => ({
            ...prev,
            folders: prev.folders.filter(f => f.id !== folderId),
        }));

        try {
            const res = await api.deleteAdminFolder(folderId);
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Failed to delete folder.");
            }
        } catch (error) {
            console.error("Failed to delete folder", error);
            alert(`Error: ${error.message}. Reverting change.`);
            // Rollback on error
            setLibrary(originalLibrary);
        }
    };

    const handleDeleteEquipment = async (equipmentId) => {
        if (!window.confirm("Are you sure you want to delete this equipment?")) return;

        const originalLibrary = { ...library };
        
        // Optimistically update the UI
        setLibrary(prev => ({
            ...prev,
            equipment: prev.equipment.filter(e => e.id !== equipmentId),
        }));
        
        try {
            const res = await api.deleteAdminEquipment(equipmentId);
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Failed to delete equipment.");
            }
        } catch (error) {
            console.error("Failed to delete equipment", error);
            alert(`Error: ${error.message}. Reverting change.`);
            // Rollback on error
            setLibrary(originalLibrary);
        }
    };
    
    const folderTree = useMemo(() => {
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

    if (isLoading) return <div className="p-8 text-center text-gray-400">Loading Admin Library...</div>;

    return (
        <>
            <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
                <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/account')} className="p-2 rounded-lg hover:bg-gray-700 transition-colors"><ArrowLeft size={20} /></button>
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
                           <AdminTreeView folders={library.folders} equipment={library.equipment} onDeleteFolder={handleDeleteFolder} onDeleteEquipment={handleDeleteEquipment} />
                        </div>
                    </Card>
                </main>
            </div>
            <NewFolderModal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} onSubmit={handleCreateFolder} folderTree={folderTree} />
            <NewEquipmentModal isOpen={isEquipmentModalOpen} onClose={() => setIsEquipmentModalOpen(false)} onSubmit={handleCreateEquipment} folderTree={folderTree} />
        </>
    );
};

export default AdminView;