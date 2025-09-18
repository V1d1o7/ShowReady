import React, { useState, useEffect } from 'react';
import InputField from './InputField';
import LocationSelector from './LocationSelector';
import ColorPicker from './ColorPicker';
import { Save, X } from 'lucide-react';

const BulkEditCableForm = ({ onSave, onCancel, selectedCables }) => {
    const [updateFields, setUpdateFields] = useState({
        length_ft: false,
        cable_type: false,
        origin: false,
        destination: false,
        origin_color: false,
        destination_color: false,
    });

    const [formData, setFormData] = useState({
        length_ft: '',
        cable_type: '',
        origin: { type: 'rack', value: '', end: 'Male' },
        destination: { type: 'rack', value: '', end: 'Male' },
        origin_color: 'Blue',
        destination_color: 'Blue',
    });

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onCancel();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onCancel]);

    const handleCheckboxChange = (e) => {
        const { name, checked } = e.target;
        setUpdateFields(prev => ({ ...prev, [name]: checked }));
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleLocationChange = (name, value) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleColorChange = (name, color) => {
        setFormData(prev => ({ ...prev, [name]: color }));
    };

    const handleSave = () => {
        const updates = {};
        for (const key in updateFields) {
            if (updateFields[key]) {
                updates[key] = formData[key];
            }
        }
        onSave(updates);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 overflow-y-auto p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl p-8 w-full max-w-2xl space-y-6 border border-gray-700 my-auto">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-white">Bulk Edit {selectedCables.length} Cables</h2>
                    <button onClick={onCancel} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <input type="checkbox" name="cable_type" checked={updateFields.cable_type} onChange={handleCheckboxChange} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-amber-500 focus:ring-amber-500" />
                        <InputField label="Cable Type" name="cable_type" value={formData.cable_type} onChange={handleChange} disabled={!updateFields.cable_type} />
                    </div>
                    <div className="flex items-center gap-4">
                        <input type="checkbox" name="length_ft" checked={updateFields.length_ft} onChange={handleCheckboxChange} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-amber-500 focus:ring-amber-500" />
                        <InputField label="Length (ft)" name="length_ft" type="number" value={formData.length_ft} onChange={handleChange} disabled={!updateFields.length_ft} />
                    </div>

                    <div className="flex items-start gap-4">
                        <input type="checkbox" name="origin" checked={updateFields.origin} onChange={handleCheckboxChange} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-amber-500 focus:ring-amber-500 mt-2" />
                        <div className="w-full">
                            <LocationSelector label="Origin" value={formData.origin} onChange={(value) => handleLocationChange('origin', value)} disabled={!updateFields.origin} />
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <input type="checkbox" name="destination" checked={updateFields.destination} onChange={handleCheckboxChange} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-amber-500 focus:ring-amber-500 mt-2" />
                        <div className="w-full">
                            <LocationSelector label="Destination" value={formData.destination} onChange={(value) => handleLocationChange('destination', value)} disabled={!updateFields.destination} />
                        </div>
                    </div>

                    <div className="flex items-start gap-4">
                        <input type="checkbox" name="origin_color" checked={updateFields.origin_color} onChange={handleCheckboxChange} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-amber-500 focus:ring-amber-500 mt-2" />
                        <div className="w-full">
                            <ColorPicker label="Origin Color" selectedColor={formData.origin_color} onChange={(color) => handleColorChange('origin_color', color)} disabled={!updateFields.origin_color} />
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <input type="checkbox" name="destination_color" checked={updateFields.destination_color} onChange={handleCheckboxChange} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-amber-500 focus:ring-amber-500 mt-2" />
                        <div className="w-full">
                            <ColorPicker label="Destination Color" selectedColor={formData.destination_color} onChange={(color) => handleColorChange('destination_color', color)} disabled={!updateFields.destination_color} />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-4 pt-4">
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg text-white bg-gray-600 hover:bg-gray-500 transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 rounded-lg text-black bg-amber-500 hover:bg-amber-400 font-bold transition-colors flex items-center gap-2">
                        <Save size={16} /> Apply Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BulkEditCableForm;