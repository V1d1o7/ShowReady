import React, { useState, useEffect, useCallback } from 'react';
import { useShow } from '../contexts/ShowContext';
import { useModal } from '../contexts/ModalContext';
import { Plus, Edit, Trash2, FileText } from 'lucide-react';
import Card from '../components/Card';
import NamePromptModal from '../components/NamePromptModal';
import CableManagerModal from '../components/CableManagerModal';
import PdfPreviewModal from '../components/PdfPreviewModal';
import { api } from '../api/api';

const LoomBuilderView = () => {
    const { showName } = useShow();
    const { showConfirmationModal } = useModal();
    const [looms, setLooms] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isNameModalOpen, setIsNameModalOpen] = useState(false);
    const [managingLoom, setManagingLoom] = useState(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);

    const fetchLooms = useCallback(async () => {
        try {
            setIsLoading(true);
            const fetchedLooms = await api.getLoomsForShow(showName);
            setLooms(fetchedLooms);
        } catch (error) {
            console.error("Failed to fetch looms:", error);
        } finally {
            setIsLoading(false);
        }
    }, [showName]);

    useEffect(() => {
        fetchLooms();
    }, [fetchLooms]);

    const handleCreateLoom = async (name) => {
        try {
            await api.createLoom({ name, show_name: showName });
            fetchLooms();
        } catch (error) {
            console.error("Failed to create loom:", error);
            alert(`Error: ${error.message}`);
        }
        setIsNameModalOpen(false);
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
                }
            }
        );
    };

    const handleGeneratePdf = async (selectedLooms = null) => {
        const loomsToExport = selectedLooms ? (Array.isArray(selectedLooms) ? selectedLooms : [selectedLooms]) : looms;
        if (loomsToExport.length === 0) {
            alert("There are no looms to export.");
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
        } catch(e) { console.error("PDF generation failed", e); }
    };

    return (
        <>
            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-white">Loom Builder</h1>
                    <div className="flex items-center gap-4">
                        <button onClick={() => handleGeneratePdf()} disabled={looms.length === 0} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50">
                            <FileText size={16}/> Export All Looms
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
                                <th className="p-3 font-bold text-gray-400 uppercase tracking-wider">Created</th>
                                <th className="p-3 w-48 text-right font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan="3" className="text-center py-8 text-gray-500">Loading looms...</td></tr>
                            ) : looms.map((loom) => (
                                <tr key={loom.id} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                                    <td className="p-3 truncate max-w-xs">{loom.name}</td>
                                    <td className="p-3 truncate">{new Date(loom.created_at).toLocaleDateString()}</td>
                                    <td className="p-3 flex justify-end gap-2">
                                        <button onClick={() => setManagingLoom(loom)} className="text-blue-400 hover:text-blue-300">Edit Cables</button>
                                        <button onClick={() => handleDeleteLoom(loom.id)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))}
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

            {managingLoom && (
                <CableManagerModal
                    loom={managingLoom}
                    onClose={() => setManagingLoom(null)}
                    onExport={handleGeneratePdf}
                />
            )}
            <PdfPreviewModal url={pdfPreviewUrl} onClose={() => setPdfPreviewUrl(null)} />
        </>
    );
};

export default LoomBuilderView;
