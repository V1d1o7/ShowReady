import React, { useCallback, useState } from 'react';
import Modal from './Modal';
import Papa from 'papaparse';
import { useDropzone } from 'react-dropzone';

// This is a simple fuzzy matching helper. We can tune this.
// For now, it lowercases, removes non-alphanumeric chars, and checks for inclusion.
const fuzzyMatch = (header, column) => {
    const format = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const formattedHeader = format(header);
    const formattedColumn = format(column);
    return formattedHeader.includes(formattedColumn) || formattedColumn.includes(formattedHeader);
};

const CsvImportModal = ({ isOpen, onClose, columns, onImport, onManualMap }) => {
  const [error, setError] = useState('');

  const handleFileParse = (file) => {
    setError('');
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields;
        const mapping = {};
        const unmappedHeaders = [];

        // Attempt to auto-map columns
        headers.forEach(header => {
          const matchedColumn = columns.find(col => fuzzyMatch(header, col));
          if (matchedColumn) {
            if (!mapping[matchedColumn]) {
              mapping[matchedColumn] = header;
            } else {
              // Handle case where one column might match multiple headers
              unmappedHeaders.push(header);
            }
          } else {
            unmappedHeaders.push(header);
          }
        });
        
        const mappedColumns = Object.keys(mapping);
        if (mappedColumns.length < columns.length || unmappedHeaders.length > 0) {
            // Not all columns were mapped, open manual mapping modal
            onManualMap(results.data, headers);
            onClose();
        } else {
            // All columns mapped, process data
            const importedData = results.data.map(row => {
                const newRow = {};
                columns.forEach(col => {
                    const header = mapping[col];
                    newRow[col] = row[header] || '';
                });
                return newRow;
            });
            onImport(importedData);
            onClose();
        }
      },
      error: (err) => {
        setError(`CSV parsing error: ${err.message}`);
      }
    });
  };

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      handleFileParse(acceptedFiles[0]);
    }
  }, [columns]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import from CSV">
      <div {...getRootProps()} className="p-8 border-2 border-dashed border-gray-600 rounded-lg text-center cursor-pointer hover:border-blue-500">
        <input {...getInputProps()} />
        {isDragActive ? (
          <p className="text-gray-400">Drop the CSV file here ...</p>
        ) : (
          <p className="text-gray-400">Drag 'n' drop a CSV file here, or click to select a file</p>
        )}
      </div>
      {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
    </Modal>
  );
};

export default CsvImportModal;
