import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

const MultiSelect = ({ options, selected, onChange, placeholder = "Select..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);

    // Ensure 'selected' is always an array of primitives for consistent checks.
    const safeSelected = Array.isArray(selected) ? selected : [];

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (ref.current && !ref.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [ref]);

    const handleSelect = (optionValue) => {
        if (safeSelected.includes(optionValue)) {
            onChange(safeSelected.filter(item => item !== optionValue));
        } else {
            onChange([...safeSelected, optionValue]);
        }
    };

    const getSelectedLabels = () => {
        if (safeSelected.length === 0) return placeholder;
        // Ensure options is an array before filtering
        const validOptions = Array.isArray(options) ? options : [];
        const selectedOptions = validOptions.filter(opt => safeSelected.includes(opt.value));
        
        if (selectedOptions.length > 2) return `${selectedOptions.length} selected`;
        
        return selectedOptions.map(opt => opt.label).join(', ');
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex justify-between items-center p-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
            >
                <span className="truncate">{getSelectedLabels()}</span>
                <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {(Array.isArray(options) ? options : []).map(option => (
                        <label key={option.value} className="flex items-center w-full px-3 py-2 text-sm hover:bg-gray-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={safeSelected.includes(option.value)}
                                onChange={() => handleSelect(option.value)}
                                className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-amber-500 focus:ring-amber-500"
                            />
                            <span className="ml-3">{option.label}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MultiSelect;
