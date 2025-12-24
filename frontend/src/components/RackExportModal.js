import React, { useState } from 'react';
import Modal from './Modal';
import { Download, FileText, Layout, Layers, CheckSquare, Square, Zap } from 'lucide-react';

const RackExportModal = ({ isOpen, onClose, onExport, rackCount, selectedRackName }) => {
    const [scope, setScope] = useState(selectedRackName ? 'selected' : 'all');
    const [includeFrontRear, setIncludeFrontRear] = useState(true);
    const [includeSide, setIncludeSide] = useState(true);
    const [includeEquipmentList, setIncludeEquipmentList] = useState(false);
    const [includePowerReport, setIncludePowerReport] = useState(false); // NEW
    const [voltage, setVoltage] = useState(120); // NEW
    const [pageSize, setPageSize] = useState('letter');

    const handleExportClick = () => {
        onExport({
            scope,
            includeFrontRear,
            includeSide,
            includeEquipmentList,
            includePowerReport, // Pass to parent
            voltage,            // Pass to parent
            pageSize
        });
        onClose();
    };

    // Helper for custom checkbox UI
    const Checkbox = ({ label, checked, onChange, icon: Icon }) => (
        <div 
            onClick={() => onChange(!checked)}
            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                checked ? 'bg-amber-500/10 border-amber-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
        >
            <div className="flex items-center gap-3">
                {Icon && <Icon size={20} />}
                <span className="font-medium">{label}</span>
            </div>
            {checked ? <CheckSquare className="text-amber-500" size={20} /> : <Square size={20} />}
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Export Options">
            <div className="space-y-6 p-2">
                
                {/* SCOPE SECTION */}
                <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Export Scope</h4>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setScope('all')}
                            className={`p-3 rounded-lg border text-left transition-all ${
                                scope === 'all' ? 'bg-blue-500/20 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'
                            }`}
                        >
                            <span className="block font-bold text-lg">{rackCount}</span>
                            <span className="text-sm">All Racks</span>
                        </button>
                        <button
                            onClick={() => setScope('selected')}
                            disabled={!selectedRackName}
                            className={`p-3 rounded-lg border text-left transition-all ${
                                !selectedRackName ? 'opacity-50 cursor-not-allowed bg-gray-800 border-gray-800' :
                                scope === 'selected' ? 'bg-blue-500/20 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'
                            }`}
                        >
                            <span className="block font-bold text-lg">1</span>
                            <span className="text-sm truncate">{selectedRackName || 'No Rack Selected'}</span>
                        </button>
                    </div>
                </div>

                {/* DRAWINGS SECTION */}
                <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Drawings & Diagrams</h4>
                    <div className="space-y-2">
                        <Checkbox 
                            label="Front & Rear Elevations" 
                            checked={includeFrontRear} 
                            onChange={setIncludeFrontRear}
                            icon={Layout} 
                        />
                        <Checkbox 
                            label="Side Views (Depth)" 
                            checked={includeSide} 
                            onChange={setIncludeSide}
                            icon={Layers} 
                        />
                    </div>
                </div>

                {/* REPORTS & DATA SECTION */}
                <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Reports & Data</h4>
                    <div className="space-y-2">
                        <Checkbox 
                            label="Equipment List (PDF)" 
                            checked={includeEquipmentList} 
                            onChange={setIncludeEquipmentList}
                            icon={FileText} 
                        />
                        
                        {/* POWER REPORT OPTION */}
                        <div>
                            <Checkbox 
                                label="Power Calculation Report" 
                                checked={includePowerReport} 
                                onChange={setIncludePowerReport}
                                icon={Zap} 
                            />
                            {/* Nested Voltage Selection */}
                            {includePowerReport && (
                                <div className="ml-4 mt-2 p-3 bg-gray-900/50 rounded-lg border border-gray-700 flex items-center justify-between">
                                    <span className="text-sm text-gray-300">Voltage Basis:</span>
                                    <div className="flex bg-gray-800 rounded p-1 border border-gray-700">
                                        <button 
                                            onClick={() => setVoltage(120)}
                                            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${voltage === 120 ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            120V
                                        </button>
                                        <button 
                                            onClick={() => setVoltage(220)}
                                            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${voltage === 220 ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            220V
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* SETTINGS */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Page Size</label>
                    <select 
                        value={pageSize} 
                        onChange={(e) => setPageSize(e.target.value)}
                        className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    >
                        <option value="letter">Letter (8.5" x 11")</option>
                        <option value="tabloid">Tabloid (11" x 17")</option>
                    </select>
                </div>

                {/* ACTION */}
                <div className="pt-2">
                    <button 
                        onClick={handleExportClick}
                        className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                        <Download size={20} />
                        Export Selected Items
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default RackExportModal;