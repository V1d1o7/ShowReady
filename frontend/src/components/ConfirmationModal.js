import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

const ConfirmationModal = ({ message, onConfirm, onCancel }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <AlertTriangle className="text-amber-400" />
                        Confirm Action
                    </h2>
                    <button onClick={onCancel} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </header>
                <main className="p-6">
                    <p className="text-gray-300">{message}</p>
                </main>
                <footer className="flex justify-end gap-4 p-4 bg-gray-900/50 rounded-b-lg">
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg text-white bg-gray-600 hover:bg-gray-500 transition-colors">
                        Cancel
                    </button>
                    <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-500 font-bold transition-colors">
                        Confirm
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default ConfirmationModal;
