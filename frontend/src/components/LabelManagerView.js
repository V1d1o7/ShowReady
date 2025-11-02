import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, ChevronsUpDown, Grid3x3, Download } from 'lucide-react';
import Card from './Card';
import NewSheetModal from './NewSheetModal';
import PdfPreviewModal from './PdfPreviewModal';
import AdvancedPrintModal from './AdvancedPrintModal';
import { api } from '../api/api';
import ConfirmationModal from './ConfirmationModal';
import NewLabelModal from './NewLabelModal';
import useHotkeys from '../hooks/useHotkeys';

function LabelManagerView({ sheetType, showData, onSave, labelFields, pdfType }) {
    const [activeSheetName, setActiveSheetName] = useState('');
    const [isNewSheetModalOpen, setIsNewSheetModalOpen] = useState(false);
    const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
    const [editingLabel, setEditingLabel] = useState(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [isAdvancedPrintModalOpen, setIsAdvancedPrintModalOpen] = useState(false);
    const [confirmationModal, setConfirmationModal] = useState({ isOpen: false, message: '', onConfirm: () => {} });

    const sheets = useMemo(() => showData[sheetType] || {}, [showData, sheetType]);
    const sheetNames = useMemo(() => Object.keys(sheets), [sheets]);
    const labels = useMemo(() => (activeSheetName ? sheets[activeSheetName] || [] : []), [activeSheetName, sheets]);
    const numSlots = useMemo(() => (pdfType === 'case' ? 2 : 24), [pdfType]);

    useEffect(() => {
        if (sheetNames.length > 0 && !sheetNames.includes(activeSheetName)) {
            setActiveSheetName(sheetNames[0]);
        } else if (sheetNames.length === 0) {
            setActiveSheetName('');
        }
    }, [sheetNames, activeSheetName]);

    const handleOpenNewLabelModal = () => {
        setEditingLabel(null);
        setIsLabelModalOpen(true);
    };

    useHotkeys({
        'n': () => {
            if (activeSheetName && !isNewSheetModalOpen && !isLabelModalOpen && !pdfPreviewUrl && !isAdvancedPrintModalOpen && !confirmationModal.isOpen) {
                handleOpenNewLabelModal();
            }
        },
        'e': () => {
            if (labels.length > 0) {
                handleGeneratePdf();
            }
        },
        'esc': () => {
            if (isLabelModalOpen) {
                setIsLabelModalOpen(false);
            }
        }
    });

    const handleCreateSheet = (newSheetName) => {
        if (!newSheetName || sheetNames.includes(newSheetName)) {
            alert("Sheet name cannot be empty or a duplicate.");
            return;
        }
        const updatedShowData = {
            ...showData,
            [sheetType]: { ...sheets, [newSheetName]: [] }
        };
        onSave(updatedShowData);
        setActiveSheetName(newSheetName);
        setIsNewSheetModalOpen(false);
    };

    const handleUpdateLabels = (newLabels) => {
        const updatedShowData = { ...showData, [sheetType]: { ...sheets, [activeSheetName]: newLabels } };
        onSave(updatedShowData);
    };

    const handleSaveLabel = (formData) => {
        let newLabels;
        if (editingLabel) {
            newLabels = labels.map(label => (label.id === editingLabel.id ? { ...label, ...formData } : label));
        } else {
            const newLabel = { id: Date.now(), ...formData };
            newLabels = [...labels, newLabel];
        }
        handleUpdateLabels(newLabels);
        setIsLabelModalOpen(false);
        setEditingLabel(null);
    };

    const handleEditLabel = (label) => {
        setEditingLabel(label);
        setIsLabelModalOpen(true);
    };

    const handleDeleteLabel = (idToDelete) => {
        setConfirmationModal({
            isOpen: true,
            message: "Are you sure you want to delete this label?",
            onConfirm: () => {
                const newLabels = labels.filter(label => label.id !== idToDelete);
                handleUpdateLabels(newLabels);
                setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
            }
        });
    };

    const handleGeneratePdf = async (placement = null) => {
        const body = { labels };
        if (pdfType === 'case') body.logo_path = showData.info.logo_path;
        if (placement) body.placement = placement;

        try {
            const blob = await api.generatePdf(pdfType, body);
            const url = URL.createObjectURL(blob);
            setPdfPreviewUrl(url);
        } catch(e) { console.error("PDF generation failed", e); }
    };

    return (
        <>
            <Card>
                <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <select value={activeSheetName} onChange={(e) => setActiveSheetName(e.target.value)} className="appearance-none p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                                <option value="" disabled>{sheetNames.length === 0 ? 'No sheets' : 'Select a sheet'}</option>
                                {sheetNames.map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                            <ChevronsUpDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                        <button onClick={() => setIsNewSheetModalOpen(true)} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg"><Plus size={18} /></button>
                    </div>
                    {activeSheetName && (
                        <div className="flex items-center gap-2">
                            <button onClick={handleOpenNewLabelModal} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors">
                                <Plus size={16}/> Add Label
                            </button>
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b border-gray-700">
                            <tr>
                                {labelFields.map(f => <th key={f.name} className="p-3 text-left font-bold text-gray-400 uppercase tracking-wider">{f.label}</th>)}
                                <th className="p-3 w-28 text-right font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {labels.map((label) => (
                                <tr key={label.id} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                                    {labelFields.map(f => <td key={f.name} className="p-3 truncate">{label[f.name]}</td>)}
                                    <td className="p-3 flex justify-end gap-2">
                                        <button onClick={() => handleEditLabel(label)} className="text-blue-400 hover:text-blue-300"><Edit size={16} /></button>
                                        <button onClick={() => handleDeleteLabel(label.id)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={() => setIsAdvancedPrintModalOpen(true)} disabled={labels.length === 0} className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-white transition-colors text-sm disabled:bg-gray-600 disabled:text-gray-400">
                        <Grid3x3 size={16} /> Advanced Print
                    </button>
                    <button onClick={() => handleGeneratePdf()} disabled={labels.length === 0} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors text-sm disabled:bg-gray-600 disabled:text-gray-400">
                        <Download size={16} /> Export PDF
                    </button>
                </div>
            </Card>

            <NewSheetModal isOpen={isNewSheetModalOpen} onClose={() => setIsNewSheetModalOpen(false)} onSubmit={handleCreateSheet} />
            
            {isLabelModalOpen && (
                <NewLabelModal
                    isOpen={isLabelModalOpen}
                    onClose={() => setIsLabelModalOpen(false)}
                    onSubmit={handleSaveLabel}
                    labelFields={labelFields}
                    initialData={editingLabel}
                />
            )}

            <PdfPreviewModal url={pdfPreviewUrl} onClose={() => setPdfPreviewUrl(null)} />
            
            {isAdvancedPrintModalOpen && <AdvancedPrintModal
                key={pdfType}
                isOpen={isAdvancedPrintModalOpen}
                onClose={() => setIsAdvancedPrintModalOpen(false)}
                labels={labels}
                onGeneratePdf={handleGeneratePdf}
                numSlots={numSlots}
                pdfType={pdfType}
            />}
            
            {confirmationModal.isOpen && (
                <ConfirmationModal
                    message={confirmationModal.message}
                    onConfirm={confirmationModal.onConfirm}
                    onCancel={() => setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} })}
                />
            )}
        </>
    );
}

export default LabelManagerView;