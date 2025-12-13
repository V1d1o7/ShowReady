import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';

const MultiSelect = ({ 
    options = [], 
    value, 
    selected, // Legacy prop support
    onChange, 
    isCreatable = false, 
    placeholder = "Select..." 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const containerRef = useRef(null);

    // 1. Unify 'value' and 'selected'
    const rawValue = value !== undefined ? value : selected;
    const safeValue = Array.isArray(rawValue) ? rawValue : [];

    // 2. Detect Mode (String vs Object)
    // If the first item is a string/number, we assume "Primitive Mode".
    // If empty, we default to "Primitive Mode" as that's the legacy behavior.
    const isPrimitiveMode = safeValue.length === 0 || typeof safeValue[0] === 'string' || typeof safeValue[0] === 'number';

    // 3. Normalize to Objects for Internal Rendering
    // We need [{ label, value }] for everything inside this component.
    const selectedItems = safeValue.map(item => {
        if (typeof item === 'object' && item !== null) {
            return item; // Already an object
        }
        // It's a primitive; find it in options or create a dummy one
        const found = options.find(opt => opt.value === item);
        return found || { label: String(item), value: item };
    });

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const emitChange = (newItems) => {
        if (isPrimitiveMode) {
            // Map back to primitives
            onChange(newItems.map(i => i.value));
        } else {
            // Return objects
            onChange(newItems);
        }
    };

    const handleSelect = (item) => {
        const isSelected = selectedItems.some(i => i.value === item.value);
        if (isSelected) {
            emitChange(selectedItems.filter(i => i.value !== item.value));
        } else {
            emitChange([...selectedItems, item]);
        }
        setInputValue("");
    };

    const handleRemove = (itemToRemove, e) => {
        e.stopPropagation();
        emitChange(selectedItems.filter(i => i.value !== itemToRemove.value));
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && inputValue) {
            e.preventDefault();
            if (isCreatable) {
                // Check if exists (case-insensitive) to reuse existing option
                const existingOption = options.find(opt => opt.label.toLowerCase() === inputValue.toLowerCase());
                const newItem = existingOption || { label: inputValue, value: inputValue };
                
                // Prevent duplicates
                if (!selectedItems.some(i => i.value === newItem.value)) {
                    emitChange([...selectedItems, newItem]);
                }
                setInputValue("");
            }
        } else if (e.key === 'Backspace' && !inputValue && selectedItems.length > 0) {
            emitChange(selectedItems.slice(0, -1));
        }
    };

    const filteredOptions = options.filter(option => 
        option.label.toLowerCase().includes(inputValue.toLowerCase())
    );

    return (
        <div className="relative" ref={containerRef}>
            <div
                className="flex flex-wrap items-center gap-2 p-2 bg-gray-800 border border-gray-700 rounded-lg focus-within:ring-2 focus-within:ring-amber-500 min-h-[42px] cursor-text"
                onClick={() => {
                    setIsOpen(true);
                    // Focus the input if needed
                }}
            >
                {selectedItems.map((item) => (
                    <span key={item.value} className="flex items-center gap-1 bg-gray-700 text-amber-300 text-sm px-2 py-0.5 rounded-md">
                        {item.label}
                        <button
                            type="button"
                            onClick={(e) => handleRemove(item, e)}
                            className="text-gray-400 hover:text-white focus:outline-none"
                        >
                            <X size={14} />
                        </button>
                    </span>
                ))}
                
                <div className="flex-1 min-w-[120px] relative flex items-center">
                    <input
                        type="text"
                        className="w-full bg-transparent border-none text-white placeholder-gray-500 focus:ring-0 text-sm p-0"
                        placeholder={selectedItems.length === 0 ? placeholder : ""}
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            setIsOpen(true);
                        }}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setIsOpen(true)}
                    />
                     {/* Show indicator only if no input to avoid clutter */}
                    {!inputValue && <ChevronDown size={16} className="text-gray-400 ml-auto pointer-events-none" />}
                </div>
            </div>

            {isOpen && (filteredOptions.length > 0 || isCreatable) && (
                <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredOptions.map(option => {
                        const isSelected = selectedItems.some(i => i.value === option.value);
                        return (
                            <div
                                key={option.value}
                                onClick={() => handleSelect(option)}
                                className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-gray-700 ${isSelected ? 'bg-gray-700/50' : ''}`}
                            >
                                <span className="text-white">{option.label}</span>
                                {isSelected && <Check size={14} className="text-amber-500" />}
                            </div>
                        );
                    })}
                    
                    {isCreatable && inputValue && !filteredOptions.some(opt => opt.label.toLowerCase() === inputValue.toLowerCase()) && (
                        <div
                            onClick={() => handleSelect({ label: inputValue, value: inputValue })}
                            className="px-3 py-2 text-sm text-amber-400 cursor-pointer hover:bg-gray-700 italic border-t border-gray-700"
                        >
                            Create "{inputValue}"
                        </div>
                    )}
                    
                    {filteredOptions.length === 0 && !inputValue && (
                        <div className="px-3 py-2 text-sm text-gray-500">No options available</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MultiSelect;