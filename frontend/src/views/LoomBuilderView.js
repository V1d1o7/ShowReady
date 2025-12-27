import React, { useState, useEffect, useCallback } from 'react';
import { useShow } from '../contexts/ShowContext';
import { useModal } from '../contexts/ModalContext';
import { Plus, Edit, Copy, Trash2, Download, Printer, Spline, MessageSquare } from 'lucide-react';
import Card from '../components/Card';
import NamePromptModal from '../components/NamePromptModal';
import ContextualNotesDrawer from '../components/ContextualNotesDrawer';
import { useAuth } from '../contexts/AuthContext';
import CableManagerModal from '../components/CableManagerModal';
import PdfPreviewModal from '../components/PdfPreviewModal';
import { api } from '../api/api';
import useHotkeys from '../hooks/useHotkeys';
import toast from 'react-hot-toast';

const LoomBuilderView = () => {
    const { showId, showData, showOwnerId } = useShow();
    const { user, profile } = useAuth();
    const showName = showData?.info?.show_name;
    const { showConfirmationModal } = useModal();
    const [looms, setLooms] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isNameModalOpen, setIsNameModalOpen] = useState(false);
    const [editingLoom, setEditingLoom] = useState(null);
    const [managingLoom, setManagingLoom] = useState(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [loomToCopy, setLoomToCopy] = useState(null);
    const [isNotesDrawerOpen, setIsNotesDrawerOpen] = useState(false);
    const [notesContext, setNotesContext] = useState({ entityType: null, entityId: null });

    const openNotesDrawer = (entityType, entityId) => {
        setNotesContext({ entityType, entityId });
        setIsNotesDrawerOpen(true);
    };

    useHotkeys({
        'n': () => {
            if (!isNameModalOpen && !editingLoom && !managingLoom && !pdfPreviewUrl) {
                setIsNameModalOpen(true);
            }
        },
        'e': () => {
            if (!isNameModalOpen && !editingLoom && !managingLoom && !pdfPreviewUrl && looms.length > 0) {
                handleGeneratePdf();
            }
        },
    });

    const fetchLooms = useCallback(async () => {
        if (!showId) return;
        try {
            setIsLoading(true);
            const fetchedLooms = await api.getLoomsForShow(showId);
            setLooms(fetchedLooms);
        } catch (error) {
            console.error("Failed to fetch looms:", error);
            toast.error(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [showId]);

    useEffect(() => {
        fetchLooms();
    }, [fetchLooms]);

    const handleCreateLoom = async (name) => {
        try {
            const newLoom = await api.createLoom({ name, show_id: showId });
            fetchLooms();
            setManagingLoom(newLoom);
        } catch (error) {
            console.error("Failed to create loom:", error);
            toast.error(`Error: ${error.message}`);
        }
        setIsNameModalOpen(false);
    };

    const handleStartEditLoom = (loom) => {
        setEditingLoom(loom);
    };

    const handleUpdateLoomName = async (newName) => {
        if (!editingLoom || !newName) return;
        try {
            await api.updateLoom(editingLoom.id, { name: newName });
            fetchLooms();
        } catch (error) {
            console.error("Failed to update loom name:", error);
            toast.error(`Error: ${error.message}`);
        }
        setEditingLoom(null);
    };

    const handleDeleteLoom = (loomId) => {
        showConfirmationModal(
            "Are you sure you want to delete this entire loom and all its cables?",
            async () => {
                try {
                    await api.deleteLoom(loomId);
                    fetchLooms();
                } catch (error) {
                    console.error("Failed to delete loom:", error);
                    toast.error(`Error: ${error.message}`);
                }
            }
        );
    };

    const handleCopyLoom = async (newName) => {
        if (!loomToCopy) return;
        try {
            await api.copyLoom(loomToCopy.id, newName);
            fetchLooms();
        } catch (error) {
            console.error("Failed to copy loom:", error);
            toast.error(`Error: ${error.message}`);
        }
        setLoomToCopy(null);
    };

    const handleGeneratePdf = async (selectedLooms = null) => {
        const loomsToExport = selectedLooms ? (Array.isArray(selectedLooms) ? selectedLooms : [selectedLooms]) : looms;
        if (loomsToExport.length === 0) {
            toast.error("There are no looms to export.");
            return;
        }

        const body = {
            looms: loomsToExport,
            show_name: showName,
        };
   
        try {
            const blob = await api.generatePdf('loom_builder', body);
            const url = URL.createObjectURL(blob);
            setPdfPreviewUrl(url);
        } catch(e) {
            console.error("PDF generation failed", e);
            toast.error(`PDF Generation Failed: ${e.message}`);
        }
    };

    return (
        <>
            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-white">Loom Builder</h1>
                    <div className="flex items-center gap-4">
                        <button onClick={() => handleGeneratePdf()} disabled={looms.length === 0} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50">
                            <Download size={16}/> Export PDF
                        </button>
                        <button onClick={() => setIsNameModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors">
                            <Plus size={16}/> Add New Loom
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="border-b border-gray-700">
                            <tr>
                                <th className="p-3 font-bold text-gray-400 uppercase tracking-wider">Loom Name</th>
                                <th className="p-3 font-bold text-gray-400 uppercase tracking-wider">Length</th>
                                <th className="p-3 w-48 text-right font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan="3" className="text-center py-8 text-gray-500">Loading looms...</td></tr>
                            ) : looms.map((loom) => {
                                const longestCable = (loom.cables || []).reduce((max, cable) => {
                                    return Math.max(max, cable.length_ft || 0);
                                }, 0);

                                return (
                                    <tr key={loom.id} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                                        <td className="p-3 truncate max-w-xs">{loom.name}</td>
                                        <td className="p-3 truncate">{longestCable}ft</td>
                                        <td className="p-3 flex justify-end gap-3">
                                            {profile?.permitted_features?.includes('contextual_notes') && (
                                                <div className="relative">
                                                    <button onClick={() => openNotesDrawer('loom', loom.id)} title="Notes" className="text-gray-400 hover:text-blue-400">
                                                        <MessageSquare size={16} />
                                                    </button>
                                                    {loom.has_notes && (
                                                        <div className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></div>
                                                    )}
                                                </div>
                                            )}
                                            <button onClick={() => setManagingLoom(loom)} title="Edit Cables" className="text-blue-400 hover:text-blue-300"><Spline size={16} /></button>
                                            <button onClick={() => handleStartEditLoom(loom)} title="Edit Loom Name" className="text-gray-400 hover:text-gray-300"><Edit size={16} /></button>
                                            <button onClick={() => setLoomToCopy(loom)} title="Copy Loom" className="text-gray-400 hover:text-gray-300"><Copy size={16} /></button>
                                            <button onClick={() => handleGeneratePdf(loom)} title="Print Loom" className="text-gray-400 hover:text-gray-300"><Printer size={16} /></button>
                                            <button onClick={() => handleDeleteLoom(loom.id)} title="Delete Loom" className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {looms.length === 0 && !isLoading && (
                        <div className="text-center py-8 text-gray-500">
                            No looms created yet. Click "Add New Loom" to get started.
                        </div>
                    )}
                </div>
            </Card>
            
            {isNameModalOpen && (
                <NamePromptModal
                    isOpen={isNameModalOpen}
                    onClose={() => setIsNameModalOpen(false)}
                    onSubmit={handleCreateLoom}
                    title="Create New Loom"
                    label="Loom Name"
                />
            )}

            {editingLoom && (
                <NamePromptModal
                    isOpen={!!editingLoom}
                    onClose={() => setEditingLoom(null)}
                    onSubmit={handleUpdateLoomName}
                    title="Edit Loom Name"
                    label="New Loom Name"
                    initialValue={editingLoom.name}
                />
            )}

            {managingLoom && (
                <CableManagerModal
                    loom={managingLoom}
                    onClose={() => setManagingLoom(null)}
                    onExport={handleGeneratePdf}
                />
            )}

            {loomToCopy && (
                <NamePromptModal
                    isOpen={!!loomToCopy}
                    onClose={() => setLoomToCopy(null)}
                    onSubmit={handleCopyLoom}
                    title="Copy Loom"
                    label="New Loom Name"
                    initialValue={`${loomToCopy.name} (Copy)`}
                />
            )}
            <PdfPreviewModal 
                isOpen={!!pdfPreviewUrl} 
                url={pdfPreviewUrl} 
                onClose={() => {
                    URL.revokeObjectURL(pdfPreviewUrl);
                    setPdfPreviewUrl(null);
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
        </>
    );
};

export default LoomBuilderView;
