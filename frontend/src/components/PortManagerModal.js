import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import { Save } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const PortManagerModal = ({ isOpen, onClose, onSave, existingPort }) => {
    const [portData, setPortData] = useState({
        label: '',
        type: 'input',
        connector_type: ''
    });
    const portLabelRef = useRef(null);

    useEffect(() => {
        if (existingPort) {
            setPortData(existingPort);
        } else {
            setPortData({ label: '', type: 'input', connector_type: '' });
        }
    }, [existingPort, isOpen]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (portData.label && portData.connector_type) {
            onSave({ ...portData, id: existingPort ? existingPort.id : uuidv4() });
            onClose();
        }
    };

    const title = existingPort ? 'Edit Port' : 'Add New Port';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-md">
            <form onSubmit={handleSubmit} className="space-y-4 p-2">
                <InputField 
                    label="Port Label" 
                    type="text" 
                    value={portData.label} 
                    onChange={(e) => setPortData({ ...portData, label: e.target.value })} 
                    required 
                    ref={portLabelRef} 
                />
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Port Type</label>
                    <select 
                        value={portData.type} 
                        onChange={(e) => setPortData({ ...portData, type: e.target.value })} 
                        className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg"
                    >
                        <option value="input">Input</option>
                        <option value="output">Output</option>
                        <option value="io">IO</option>
                    </select>
                </div>
                <InputField 
                    label="Connector Type" 
                    type="text" 
                    value={portData.connector_type} 
                    onChange={(e) => setPortData({ ...portData, connector_type: e.target.value })} 
                    placeholder="e.g., HDMI, SDI, RJ45" 
                    required 
                />
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">
                        <Save size={16} /> {existingPort ? 'Save Changes' : 'Add Port'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default PortManagerModal;
