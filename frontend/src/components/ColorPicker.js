import React from 'react';
import { Check } from 'lucide-react';

const colors = [
    { name: 'Blue', hex: '#3b82f6' },
    { name: 'Brown', hex: '#92400e' },
    { name: 'Gray', hex: '#6b7280' },
    { name: 'Green', hex: '#22c55e' },
    { name: 'Orange', hex: '#f97316' },
    { name: 'Red', hex: '#ef4444' },
    { name: 'White', hex: '#f9fafb' },
    { name: 'Yellow', hex: '#eab308' },
    { name: 'Pink', hex: '#ec4899' },
    { name: 'Purple', hex: '#8b5cf6' },
    { name: 'Violet', hex: '#a855f7' },
];

const ColorPicker = ({ selectedColor, onChange, label = "Color" }) => {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
            <div className="grid grid-cols-6 gap-2">
                {colors.map(color => (
                    <button
                        key={color.name}
                        type="button"
                        title={color.name}
                        onClick={() => onChange(color.name)}
                        className="w-full aspect-square rounded-lg border-2 transition-all"
                        style={{ 
                            backgroundColor: color.hex,
                            borderColor: selectedColor === color.name ? color.hex : '#4b5563' // border-gray-600
                        }}
                    >
                        {selectedColor === color.name && (
                            <div className="flex justify-center items-center h-full">
                                <Check size={16} className="text-black mix-blend-difference" />
                            </div>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ColorPicker;
