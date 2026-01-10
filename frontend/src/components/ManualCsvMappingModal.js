import React, { useState, useEffect } from 'react';
import Modal from './Modal';

const ManualCsvMappingModal = ({ isOpen, onClose, csvData, csvHeaders, templateColumns, onComplete }) => {
  const [mapping, setMapping] = useState({});

  useEffect(() => {
    // Pre-populate mapping with fuzzy matches
    const initialMapping = {};
    templateColumns.forEach(col => {
      const format = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
      const formattedCol = format(col);
      const matchedHeader = csvHeaders.find(header => {
        const formattedHeader = format(header);
        return formattedHeader.includes(formattedCol) || formattedCol.includes(formattedHeader);
      });
      initialMapping[col] = matchedHeader || '';
    });
    setMapping(initialMapping);
  }, [csvHeaders, templateColumns, isOpen]);

  const handleMappingChange = (templateColumn, csvHeader) => {
    setMapping(prev => ({ ...prev, [templateColumn]: csvHeader }));
  };

  const handleImport = () => {
    const importedData = csvData.map(row => {
      const newRow = {};
      templateColumns.forEach(col => {
        const header = mapping[col];
        newRow[col] = header ? row[header] : '';
      });
      return newRow;
    });
    onComplete(importedData);
    onClose();
  };
  
  const unmappedHeaders = csvHeaders.filter(h => !Object.values(mapping).includes(h));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Map CSV Columns to Template Fields">
      <div className="p-6">
        <p className="text-gray-400 mb-4">Match your CSV columns to the label template fields.</p>
        <div className="space-y-4">
          {templateColumns.map(column => (
            <div key={column} className="grid grid-cols-2 gap-4 items-center">
              <span className="font-medium text-white">{column}</span>
              <select
                value={mapping[column] || ''}
                onChange={(e) => handleMappingChange(column, e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">-- Select CSV Column --</option>
                {/* Show the currently mapped header + any unmapped ones */}
                {(mapping[column] && !unmappedHeaders.includes(mapping[column])) && <option value={mapping[column]}>{mapping[column]}</option>}
                {unmappedHeaders.map(header => (
                  <option key={header} value={header}>{header}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-gray-800 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
        <button
          onClick={handleImport}
          className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm"
        >
          Import Data
        </button>
        <button
          onClick={onClose}
          className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-500 shadow-sm px-4 py-2 bg-gray-700 text-base font-medium text-white hover:bg-gray-600 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
};

export default ManualCsvMappingModal;
