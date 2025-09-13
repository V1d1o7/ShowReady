import React, { useState, useEffect } from 'react';
import InputField from './InputField';
import LocationSelector from './LocationSelector';
import ColorPicker from './ColorPicker';
import { Save, X } from 'lucide-react';

const CableForm = ({ cable, onSave, onCancel }) => {
    const [formData, setFormData] = useState(cable);
    const [isOriginColorSame, setIsOriginColorSame] = useState(cable.origin_color === cable.destination_color);

    useEffect(() => {
        setFormData(cable);
        setIsOriginColorSame(cable.origin_color === cable.destination_color);
    }, [cable]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleLocationChange = (name, value) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleOriginColorChange = (color) => {
        const newFormData = { ...formData, origin_color: color };
        if (isOriginColorSame) {
            newFormData.destination_color = color;
        }
        setFormData(newFormData);
    };
    
    const handleDestinationColorChange = (color) => {
        setFormData({ ...formData, destination_color: color });
    };

    const handleSameColorToggle = (e) => {
        const isChecked = e.target.checked;
        setIsOriginColorSame(isChecked);
        if (isChecked) {
            setFormData(prev => ({ ...prev, destination_color: prev.origin_color }));
        }
    };

    const handleSave = () => {
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 overflow-y-auto p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl p-8 w-full max-w-2xl space-y-6 border border-gray-700 my-auto">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-white">Edit Cable</h2>
                    <button onClick={onCancel} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-4">
                    <InputField 
                        label="Label Content"
                        name="label_content"
                        value={formData.label_content}
                        onChange={handleChange}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <InputField 
                            label="Cable Type"
                            name="cable_type"
                            value={formData.cable_type}
                            onChange={handleChange}
                        />
                        <InputField 
                            label="Length (ft)"
                            name="length_ft"
                            type="number"
                            value={formData.length_ft}
                            onChange={handleChange}
                        />
                    </div>
                    
                    <LocationSelector 
                        label="Origin"
                        value={formData.origin}
                        onChange={(value) => handleLocationChange('origin', value)}
                    />
                    <LocationSelector 
                        label="Destination"
                        value={formData.destination}
                        onChange={(value) => handleLocationChange('destination', value)}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ColorPicker 
                            label="Origin Color"
                            selectedColor={formData.origin_color}
                            onChange={handleOriginColorChange}
                        />
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-sm font-medium text-gray-300">Destination Color</label>
                                <div className="flex items-center">
                                    <input 
                                        id="same-color-checkbox"
                                        type="checkbox"
                                        checked={isOriginColorSame}
                                        onChange={handleSameColorToggle}
                                        className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-amber-500 focus:ring-amber-500"
                                    />
                                    <label htmlFor="same-color-checkbox" className="ml-2 text-xs text-gray-400">Same as Origin</label>
                                </div>
                            </div>
                            {!isOriginColorSame && (
                                <ColorPicker 
                                    selectedColor={formData.destination_color}
                                    onChange={handleDestinationColorChange}
                                    label=""
                                />
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-4 pt-4">
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg text-white bg-gray-600 hover:bg-gray-500 transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 rounded-lg text-black bg-amber-500 hover:bg-amber-400 font-bold transition-colors flex items-center gap-2">
                        <Save size={16} /> Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CableForm;
