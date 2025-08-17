import React, { useState } from 'react';
import Modal from './Modal';

const WireDiagramPdfModal = ({ isOpen, onClose, onGenerate }) => {
    const [pageSize, setPageSize] = useState('letter');
    const availableSizes = ['letter', 'legal', 'a4', 'tabloid'];

    const handleGenerateClick = () => {
        onGenerate({ pageSize });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Generate Wire Diagram PDF" maxWidth="max-w-md">
            <div className="space-y-4">
                <div>
                    <label htmlFor="page-size" className="block text-sm font-medium text-gray-300">
                        Page Size
                    </label>
                    <select
                        id="page-size"
                        name="page-size"
                        value={pageSize}
                        onChange={(e) => setPageSize(e.target.value)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 bg-gray-700 focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm rounded-md"
                    >
                        {availableSizes.map(size => (
                            <option key={size} value={size}>{size.toUpperCase()}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200">
                    Cancel
                </button>
                <button type="button" onClick={handleGenerateClick} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">
                    Generate PDF
                </button>
            </div>
        </Modal>
    );
};

export default WireDiagramPdfModal;
