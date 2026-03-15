import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import InputField from '../InputField';
import { Trash2 } from 'lucide-react';

const PanelTemplateModal = ({ isOpen, onClose, editingTemplate, folders, onSave }) => {
    const defaultFormData = { name: '', manufacturer: '', model_number: '', width_units: 1.0, depth_in: 0.0, slot_type: '', visual_style: 'standard', panel_slots: [], ports: [], folder_id: '' };
    const [formData, setFormData] = useState(defaultFormData);

    useEffect(() => {
        if (isOpen) {
            setFormData(editingTemplate || defaultFormData);
        } else {
            setFormData(defaultFormData);
        }
    }, [isOpen, editingTemplate]);

    const isPlate = formData.panel_slots && formData.panel_slots.length > 0;
    const userFolders = folders.filter(f => !f.is_default);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleTypeToggle = (type) => {
        if (type === 'connector') {
            setFormData(prev => ({ ...prev, panel_slots: [], visual_style: prev.visual_style || 'standard' }));
        } else {
            setFormData(prev => ({ ...prev, visual_style: 'blank' }));
        }
    };

    const handleSlotChange = (index, field, value) => {
        const newSlots = [...(formData.panel_slots || [])];
        newSlots[index][field] = value;
        setFormData({ ...formData, panel_slots: newSlots });
    };

    const handlePortChange = (index, field, value) => {
        const newPorts = [...(formData.ports || [])];
        newPorts[index] = { ...newPorts[index], [field]: value };
        setFormData({ ...formData, ports: newPorts });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={editingTemplate ? 'Edit PE Template' : 'New PE Template'}>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
                <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700 mb-4">
                    <button 
                        type="button"
                        onClick={() => handleTypeToggle('connector')}
                        className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${!isPlate ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Connector / Barrel
                    </button>
                    <button 
                        type="button"
                        onClick={() => handleTypeToggle('plate')}
                        className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${isPlate ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Plate / Chassis
                    </button>
                </div>

                <InputField label="Name" name="name" value={formData.name || ''} onChange={handleChange} required autoFocus />
                
                <div className="grid grid-cols-2 gap-4">
                    <InputField label="Manufacturer" name="manufacturer" value={formData.manufacturer || ''} onChange={handleChange} />
                    <InputField label="Model Number" name="model_number" value={formData.model_number || ''} onChange={handleChange} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <InputField label="Width (Units/RU)" name="width_units" type="number" step="0.1" value={formData.width_units || ''} onChange={handleChange} />
                    <InputField label="Depth (Inches)" name="depth_in" type="number" step="0.1" value={formData.depth_in || ''} onChange={handleChange} />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Mounting Form Factor</label>
                        <input 
                            list="form-factors" 
                            name="slot_type" 
                            value={formData.slot_type || ''} 
                            onChange={handleChange} 
                            placeholder="e.g., steck, d_hole"
                            className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-amber-500 outline-none"
                        />
                        <datalist id="form-factors">
                            <option value="d-hole" />
                            <option value="steck" />
                            <option value="ucp" />
                            <option value="gblock" />
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Folder</label>
                        <select name="folder_id" value={formData.folder_id || ''} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white outline-none">
                            <option value="">Root</option>
                            {userFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                    </div>
                </div>

                {!isPlate ? (
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Visual Style (Connector Face)</label>
                        <select name="visual_style" value={formData.visual_style || 'standard'} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white outline-none">
                            <option value="standard">Standard (Generic)</option>
                            <option value="ethercon">EtherCON / RJ45</option>
                            <option value="xlr_f">XLR (Female)</option>
                            <option value="xlr_m">XLR (Male)</option>
                            <option value="bnc">BNC / SDI</option>
                            <option value="hdmi">HDMI</option>
                            <option value="opticalcon">opticalCON</option>
                            <option value="opticalcon_duo">OpticalCON DUO</option>
                            <option value="opticalcon_quad">OpticalCON QUAD</option>
                            <option value="mtp12">MTP12 Fiber</option>
                            <option value="mtp24">MTP24 Fiber</option>
                            <option value="mtp48">MTP48 Fiber</option>
                            <option value="true1">PowerCON True1</option>
                            <option value="powercon_blue">PowerCON (Blue In)</option>
                            <option value="powercon_white">PowerCON (White Out)</option>
                            <option value="speakon">speakON</option>
                            <option value="gblock_6pr">6-Pair G-Block</option>
                            <option value="gblock_12pr">12-Pair G-Block</option>
                        </select>
                    </div>
                ) : (
                    <div className="border-t border-gray-700 pt-4">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Panel Slots (Holes)</h3>
                            <button 
                                type="button" 
                                onClick={() => {
                                    const newIndex = (formData.panel_slots || []).length + 1;
                                    const newId = `${formData.id || 'new'}-slot-${Date.now().toString().slice(-5)}`;
                                    setFormData({...formData, panel_slots: [...(formData.panel_slots || []), { id: newId, name: `Hole ${newIndex}`, accepted_module_type: '' }]});
                                }} 
                                className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 text-gray-300"
                            >
                                + Add Slot
                            </button>
                        </div>
                        <div className="space-y-2">
                            {(formData.panel_slots || []).map((slot, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                    <input 
                                        className="flex-grow bg-gray-800 border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-amber-500" 
                                        placeholder="Slot Name (e.g. Hole 1)" 
                                        value={slot.name || ''} 
                                        onChange={(e) => handleSlotChange(idx, 'name', e.target.value)} 
                                    />
                                    <input 
                                        list="form-factors"
                                        className="w-32 bg-gray-800 border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-amber-500" 
                                        placeholder="Accepts..." 
                                        value={slot.accepted_module_type || ''} 
                                        onChange={(e) => handleSlotChange(idx, 'accepted_module_type', e.target.value)} 
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            if (formData.id && !window.confirm("WARNING: Deleting a hole from an existing template may orphan connectors already mounted to it in active shows. Continue?")) {
                                                return;
                                            }
                                            setFormData({...formData, panel_slots: formData.panel_slots.filter((_, i) => i !== idx)})
                                        }} 
                                        className="text-red-500 hover:text-red-400 p-1"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Ports/Circuits Configuration */}
                <div className="border-t border-gray-700 pt-4">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Ports/Circuits Configuration</h3>
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        const newIndex = (formData.ports || []).length + 1;
                                        const newId = crypto.randomUUID();
                                        setFormData({...formData, ports: [...(formData.ports || []), { id: newId, label: `${newIndex}`, connector_type: '' }]});
                                    }} 
                                    className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 text-gray-300"
                                >
                                    + Add Port
                                </button>
                            </div>
                            <div className="space-y-2">
                                {(formData.ports || []).map((port, idx) => (
                                    <div key={port.id || idx} className="flex gap-2 items-center">
                                        <input 
                                            className="w-20 bg-gray-800 border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-amber-500" 
                                            placeholder="Label" 
                                            value={port.label || ''} 
                                            onChange={(e) => handlePortChange(idx, 'label', e.target.value)} 
                                        />
                                        <select 
                                            className="flex-grow bg-gray-800 border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-amber-500"
                                            value={port.connector_type || ''} 
                                            onChange={(e) => handlePortChange(idx, 'connector_type', e.target.value)}
                                        >
                                            <option value="">Connector Type...</option>
                                            <option value="XLR-F">XLR-F</option>
                                            <option value="XLR-M">XLR-M</option>
                                            <option value="BNC">BNC</option>
                                            <option value="RJ45">RJ45</option>
                                            <option value="LC">LC</option>
                                            <option value="ST">ST</option>
                                            <option value="SC">SC</option>
                                            <option value="HDMI">HDMI</option>
                                            <option value="TRUE1">TRUE1</option>
                                            <option value="SPEAKON">SPEAKON</option>
                                        </select>
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                setFormData({...formData, ports: formData.ports.filter((_, i) => i !== idx)})
                                            }} 
                                            className="text-red-500 hover:text-red-400 p-1"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-bold">Cancel</button>
                    <button type="submit" className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400">
                        {editingTemplate ? 'Save Changes' : 'Create Template'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default PanelTemplateModal;