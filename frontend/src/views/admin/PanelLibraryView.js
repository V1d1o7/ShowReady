import React, { useState, useEffect, useMemo } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Plus, Folder as FolderIcon, ChevronRight, ChevronDown, Trash2, GripVertical, Edit } from 'lucide-react';
import { api } from '../../api/api';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import toast, { Toaster } from 'react-hot-toast';
import InputField from '../../components/InputField';
import ConfirmationModal from '../../components/ConfirmationModal';

// --- Components ---

const DraggableItem = ({ item, type, children }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `pe-${type}-${item.id}`,
        data: { type, item }
    });
    const style = { opacity: isDragging ? 0.5 : 1 };
    return (
        <div ref={setNodeRef} style={style} className="flex items-center">
            <span {...listeners} {...attributes} className="cursor-grab p-1 text-gray-500 hover:text-white">
                <GripVertical size={16} />
            </span>
            {children}
        </div>
    );
};

const DroppableFolder = ({ item, children }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `folder-${item.id}`,
        data: { type: 'folder', item }
    });
    return (
        <div ref={setNodeRef} className={`transition-colors rounded-lg ${isOver ? 'bg-blue-500/20' : ''}`}>
            {children}
        </div>
    );
};

const PeTemplateForm = ({ formData, setFormData, folders }) => {
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSlotChange = (index, field, value) => {
        const newSlots = [...(formData.panel_slots || [])];
        newSlots[index][field] = value;
        setFormData({ ...formData, panel_slots: newSlots });
    };

    return (
        <div className="space-y-4">
            <InputField label="Name" name="name" value={formData.name} onChange={handleChange} required autoFocus />
            <div className="grid grid-cols-2 gap-4">
                <InputField label="Manufacturer" name="manufacturer" value={formData.manufacturer} onChange={handleChange} />
                <InputField label="Model Number" name="model_number" value={formData.model_number} onChange={handleChange} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <InputField label="Width Units" name="width_units" type="number" step="0.1" value={formData.width_units} onChange={handleChange} />
                <InputField label="Depth (in)" name="depth_in" type="number" step="0.1" value={formData.depth_in} onChange={handleChange} />
            </div>
            <InputField label="Slot Type (Accepted)" name="slot_type" value={formData.slot_type} onChange={handleChange} placeholder="e.g., UCP_BAY, D_HOLE" />
            
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Folder</label>
                <select name="folder_id" value={formData.folder_id || ''} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                    <option value="">Root</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
            </div>

            <div className="border-t border-gray-700 pt-4">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Panel Slots</h3>
                    <button type="button" onClick={() => setFormData({...formData, panel_slots: [...(formData.panel_slots || []), { id: crypto.randomUUID(), name: '', accepted_module_type: '' }]})} className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 text-gray-300">Add Slot</button>
                </div>
                <div className="space-y-2">
                    {(formData.panel_slots || []).map((slot, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                            <input className="flex-grow bg-gray-800 border border-gray-700 rounded p-1.5 text-xs text-white" placeholder="Slot Name" value={slot.name} onChange={(e) => handleSlotChange(idx, 'name', e.target.value)} />
                            <input className="w-24 bg-gray-800 border border-gray-700 rounded p-1.5 text-xs text-white" placeholder="Type" value={slot.accepted_module_type} onChange={(e) => handleSlotChange(idx, 'accepted_module_type', e.target.value)} />
                            <button type="button" onClick={() => setFormData({...formData, panel_slots: formData.panel_slots.filter((_, i) => i !== idx)})} className="text-red-500 hover:text-red-400">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const PanelLibraryView = () => {
    const [library, setLibrary] = useState({ folders: [], templates: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [formData, setFormData] = useState({ name: '', manufacturer: '', model_number: '', width_units: 1.0, depth_in: 0.0, slot_type: '', panel_slots: [], folder_id: '' });
    const [folderName, setFolderName] = useState('');
    const [expandedFolders, setExpandedFolders] = useState({});

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [folders, templates] = await Promise.all([
                api.getPanelFolders(),
                api.getPanelTemplates()
            ]);
            setLibrary({ folders, templates });
        } catch (error) {
            toast.error("Failed to load PE library.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleCreateFolder = async (e) => {
        e.preventDefault();
        try {
            await api.createAdminPanelFolder({ name: folderName });
            toast.success("Folder created.");
            fetchData();
            setIsFolderModalOpen(false);
            setFolderName('');
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleSaveTemplate = async (e) => {
        e.preventDefault();
        // Format payload properly to avoid 422 errors for UUIDs and Floats
        const payload = {
            ...formData,
            folder_id: formData.folder_id || null,
            width_units: parseFloat(formData.width_units) || 1.0,
            depth_in: parseFloat(formData.depth_in) || 0.0,
        };

        try {
            if (editingItem) {
                await api.updateAdminPanelTemplate(editingItem.id, payload);
                toast.success("Template updated.");
            } else {
                await api.createAdminPanelTemplate(payload);
                toast.success("Template created.");
            }
            fetchData();
            setIsTemplateModalOpen(false);
            setEditingItem(null);
            setFormData({ name: '', manufacturer: '', model_number: '', width_units: 1.0, depth_in: 0.0, slot_type: '', panel_slots: [], folder_id: '' });
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleDelete = async () => {
        try {
            if (itemToDelete.type === 'folder') {
                await api.deleteAdminPanelFolder(itemToDelete.id);
            } else {
                await api.deleteAdminPanelTemplate(itemToDelete.id);
            }
            toast.success("Item deleted.");
            fetchData();
            setItemToDelete(null);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const tree = useMemo(() => {
        const items = [];
        const folderMap = {};
        library.folders.forEach(f => folderMap[f.id] = { ...f, children: [], templates: [] });
        library.templates.forEach(t => {
            if (t.folder_id && folderMap[t.folder_id]) folderMap[t.folder_id].templates.push(t);
            else items.push({ type: 'template', ...t });
        });
        library.folders.forEach(f => {
            if (f.parent_id && folderMap[f.parent_id]) folderMap[f.parent_id].children.push(folderMap[f.id]);
            else if (!f.parent_id) items.push({ type: 'folder', ...folderMap[f.id] });
        });
        return items;
    }, [library]);

    const renderNode = (node) => {
        if (node.type === 'folder' || (!node.type && 'name' in node)) {
            const isOpen = expandedFolders[node.id];
            return (
                <li key={node.id} className="mb-1">
                    <div className="flex items-center group p-1 rounded-md hover:bg-gray-700">
                        <div className="flex items-center flex-grow cursor-pointer" onClick={() => setExpandedFolders({...expandedFolders, [node.id]: !isOpen})}>
                            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <FolderIcon size={16} className="mx-2 text-amber-500" />
                            <span className="truncate">{node.name}</span>
                        </div>
                        <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100">
                            <button onClick={() => setItemToDelete({ id: node.id, type: 'folder' })} className="p-1 text-gray-500 hover:text-red-400">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                    {isOpen && (
                        <ul className="pl-6 border-l border-gray-700 ml-3">
                            {(node.children || []).map(child => renderNode(child))}
                            {(node.templates || []).map(t => renderNode({ type: 'template', ...t }))}
                        </ul>
                    )}
                </li>
            );
        }
        return (
            <li key={node.id} className="my-1">
                <div className="flex items-center p-2 rounded-md hover:bg-gray-700 group">
                    <div className="flex-grow">
                        <p className="font-bold text-sm text-white">{node.name}</p>
                        <p className="text-xs text-gray-400">{node.manufacturer} {node.model_number}</p>
                    </div>
                    <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100">
                        <button onClick={() => { setEditingItem(node); setFormData(node); setIsTemplateModalOpen(true); }} className="p-1 text-gray-500 hover:text-amber-400">
                            <Edit size={14} />
                        </button>
                        <button onClick={() => setItemToDelete({ id: node.id, type: 'template' })} className="p-1 text-gray-500 hover:text-red-400">
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            </li>
        );
    };

    if (isLoading) return <div className="p-8 text-center text-gray-400">Loading PE Library...</div>;

    return (
        <div className="p-6">
            <Toaster position="bottom-center" />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-white">ShowReady PE Library Management</h1>
                <div className="flex gap-2">
                    <button onClick={() => setIsFolderModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600">
                        <Plus size={16} /> New Folder
                    </button>
                    <button onClick={() => { setEditingItem(null); setFormData({ name: '', width_units: 1.0, depth_in: 0.0, panel_slots: [] }); setIsTemplateModalOpen(true); }} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black rounded-lg hover:bg-amber-400 font-bold">
                        <Plus size={16} /> New PE Template
                    </button>
                </div>
            </div>

            <Card>
                <ul className="space-y-1">
                    {tree.map(node => renderNode(node))}
                </ul>
            </Card>

            <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title="New Folder">
                <form onSubmit={handleCreateFolder} className="p-4 space-y-4">
                    <InputField label="Folder Name" value={folderName} onChange={(e) => setFolderName(e.target.value)} required autoFocus />
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setIsFolderModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400">Create Folder</button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isTemplateModalOpen} onClose={() => setIsTemplateModalOpen(false)} title={editingItem ? 'Edit PE Template' : 'New PE Template'}>
                <form onSubmit={handleSaveTemplate} className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
                    <PeTemplateForm formData={formData} setFormData={setFormData} folders={library.folders} />
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                        <button type="button" onClick={() => setIsTemplateModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white font-bold">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400">
                            {editingItem ? 'Save Changes' : 'Create Template'}
                        </button>
                    </div>
                </form>
            </Modal>

            {itemToDelete && (
                <ConfirmationModal
                    isOpen={!!itemToDelete}
                    message={`Are you sure you want to delete this ${itemToDelete.type}? This action cannot be undone.`}
                    onConfirm={handleDelete}
                    onCancel={() => setItemToDelete(null)}
                />
            )}
        </div>
    );
};

export default PanelLibraryView;