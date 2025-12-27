import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import toast from 'react-hot-toast';
import { Plus, Upload, Printer, Trash2 } from 'lucide-react';
import Papa from 'papaparse';

import SeriesGeneratorModal from './SeriesGeneratorModal';
import ManualCsvMappingModal from './ManualCsvMappingModal';
import Modal from './Modal'; // For the CSV dropzone

// Simple fuzzy matching helper
const fuzzyMatch = (header, column) => {
    const format = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const formattedHeader = format(header);
    const formattedColumn = format(column);
    return formattedHeader.includes(formattedColumn) || formattedColumn.includes(formattedHeader);
};

const CsvImportModal = ({ isOpen, onClose, onParse }) => {
  const onDrop = (acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      Papa.parse(acceptedFiles[0], {
        header: true,
        skipEmptyLines: true,
        complete: onParse,
        error: (err) => toast.error(`CSV parsing error: ${err.message}`),
      });
    }
  };

  // Simple file picker for now instead of complex dropzone
  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
        onDrop(e.target.files);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import from CSV">
        <div className="p-6">
            <input type="file" accept=".csv" onChange={handleFileChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
        </div>
    </Modal>
  );
};


const DynamicLabelManager = ({ category }) => {
  const { permitted_features } = useAuth();
  const { showId } = useShow();
  
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [columns, setColumns] = useState([]);

  // State for modals
  const [isSeriesModalOpen, setIsSeriesModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  
  // Data for mapping modal
  const [csvDataForMapping, setCsvDataForMapping] = useState([]);
  const [csvHeadersForMapping, setCsvHeadersForMapping] = useState([]);


  const hasAccess = permitted_features?.includes('label_engine');

  useEffect(() => {
    if (hasAccess) {
      const fetchTemplates = async () => {
        try {
          const fetchedTemplates = await api.getLabelTemplates(category);
          setTemplates(fetchedTemplates);
        } catch (error) {
          toast.error('Failed to fetch label templates.');
          console.error(error);
        }
      };
      fetchTemplates();
    }
  }, [hasAccess, category]);

  useEffect(() => {
    if (selectedTemplate) {
      const variables = new Set();
      const regex = /{{\s*([\w.-]+)\s*}}/g;
      let match;
      
      const templateString = JSON.stringify(selectedTemplate.elements || []);
      
      while ((match = regex.exec(templateString)) !== null) {
        variables.add(match[1]);
      }
      const discoveredColumns = Array.from(variables);
      setColumns(discoveredColumns);
      setTableData([]);
    } else {
      setColumns([]);
      setTableData([]);
    }
  }, [selectedTemplate]);
  
  const handleCsvParse = (results) => {
    const headers = results.meta.fields;
    const data = results.data;
    const mapping = {};
    const unmappedHeaders = [];

    headers.forEach(header => {
      const matchedColumn = columns.find(col => fuzzyMatch(header, col));
      if (matchedColumn && !mapping[matchedColumn]) {
        mapping[matchedColumn] = header;
      } else {
        unmappedHeaders.push(header);
      }
    });
    
    if (Object.keys(mapping).length === columns.length && columns.length > 0) {
      // Perfect match
      const importedData = data.map(row => {
        const newRow = {};
        columns.forEach(col => {
            newRow[col] = row[mapping[col]] || '';
        });
        return newRow;
      });
      setTableData(prev => [...prev, ...importedData]);
      toast.success(`${importedData.length} rows imported successfully.`);
    } else {
      // Needs manual mapping
      setCsvDataForMapping(data);
      setCsvHeadersForMapping(headers);
      setIsMappingModalOpen(true);
    }
    setIsCsvModalOpen(false);
  };

  const handleTemplateChange = (e) => {
    const templateId = e.target.value;
    const template = templates.find(t => t.id === templateId);
    setSelectedTemplate(template);
  };

  const handleCellChange = (rowIndex, columnId, value) => {
    const updatedData = [...tableData];
    updatedData[rowIndex][columnId] = value;
    setTableData(updatedData);
  };

  const handleAddRow = () => {
    const newRow = {};
    columns.forEach(col => newRow[col] = '');
    setTableData(prev => [...prev, newRow]);
  }

  const handleRemoveRow = (index) => {
    setTableData(prev => prev.filter((_, i) => i !== index));
  }
  
  const handlePrint = async () => {
    if (!selectedTemplate || tableData.length === 0) {
      toast.error("Please select a template and add data to print.");
      return;
    }
    const toastId = toast.loading("Generating labels...");
    try {
      const response = await api.printLabels(showId, {
        template_id: selectedTemplate.id,
        data: tableData,
      });

      const blob = new Blob([response], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTemplate.name}_labels.pdf`;
      document.body.appendChild(a);
a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Labels generated successfully!", { id: toastId });
    } catch (error) {
      toast.error("Failed to print labels.", { id: toastId });
      console.error(error);
    }
  };

  if (!hasAccess) {
    return (
        <div className="p-4 bg-gray-800 text-white rounded-lg">
            <p>You do not have access to the Label Engine. Please contact support to upgrade.</p>
        </div>
    );
  }

  return (
    <div className="p-4 bg-gray-800 text-white flex flex-col h-full rounded-lg">
      <div className="flex items-center space-x-4 mb-4">
        <select
          onChange={handleTemplateChange}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a Template</option>
          {templates.map(template => (
            <option key={template.id} value={template.id}>{template.name}</option>
          ))}
        </select>
        <button onClick={() => setIsSeriesModalOpen(true)} disabled={!selectedTemplate} className="flex items-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white font-bold py-2 px-4 rounded">
          <Plus size={18} className="mr-2" /> Generate Series
        </button>
        <button onClick={() => setIsCsvModalOpen(true)} disabled={!selectedTemplate} className="flex items-center bg-green-600 hover:bg-green-700 disabled:bg-gray-500 text-white font-bold py-2 px-4 rounded">
          <Upload size={18} className="mr-2" /> Import CSV
        </button>
      </div>

      <div className="flex-grow overflow-auto">
        {selectedTemplate ? (
          <table className="min-w-full bg-gray-900 border border-gray-700">
            <thead>
              <tr>
                <th className="p-3 w-12 bg-gray-700 border-b border-gray-600"></th>
                {columns.map(col => (
                  <th key={col} className="p-3 text-left bg-gray-700 border-b border-gray-600">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td className="p-1 border-b border-gray-700 text-center">
                    <button onClick={() => handleRemoveRow(rowIndex)} className="text-red-500 hover:text-red-400">
                        <Trash2 size={16} />
                    </button>
                  </td>
                  {columns.map(col => (
                    <td key={col} className="p-0 border-b border-gray-700">
                      <input type="text" value={row[col] || ''} onChange={(e) => handleCellChange(rowIndex, col, e.target.value)} className="bg-transparent text-white w-full h-full p-2 focus:outline-none focus:bg-gray-700"/>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 rounded-md border-2 border-dashed border-gray-700">
            <p>Select a template to begin.</p>
          </div>
        )}
      </div>
      
      {selectedTemplate && (
          <div className="mt-4">
            <button onClick={handleAddRow} className="flex items-center text-sm text-blue-400 hover:text-blue-300">
                <Plus size={16} className="mr-1" /> Add Row
            </button>
          </div>
      )}

      <div className="flex justify-end mt-4">
        <button onClick={handlePrint} disabled={!selectedTemplate || tableData.length === 0} className="flex items-center bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 text-white font-bold py-2 px-4 rounded">
          <Printer size={18} className="mr-2" /> Print Labels
        </button>
      </div>

      <SeriesGeneratorModal isOpen={isSeriesModalOpen} onClose={() => setIsSeriesModalOpen(false)} columns={columns} onGenerate={(series) => setTableData(prev => [...prev, ...series])} />
      <CsvImportModal isOpen={isCsvModalOpen} onClose={() => setIsCsvModalOpen(false)} onParse={handleCsvParse} />
      <ManualCsvMappingModal isOpen={isMappingModalOpen} onClose={() => setIsMappingModalOpen(false)} csvData={csvDataForMapping} csvHeaders={csvHeadersForMapping} templateColumns={columns} onComplete={(data) => setTableData(prev => [...prev, ...data])} />
    </div>
  );
};

export default DynamicLabelManager;
