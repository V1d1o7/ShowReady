import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, ChevronsUpDown, Grid3x3, Eye } from 'lucide-react';
import Card from './Card';
import EditableLabelRow from './EditableLabelRow';
import NewSheetModal from './NewSheetModal';
import PdfPreviewModal from './PdfPreviewModal';
import AdvancedPrintModal from './AdvancedPrintModal';
import { api } from '../api/api';

function LabelManagerView({ sheetType, showData, onSave, labelFields, pdfType }) {
    const [activeSheetName, setActiveSheetName] = useState('');
    const [isNewSheetModalOpen, setIsNewSheetModalOpen] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [isAdvancedPrintModalOpen, setIsAdvancedPrintModalOpen] = useState(false);
    const [editingIndex, setEditingIndex] = useState(null);
    const [editFormData, setEditFormData] = useState({});

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
 
    const handleAddNewLabel = () => {
        const newLabel = labelFields.reduce((acc, f) => ({...acc, [f.name]: ''}), {});
        const newLabels = [...labels, newLabel];
        handleUpdateLabels(newLabels);
        setEditingIndex(newLabels.length - 1);
        setEditFormData(newLabel);
    };

    const handleEditClick = (label, index) => {
        setEditingIndex(index);
        setEditFormData(label);
    };
 
    const handleCancelEdit = () => {
        if (labels[editingIndex] && Object.values(labels[editingIndex]).every(val => val === '')) {
            const newLabels = labels.filter((_, i) => i !== editingIndex);
            handleUpdateLabels(newLabels);
        }
        setEditingIndex(null);
    };

    const handleSaveEdit = (index) => {
        const newLabels = [...labels];
        newLabels[index] = editFormData;
        handleUpdateLabels(newLabels);
        setEditingIndex(null);
    };

    const handleDeleteLabel = (indexToDelete) => {
        if (!window.confirm("Are you sure you want to delete this label?")) return;
        const newLabels = labels.filter((_, i) => i !== indexToDelete);
        handleUpdateLabels(newLabels);
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
                            <button onClick={handleAddNewLabel} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors">
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
                            {labels.map((label, idx) => (
                                editingIndex === idx ? (
                                    <EditableLabelRow
                                        key={idx}
                                        fields={labelFields}
                                        formData={editFormData}
                                        setFormData={setEditFormData}
                                        onSave={() => handleSaveEdit(idx)}
                                        onCancel={handleCancelEdit}
                                    />
                                ) : (
                                    <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                                        {labelFields.map(f => <td key={f.name} className="p-3 truncate">{label[f.name]}</td>)}
                                        <td className="p-3 flex justify-end gap-2">
                                            <button onClick={() => handleEditClick(label, idx)} className="text-blue-400 hover:text-blue-300"><Edit size={16} /></button>
                                            <button onClick={() => handleDeleteLabel(idx)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                )
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={() => setIsAdvancedPrintModalOpen(true)} disabled={labels.length === 0} className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-white transition-colors text-sm disabled:bg-gray-600 disabled:text-gray-400">
                        <Grid3x3 size={16} /> Advanced Print
                    </button>
                    <button onClick={() => handleGeneratePdf()} disabled={labels.length === 0} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors text-sm disabled:bg-gray-600 disabled:text-gray-400">
                        <Eye size={16} /> Generate Full Sheet
                    </button>
                </div>
            </Card>
     
            <NewSheetModal isOpen={isNewSheetModalOpen} onClose={() => setIsNewSheetModalOpen(false)} onSubmit={handleCreateSheet} />
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
        </>
    );
}

export default LabelManagerView;