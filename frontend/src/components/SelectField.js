import React from 'react';

const SelectField = ({ label, name, value, onChange, options }) => {
    return (
        <div>
            <label htmlFor={name} className="block text-sm font-medium text-gray-300">
                {label}
            </label>
            <div className="mt-1">
                <select
                    id={name}
                    name={name}
                    value={value}
                    onChange={onChange}
                    className="block w-full bg-gray-800 border border-gray-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                >
                    {options.map(option => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default SelectField;
