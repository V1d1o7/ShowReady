import React, { useState } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import { Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const PortManagerModal = ({ isOpen, onClose, ports, setPorts }) => {
    const [newPort, setNewPort] = useState({ label: '', type: 'input', connector_type: '' });

    const handleAddPort = (e) => {
        e.preventDefault();
        if (newPort.label && newPort.connector_type) {
            setPorts([...ports, { ...newPort, id: uuidv4() }]);
            setNewPort({ label: '', type: 'input', connector_type: '' });
        }
    };

    const handleRemovePort = (id) => {
        setPorts(ports.filter(port => port.id !== id));
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Manage Ports" maxWidth="max-w-xl">
            <div className="space-y-4">
                <form onSubmit={handleAddPort} className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-grow space-y-2">
                        <InputField label="Port Label" type="text" value={newPort.label} onChange={(e) => setNewPort({ ...newPort, label: e.target.value })} required />
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">Port Type</label>
                            <select value={newPort.type} onChange={(e) => setNewPort({ ...newPort, type: e.target.value })} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg">
                                <option value="input">Input</option>
                                <option value="output">Output</option>
                                <option value="io">IO</option>
                            </select>
                        </div>
                        <InputField label="Connector Type" type="text" value={newPort.connector_type} onChange={(e) => setNewPort({ ...newPort, connector_type: e.target.value })} placeholder="e.g., HDMI, SDI, RJ45" required />
                    </div>
                    <button type="submit" className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">
                        <Plus size={16} /> Add Port
                    </button>
                </form>
                
                <div className="max-h-64 overflow-y-auto border border-gray-700 rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-700 sticky top-0">
                            <tr>
                                <th className="p-3 text-left">Label</th>
                                <th className="p-3 text-left">Type</th>
                                <th className="p-3 text-left">Connector</th>
                                <th className="p-3 w-16"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {ports.map((port) => (
                                <tr key={port.id} className="border-t border-gray-700/50 hover:bg-gray-800/50">
                                    <td className="p-3">{port.label}</td>
                                    <td className="p-3">{port.type}</td>
                                    <td className="p-3">{port.connector_type}</td>
                                    <td className="p-3 text-right">
                                        <button onClick={() => handleRemovePort(port.id)} className="text-red-400 hover:text-red-300">
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors">Done</button>
            </div>
        </Modal>
    );
};

export default PortManagerModal;
