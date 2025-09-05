import React, { useState, useEffect, useMemo } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Plus, Folder as FolderIcon, ChevronRight, ChevronDown, Trash2, GripVertical, Edit, Send, MailPlus } from 'lucide-react';
import { api } from '../api/api';
import Card from '../components/Card';
import InputField from '../components/InputField';
import Modal from '../components/Modal';
import NewEquipmentModal from '../components/NewEquipmentModal';
import FolderOptions from '../components/FolderOptions';
import EditFolderModal from '../components/EditFolderModal';
import EditEquipmentModal from '../components/EditEquipmentModal';
import toast, { Toaster } from 'react-hot-toast';


// --- Sender Identity Manager Component ---
const SenderManager = ({ senders, onUpdate }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [loginEmail, setLoginEmail] = useState('');

    const handleAddSender = async (e) => {
        e.preventDefault();
        try {
            // REMOVED: app_password from this object
            await api.createSenderIdentity({ name, email, sender_login_email: loginEmail });
            toast.success("Sender identity added!");
            onUpdate();
            setIsModalOpen(false);
            setName('');
            setEmail('');
            setLoginEmail('');
        } catch (error) {
            toast.error(`Failed to add sender: ${error.message}`);
        }
    };

    const handleDeleteSender = async (id) => {
        if (!window.confirm("Are you sure you want to delete this sender identity?")) return;
        try {
            await api.deleteSenderIdentity(id);
            toast.success("Sender identity deleted!");
            onUpdate();
        } catch (error) {
            toast.error(`Failed to delete sender: ${error.message}`);
        }
    };

    return (
        <>
            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Sender Identities</h2>
                    <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600">
                        <MailPlus size={16} /> Add Sender
                    </button>
                </div>
                <div className="space-y-2">
                    {senders.map(sender => (
                        <div key={sender.id} className="flex justify-between items-center p-2 bg-gray-800/50 rounded-lg">
                            <div>
                                <p className="font-bold">{sender.name}</p>
                                <p className="text-sm text-gray-400">{sender.email}</p>
                            </div>
                            <button onClick={() => handleDeleteSender(sender.id)} className="p-2 text-gray-500 hover:text-red-400">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </Card>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Sender Identity">
                <form onSubmit={handleAddSender} className="space-y-4">
                    <InputField label="Display Name" value={name} onChange={(e) => setName(e.target.value)} required />
                    <InputField label="Display Email (From Address)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    <InputField label="Login Email (for SMTP)" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                    {/* REMOVED: Google App Password InputField */}
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Save Sender</button>
                    </div>
                </form>
            </Modal>
        </>
    );
};


// --- Email Composer Component ---
const EmailComposer = ({ senders }) => {
    const [roles, setRoles] = useState([]);
    const [senderId, setSenderId] = useState('');
    const [toRole, setToRole] = useState('all');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        if (senders.length > 0 && !senderId) {
            setSenderId(senders[0].id);
        }
    }, [senders, senderId]);

    useEffect(() => {
        api.getAdminUserRoles()
            .then(data => setRoles(data.roles || []))
            .catch(err => console.error("Failed to fetch roles:", err));
    }, []);

    const handleSendEmail = async (e) => {
        e.preventDefault();
        if (!senderId || !toRole || !subject || !body) {
            toast.error("Please fill out all fields before sending.");
            return;
        }

        setIsSending(true);
        const toastId = toast.loading('Sending emails...');

        try {
            const response = await api.adminSendEmail({
                sender_id: senderId,
                to_role: toRole,
                subject: subject,
                body: body
            });
            toast.success(response.message || "Emails sent successfully!", { id: toastId });
            // Clear the form on success
            setToRole('all');
            setSubject('');
            setBody('');
        } catch (error) {
            toast.error(`Failed to send emails: ${error.message}`, { id: toastId });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Card>
            <h2 className="text-xl font-bold text-white mb-4">Email Composer</h2>
            <form onSubmit={handleSendEmail} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label htmlFor="sender_id" className="block text-sm font-medium text-gray-300 mb-1.5">From:</label>
                        <select
                            id="sender_id"
                            value={senderId}
                            onChange={(e) => setSenderId(e.target.value)}
                            className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                        >
                            {senders.map(sender => (
                                <option key={sender.id} value={sender.id}>{sender.name} ({sender.email})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="to_role" className="block text-sm font-medium text-gray-300 mb-1.5">To:</label>
                        <select
                            id="to_role"
                            value={toRole}
                            onChange={(e) => setToRole(e.target.value)}
                            className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                        >
                            <option value="all">All Users</option>
                            {roles.map(role => (
                                <option key={role} value={role}>{role}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <InputField
                    label="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                />
                <div>
                    <label htmlFor="body" className="block text-sm font-medium text-gray-300 mb-1.5">Body</label>
                    <textarea
                        id="body"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        required
                        placeholder="Type your message here. Use '----' on a new line to create a section break."
                        className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg h-48 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                    />
                </div>
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={isSending || senders.length === 0}
                        className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send size={16} />
                        {isSending ? 'Sending...' : 'Send Email'}
                    </button>
                </div>
            </form>
        </Card>
    );
};


// --- Draggable Tree Components ---

const DraggableItem = ({ item, type, children }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `${type}-${item.id}`,
        data: { type, item }
    });
    
    const style = {
        opacity: isDragging ? 0.5 : 1,
    };

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

const AdminTreeView = ({ folders, equipment, onDeleteFolder, onDeleteEquipment, onEditItem }) => {
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
        
        Object.values(itemsById).forEach(item => {
            item.children.sort((a, b) => {
                const aIsFolder = 'parent_id' in a || (a.children && a.children.length > 0);
                const bIsFolder = 'parent_id' in b || (b.children && b.children.length > 0);
                if (aIsFolder && !bIsFolder) return -1;
                if (!aIsFolder && bIsFolder) return 1;
                return (a.name || a.model_number).localeCompare(b.name || b.model_number);
            });
        });
        return roots;
    }, [folders, equipment]);

    const renderNode = (node) => {
        const isFolder = 'parent_id' in node || (node.children && node.children.some(child => 'parent_id' in child));

        if (isFolder) {
            return (
                <li key={node.id}>
                    <DroppableFolder item={node}>
                        <div className="flex items-center group p-1 rounded-md hover:bg-gray-700">
                             <DraggableItem item={node} type="folder">
                                <div className="flex items-center flex-grow cursor-pointer" onClick={() => toggleFolder(node.id)}>
                                    {expandedFolders[node.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    <FolderIcon size={16} className="mx-2 flex-shrink-0" />
                                    <span className="truncate">{node.name}</span>
                                    {node.nomenclature_prefix && <span className="ml-2 text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">{node.nomenclature_prefix}</span>}
                                </div>
                             </DraggableItem>
                            <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => onEditItem(node, 'folder')} className="p-1 text-gray-500 hover:text-amber-400">
                                    <Edit size={14} />
                                </button>
                                <button onClick={() => onDeleteFolder(node.id)} className="p-1 text-gray-500 hover:text-red-400">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    </DroppableFolder>
                    {expandedFolders[node.id] && (
                        <ul className="pl-6 border-l border-gray-700 ml-3">
                            {node.children.map(child => renderNode(child))}
                        </ul>
                    )}
                </li>
            );
        }

        return (
             <li key={node.id} className="group my-1">
                <DraggableItem item={node} type="equipment">
                     <div className="flex items-center flex-grow p-2 rounded-md hover:bg-gray-700">
                        <div className="flex-grow">
                            <p className="font-bold text-sm truncate">{node.model_number} <span className="text-gray-400 font-normal">({node.width}-width)</span></p>
                            <p className="text-xs text-gray-400">{node.manufacturer} - {node.ru_height}RU</p>
                        </div>
                        <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => onEditItem(node, 'equipment')} className="p-1 text-gray-500 hover:text-amber-400">
                                <Edit size={14} />
                            </button>
                            <button onClick={() => onDeleteEquipment(node.id)} className="p-1 text-gray-500 hover:text-red-400">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                </DraggableItem>
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


const AdminView = () => {
    const [library, setLibrary] = useState({ folders: [], equipment: [] });
    const [senders, setSenders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
    const [activeDragItem, setActiveDragItem] = useState(null);
    const [editingItem, setEditingItem] = useState(null);
    const sensors = useSensors(useSensor(PointerSensor));

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [libraryData, sendersData] = await Promise.all([
                api.getAdminLibrary(),
                api.getSenderIdentities()
            ]);
            setLibrary(libraryData);
            setSenders(sendersData);
        } catch (error) {
            console.error("Failed to fetch admin data:", error);
            toast.error("Failed to load admin data.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleDragStart = (event) => {
        setActiveDragItem(event.active.data.current.item);
    };
    
    const handleDragEnd = async (event) => {
        setActiveDragItem(null);
        const { active, over } = event;

        if (!over || active.id === over.id) return;

        const activeType = active.data.current.type;
        const activeItem = active.data.current.item;
        const overType = over.data.current.type;
        const overItem = over.data.current.item;

        if (overType === 'folder') {
            if (activeType === 'equipment' && activeItem.folder_id !== overItem.id) {
                setLibrary(prev => ({ ...prev, equipment: prev.equipment.map(e => e.id === activeItem.id ? { ...e, folder_id: overItem.id } : e)}));
                try { 
                    await api.updateAdminEquipment(activeItem.id, { folder_id: overItem.id }); 
                } catch (error) { 
                    console.error("Failed to move equipment", error); 
                    alert(`Error: ${error.message}`); 
                    fetchData(); 
                }
            } else if (activeType === 'folder' && activeItem.parent_id !== overItem.id) {
                 setLibrary(prev => ({ ...prev, folders: prev.folders.map(f => f.id === activeItem.id ? { ...f, parent_id: overItem.id } : f)}));
                try { 
                    await api.updateAdminFolder(activeItem.id, { parent_id: overItem.id }); 
                } catch (error) { 
                    console.error("Failed to move folder", error); 
                    alert(`Error: ${error.message}`); 
                    fetchData(); 
                }
            }
        }
    };

    const handleCreateFolder = async (folderData) => {
        try { 
            await api.createAdminFolder(folderData); 
            await fetchData(); 
        } catch(error) { 
            console.error("Failed to create folder", error); 
            alert(`Error: ${error.message}`); 
        }
        setIsFolderModalOpen(false);
    };

    const handleCreateEquipment = async (equipmentData) => {
        try { 
            await api.createAdminEquipment(equipmentData); 
            await fetchData(); 
        } catch(error) { 
            console.error("Failed to create equipment", error); 
            alert(`Error: ${error.message}`); 
        }
        setIsEquipmentModalOpen(false);
    };

    const handleDeleteFolder = async (folderId) => {
        if (!window.confirm("Are you sure? This will also delete all equipment and subfolders inside.")) return;
        try { 
            const res = await api.deleteAdminFolder(folderId); 
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Failed to delete folder.");
            }
            await fetchData();
        } catch(error) { 
            console.error("Failed to delete folder", error); 
            alert(`Error: ${error.message}`);
        }
    };

    const handleDeleteEquipment = async (equipmentId) => {
        if (!window.confirm("Are you sure?")) return;
        try { 
            const res = await api.deleteAdminEquipment(equipmentId); 
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Failed to delete equipment.");
            }
            await fetchData();
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
                await api.updateAdminFolder(editingItem.id, updatedData);
            } else {
                await api.updateAdminEquipment(editingItem.id, updatedData);
            }
            await fetchData();
        } catch(error) {
            console.error("Failed to update item", error);
            alert(`Error: ${error.message}`);
        } finally {
            setEditingItem(null);
        }
    };

    const folderTree = useMemo(() => {
        const itemsById = {};
        library.folders.forEach(item => { itemsById[item.id] = { ...item, children: [] }; });
        const roots = [];
        Object.values(itemsById).forEach(item => {
            if (item.parent_id && itemsById[item.parent_id]) {
                itemsById[item.parent_id].children.push(item);
            } else if (!item.parent_id) {
                roots.push(item);
            }
        });
        return roots;
    }, [library.folders]);

    if (isLoading) return <div className="p-8 text-center text-gray-400">Loading Admin Panel...</div>;

    return (
        <>
            <Toaster position="bottom-center" />
            <div className="h-full flex flex-col p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto w-full">
                <header className="flex-shrink-0 flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white">Super Admin Panel</h1>
                    </div>
                </header>
                <main className="flex-grow min-h-0 space-y-8 overflow-y-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <EmailComposer senders={senders} />
                        <SenderManager senders={senders} onUpdate={fetchData} />
                    </div>

                    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                        <Card className="h-full flex flex-col">
                            <div className="flex-shrink-0 flex justify-between items-center mb-4">
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
                            <div className="flex-grow min-h-[300px] overflow-y-auto p-4 bg-gray-900/50 rounded-lg">
                               <AdminTreeView 
                                   folders={library.folders} 
                                   equipment={library.equipment} 
                                   onDeleteFolder={handleDeleteFolder} 
                                   onDeleteEquipment={handleDeleteEquipment} 
                                   onEditItem={handleEditItem}
                                />
                            </div>
                        </Card>
                        <DragOverlay>
                            {activeDragItem ? (
                                <div className="bg-gray-700 p-2 rounded-md text-sm shadow-lg">
                                    {activeDragItem.name || activeDragItem.model_number}
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </main>
            </div>
            
            {/* Modals */}
            <NewFolderModal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} onSubmit={handleCreateFolder} folderTree={folderTree} />
            <NewEquipmentModal isOpen={isEquipmentModalOpen} onClose={() => setIsEquipmentModalOpen(false)} onSubmit={handleCreateEquipment} folderTree={folderTree} />
            
            {editingItem && editingItem.type === 'folder' && (
                <EditFolderModal 
                    isOpen={!!editingItem} 
                    onClose={() => setEditingItem(null)} 
                    onSubmit={handleUpdateItem} 
                    folder={editingItem} 
                />
            )}
            {editingItem && editingItem.type === 'equipment' && (
                <EditEquipmentModal 
                    isOpen={!!editingItem} 
                    onClose={() => setEditingItem(null)} 
                    onSubmit={handleUpdateItem} 
                    equipment={editingItem} 
                />
            )}
        </>
    );
};

export default AdminView;
