import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

const MultiSelect = ({ options, selected, onChange, placeholder = "Select..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (ref.current && !ref.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [ref]);

    const handleSelect = (option) => {
        if (selected.includes(option)) {
            onChange(selected.filter(item => item !== option));
        } else {
            onChange([...selected, option]);
        }
    };

    const selectedText = selected.length > 0
        ? `${selected.length} selected`
        : placeholder;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex justify-between items-center p-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
            >
                <span>{selectedText}</span>
                <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {options.map(option => (
                        <label key={option} className="flex items-center w-full px-3 py-2 text-sm hover:bg-gray-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={selected.includes(option)}
                                onChange={() => handleSelect(option)}
                                className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-amber-500 focus:ring-amber-500"
                            />
                            <span className="ml-3">{option}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MultiSelect;
