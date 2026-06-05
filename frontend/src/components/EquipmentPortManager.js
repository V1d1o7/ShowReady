import React, { useState } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import PortManagerModal from './PortManagerModal';
import { Plus, Trash2, Edit, Copy, CheckSquare, Square, List } from 'lucide-react';
import { generateLabels } from '../utils/patternHelper';

const EquipmentPortManager = ({ ports, setPorts }) => {
    const [selectedIds, setSelectedIds] = useState([]);
    
    // Single Port
    const [isPortModalOpen, setIsPortModalOpen] = useState(false);
    const [editingPort, setEditingPort] = useState(null);

    // Range Modal
    const [isRangeModalOpen, setIsRangeModalOpen] = useState(false);
    const [rangeData, setRangeData] = useState({ pattern: '', start: 1, count: 1, type: 'input', connector_type: '' });

    // Bulk Edit Modal
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [bulkData, setBulkData] = useState({ pattern: '', start: 1, type: '', connector_type: '' });

    const toggleSelection = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
    };

    const toggleAll = () => {
        if (selectedIds.length === ports.length && ports.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(ports.map(p => p.id));
        }
    };

    const handleDeleteSelected = () => {
        setPorts(ports.filter(p => !selectedIds.includes(p.id)));
        setSelectedIds([]);
    };

    const handleDuplicateSelected = () => {
        const toDuplicate = ports.filter(p => selectedIds.includes(p.id));
        const newPorts = toDuplicate.map(p => ({
            ...p,
            id: crypto.randomUUID(),
            label: `${p.label} (Copy)`
        }));
        setPorts([...ports, ...newPorts]);
    };

    // Single Port Actions
    const handleSaveSinglePort = (updatedPort) => {
        if (editingPort) {
            setPorts(ports.map(p => p.id === updatedPort.id ? updatedPort : p));
        } else {
            setPorts([...ports, updatedPort]);
        }
        setEditingPort(null);
        setIsPortModalOpen(false);
    };

    // Range Add Action
    const handleAddRange = (e) => {
        e.preventDefault();
        const labels = generateLabels(rangeData.pattern, rangeData.start, rangeData.count);
        const newPorts = labels.map(label => ({
            id: crypto.randomUUID(),
            label: label,
            type: rangeData.type,
            connector_type: rangeData.connector_type
        }));
        setPorts([...ports, ...newPorts]);
        setIsRangeModalOpen(false);
        setRangeData({ pattern: '', start: 1, count: 1, type: 'input', connector_type: '' });
    };

    // Bulk Edit Action
    const handleBulkEdit = (e) => {
        e.preventDefault();
        let newLabels = [];
        if (bulkData.pattern) {
            newLabels = generateLabels(bulkData.pattern, bulkData.start, selectedIds.length);
        }

        let labelIndex = 0;
        const updatedPorts = ports.map(p => {
            if (selectedIds.includes(p.id)) {
                return {
                    ...p,
                    label: bulkData.pattern ? newLabels[labelIndex++] : p.label,
                    type: bulkData.type || p.type,
                    connector_type: bulkData.connector_type || p.connector_type
                };
            }
            return p;
        });

        setPorts(updatedPorts);
        setIsBulkModalOpen(false);
        setSelectedIds([]);
        setBulkData({ pattern: '', start: 1, type: '', connector_type: '' });
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-md font-bold text-white">Ports ({ports.length})</h3>
                <div className="flex gap-2">
                    <button type="button" onClick={() => { setEditingPort(null); setIsPortModalOpen(true); }} className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white">
                        <Plus size={14} /> Add Port
                    </button>
                    <button type="button" onClick={() => setIsRangeModalOpen(true)} className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white">
                        <List size={14} /> Add Range
                    </button>
                </div>
            </div>

            {ports.length > 0 && (
                <div className="flex items-center gap-2 mb-2 p-2 bg-gray-800 rounded border border-gray-700">
                    <button type="button" onClick={toggleAll} className="p-1 text-gray-400 hover:text-white">
                        {selectedIds.length === ports.length ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <span className="text-xs text-gray-400 font-bold">{selectedIds.length} Selected</span>
                    
                    {selectedIds.length > 0 && (
                        <div className="flex gap-2 ml-auto">
                            <button type="button" onClick={() => setIsBulkModalOpen(true)} className="text-gray-400 hover:text-blue-400" title="Bulk Edit">
                                <Edit size={16} />
                            </button>
                            <button type="button" onClick={handleDuplicateSelected} className="text-gray-400 hover:text-green-400" title="Duplicate">
                                <Copy size={16} />
                            </button>
                            <button type="button" onClick={handleDeleteSelected} className="text-gray-400 hover:text-red-400" title="Delete">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-1 mb-4 max-h-48 overflow-y-auto">
                {ports.map((port) => (
                    <div key={port.id} className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded border ${selectedIds.includes(port.id) ? 'bg-gray-700 border-amber-500' : 'bg-gray-800 border-gray-700'}`}>
                        <button type="button" onClick={() => toggleSelection(port.id)} className="text-gray-400 hover:text-white flex-shrink-0">
                            {selectedIds.includes(port.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                        </button>
                        <span className="flex-1 truncate">{port.label}</span>
                        <span className="text-xs text-gray-500 w-16">{port.type}</span>
                        <span className="text-xs text-gray-500 w-24 truncate">{port.connector_type}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <button type="button" onClick={() => { setEditingPort(port); setIsPortModalOpen(true); }} className="p-1 text-gray-400 hover:text-amber-400">
                                <Edit size={14} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Single Port Modal */}
            {isPortModalOpen && (
                <PortManagerModal
                    isOpen={isPortModalOpen}
                    onClose={() => { setIsPortModalOpen(false); setEditingPort(null); }}
                    onSave={handleSaveSinglePort}
                    existingPort={editingPort}
                />
            )}

            {/* Add Range Modal */}
            {isRangeModalOpen && (
                <Modal isOpen={isRangeModalOpen} onClose={() => setIsRangeModalOpen(false)} title="Add Port Range" maxWidth="max-w-md">
                    <form onSubmit={handleAddRange} className="p-4 space-y-4">
                        <InputField label="Pattern (use {n}, {nn}, {a}, {A})" value={rangeData.pattern} onChange={(e) => setRangeData({...rangeData, pattern: e.target.value})} placeholder="e.g. SDI IN {nn}" required />
                        <div className="grid grid-cols-2 gap-4">
                            <InputField label="Start From" type="number" value={rangeData.start} onChange={(e) => setRangeData({...rangeData, start: parseInt(e.target.value, 10)})} required />
                            <InputField label="Count" type="number" min="1" value={rangeData.count} onChange={(e) => setRangeData({...rangeData, count: parseInt(e.target.value, 10)})} required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Type</label>
                                <select value={rangeData.type} onChange={(e) => setRangeData({...rangeData, type: e.target.value})} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                                    <option value="input">Input</option>
                                    <option value="output">Output</option>
                                    <option value="io">IO</option>
                                </select>
                            </div>
                            <InputField label="Connector Type" value={rangeData.connector_type} onChange={(e) => setRangeData({...rangeData, connector_type: e.target.value})} required />
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                            <button type="button" onClick={() => setIsRangeModalOpen(false)} className="px-4 py-2 bg-gray-700 rounded text-white font-bold">Cancel</button>
                            <button type="submit" className="px-4 py-2 bg-amber-500 rounded text-black font-bold">Generate Range</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Bulk Edit Modal */}
            {isBulkModalOpen && (
                <Modal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} title={`Bulk Edit ${selectedIds.length} Ports`} maxWidth="max-w-md">
                    <form onSubmit={handleBulkEdit} className="p-4 space-y-4">
                        <p className="text-xs text-gray-400">Leave fields blank to keep existing values.</p>
                        <InputField label="New Pattern (use {n}, {nn}, {a}, {A})" value={bulkData.pattern} onChange={(e) => setBulkData({...bulkData, pattern: e.target.value})} placeholder="e.g. SDI OUT {nn}" />
                        {bulkData.pattern && (
                            <InputField label="Start Number/Letter" type="number" value={bulkData.start} onChange={(e) => setBulkData({...bulkData, start: parseInt(e.target.value, 10)})} />
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">New Type</label>
                                <select value={bulkData.type} onChange={(e) => setBulkData({...bulkData, type: e.target.value})} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                                    <option value="">-- No Change --</option>
                                    <option value="input">Input</option>
                                    <option value="output">Output</option>
                                    <option value="io">IO</option>
                                </select>
                            </div>
                            <InputField label="New Connector Type" value={bulkData.connector_type} onChange={(e) => setBulkData({...bulkData, connector_type: e.target.value})} placeholder="e.g. BNC" />
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                            <button type="button" onClick={() => setIsBulkModalOpen(false)} className="px-4 py-2 bg-gray-700 rounded text-white font-bold">Cancel</button>
                            <button type="submit" className="px-4 py-2 bg-amber-500 rounded text-black font-bold">Apply Edit</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default EquipmentPortManager;