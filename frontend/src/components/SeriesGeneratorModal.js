import React, { useState } from 'react';
import Modal from './Modal'; // Assuming a generic Modal component exists

const SeriesGeneratorModal = ({ isOpen, onClose, columns, onGenerate }) => {
  const [prefix, setPrefix] = useState('');
  const [startNumber, setStartNumber] = useState(100);
  const [count, setCount] = useState(10);
  const [selectedColumn, setSelectedColumn] = useState('');

  useState(() => {
    if (columns.length > 0) {
      setSelectedColumn(columns[0]);
    }
  }, [columns]);

  const handleGenerate = () => {
    if (!selectedColumn || count <= 0) {
      // Basic validation
      return;
    }

    const newSeries = [];
    for (let i = 0; i < count; i++) {
      const row = {};
      // Initialize all columns for the new rows
      columns.forEach(col => {
        row[col] = '';
      });
      // Populate the selected column with the generated value
      row[selectedColumn] = `${prefix}${startNumber + i}`;
      newSeries.push(row);
    }

    onGenerate(newSeries);
    onClose(); // Close modal after generating
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generate Label Series">
      <div className="p-6 space-y-4">
        <div>
          <label htmlFor="column" className="block text-sm font-medium text-gray-300">Target Column</label>
          <select
            id="column"
            value={selectedColumn}
            onChange={(e) => setSelectedColumn(e.target.value)}
            className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            {columns.map(col => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="prefix" className="block text-sm font-medium text-gray-300">Prefix</label>
          <input
            type="text"
            id="prefix"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="e.g., L"
          />
        </div>
        <div>
          <label htmlFor="startNumber" className="block text-sm font-medium text-gray-300">Start Number</label>
          <input
            type="number"
            id="startNumber"
            value={startNumber}
            onChange={(e) => setStartNumber(parseInt(e.target.value, 10))}
            className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="count" className="block text-sm font-medium text-gray-300">Count</label>
          <input
            type="number"
            id="count"
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value, 10))}
            className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>
      <div className="bg-gray-800 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
        <button
          onClick={handleGenerate}
          className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm"
        >
          Generate
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

export default SeriesGeneratorModal;
