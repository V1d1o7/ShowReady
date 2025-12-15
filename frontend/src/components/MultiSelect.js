//
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Check, Lock } from 'lucide-react';

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
    const isPrimitiveMode = safeValue.length === 0 || typeof safeValue[0] === 'string' || typeof safeValue[0] === 'number';

    // 3. Normalize to Objects for Internal Rendering
    const selectedItems = safeValue.map(item => {
        if (typeof item === 'object' && item !== null) {
            return item; // Already an object
        }
        // It's a primitive; find it in options or create a dummy one
        const found = options.find(opt => opt.value === item);
        // Treat anything starting with "_" as private
        const isPrivate = String(item).startsWith('_');
        const cleanLabel = isPrivate ? String(item).substring(1) : String(item);
        
        return found || { label: cleanLabel, value: item };
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
            onChange(newItems.map(i => i.value));
        } else {
            onChange(newItems);
        }
    };

    const handleSelect = (item) => {
        const isSelected = selectedItems.some(i => i.value === item.value);
        if (isSelected) {
            emitChange(selectedItems.filter(i => i.value !== item.value));
        } else {
            // New item logic: respect user input for privacy
            // If user typed "_Tag", value is "_Tag", label is "Tag"
            // If user typed "Tag", value is "Tag", label is "Tag"
            emitChange([...selectedItems, item]);
        }
        setInputValue("");
    };

    const handleRemove = (itemToRemove, e) => {
        e.stopPropagation();
        emitChange(selectedItems.filter(i => i.value !== itemToRemove.value));
    };

    // Toggle Private/Public state
    const togglePrivacy = (itemToToggle, e) => {
        e.stopPropagation();
        
        const newItems = selectedItems.map(item => {
            if (item.value === itemToToggle.value) {
                const currentVal = String(item.value);
                const isPrivate = currentVal.startsWith('_');
                
                let newValue;
                if (isPrivate) {
                    // Make Public: Remove '_'
                    newValue = currentVal.substring(1);
                } else {
                    // Make Private: Add '_'
                    newValue = `_${currentVal}`;
                }
                
                return { ...item, value: newValue };
            }
            return item;
        });
        
        emitChange(newItems);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && inputValue) {
            e.preventDefault();
            if (isCreatable) {
                // Check existing
                const existingOption = options.find(opt => opt.label.toLowerCase() === inputValue.toLowerCase());
                
                let newItem;
                if (existingOption) {
                    newItem = existingOption;
                } else {
                    // Check if user explicitly typed a private tag
                    const isPrivateInput = inputValue.startsWith('_');
                    const cleanLabel = isPrivateInput ? inputValue.substring(1) : inputValue;
                    
                    newItem = { 
                        label: cleanLabel, 
                        value: inputValue 
                    };
                }
                
                // Prevent duplicates (checking against both private and public versions ideally, 
                // but simple value check is safer for now to avoid complexity)
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
                }}
            >
                {selectedItems.map((item) => {
                    const isPrivate = String(item.value).startsWith('_');
                    return (
                        <span key={item.value} className={`flex items-center gap-1 text-sm px-2 py-0.5 rounded-md ${isPrivate ? 'bg-gray-700 text-gray-300 border border-dashed border-gray-500' : 'bg-gray-700 text-amber-300'}`}>
                            {item.label}
                            
                            {/* Privacy Toggle */}
                            <button
                                type="button"
                                onClick={(e) => togglePrivacy(item, e)}
                                className={`ml-1 focus:outline-none ${isPrivate ? 'text-amber-500' : 'text-gray-500 hover:text-gray-300'}`}
                                title={isPrivate ? "Private (Internal Only)" : "Public (Visible in Emails)"}
                            >
                                <Lock size={12} strokeWidth={isPrivate ? 2.5 : 2} />
                            </button>

                            <button
                                type="button"
                                onClick={(e) => handleRemove(item, e)}
                                className="text-gray-400 hover:text-white focus:outline-none ml-1"
                            >
                                <X size={14} />
                            </button>
                        </span>
                    );
                })}
                
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
                            onClick={() => {
                                const isPrivateInput = inputValue.startsWith('_');
                                const cleanLabel = isPrivateInput ? inputValue.substring(1) : inputValue;
                                handleSelect({ label: cleanLabel, value: inputValue });
                            }}
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