import React from 'react';

const Card = ({ children, className = '' }) => (
    <div className={`bg-gray-800/50 p-6 rounded-xl ${className}`}>
        {children}
    </div>
);

export default Card;