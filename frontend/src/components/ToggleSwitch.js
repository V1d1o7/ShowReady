import React from 'react';

const ToggleSwitch = ({ checked, onChange, name, id }) => {
    return (
        <label htmlFor={id} className="relative inline-flex items-center cursor-pointer">
            <input 
                type="checkbox" 
                name={name}
                id={id}
                checked={checked} 
                onChange={onChange} 
                className="sr-only peer" 
            />
            <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-focus:ring-2 peer-focus:ring-amber-400 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
        </label>
    );
};

export default ToggleSwitch;
