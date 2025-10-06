import React, { useEffect } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

const icons = {
    success: <CheckCircle className="text-green-400" size={20} />,
    error: <XCircle className="text-red-400" size={20} />,
    info: <Info className="text-blue-400" size={20} />,
};

const Toast = ({ message, type = 'info', onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 5000); // Auto-dismiss after 5 seconds

        return () => {
            clearTimeout(timer);
        };
    }, [onClose]);

    return (
        <div className={`
            flex items-center w-full max-w-sm p-4 text-gray-200 bg-gray-800 rounded-lg shadow-lg border border-gray-700
            transform transition-all duration-300 ease-in-out
        `}>
            <div className="flex-shrink-0">
                {icons[type]}
            </div>
            <div className="ml-3 text-sm font-normal flex-grow">{message}</div>
            <button
                onClick={onClose}
                className="ml-auto -mx-1.5 -my-1.5 bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg p-1.5 inline-flex h-8 w-8"
            >
                <span className="sr-only">Close</span>
                <X size={20} />
            </button>
        </div>
    );
};

export default Toast;