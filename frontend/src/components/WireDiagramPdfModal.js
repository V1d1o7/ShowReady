import React, { useState } from 'react';
import Modal from './Modal';

const WireDiagramPdfModal = ({ isOpen, onClose, onGenerate }) => {
    const [pageSize, setPageSize] = useState('Letter');
    const [exportType, setExportType] = useState('full'); // 'full' or 'simplified'

    const availableSizes = ['Letter', 'A4', 'Legal', 'Tabloid'];

    const handleGenerateClick = () => {
        onGenerate({ pageSize, exportType });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Generate Wire Diagram PDF" maxWidth="max-w-md">
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-300">Export Type</label>
                    <fieldset className="mt-2">
                        <legend className="sr-only">Export Type</legend>
                        <div className="space-y-2">
                            <div className="flex items-center">
                                <input id="export-full" name="export-type" type="radio" value="full" checked={exportType === 'full'} onChange={() => setExportType('full')} className="h-4 w-4 text-amber-600 border-gray-500 focus:ring-amber-500"/>
                                <label htmlFor="export-full" className="ml-3 block text-sm font-medium text-gray-300">Full Diagram (Original)</label>
                            </div>
                            <div className="flex items-center">
                                <input id="export-simplified" name="export-type" type="radio" value="simplified" checked={exportType === 'simplified'} onChange={() => setExportType('simplified')} className="h-4 w-4 text-amber-600 border-gray-500 focus:ring-amber-500"/>
                                <label htmlFor="export-simplified" className="ml-3 block text-sm font-medium text-gray-300">Simplified Port List</label>
                            </div>
                        </div>
                    </fieldset>
                </div>

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
                            <option key={size} value={size}>{size}</option>
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
