import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { api } from '../api/api';
import toast from 'react-hot-toast';
import { useShow } from '../contexts/ShowContext';
import { Printer } from 'lucide-react';

const LoomLabelPrintModal = ({ isOpen, onClose, selectedLooms }) => {
  const { showId, showData } = useShow();
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [mapping, setMapping] = useState({});
  const [columns, setColumns] = useState([]);

  // These are the available fields from a loom object we allow mapping from.
  const loomDataFields = {
    'name': 'Name',
    'source_loc': 'Source Location',
    'dest_loc': 'Destination Location',
    'cable_count': 'Cable Count',
    'show_name': 'Show Name',
  };

  useEffect(() => {
    if (isOpen) {
      const fetchTemplates = async () => {
        try {
          const fetchedTemplates = await api.getLabelTemplates('loom');
          setTemplates(fetchedTemplates);
        } catch (error) {
          toast.error('Failed to fetch loom label templates.');
          console.error(error);
        }
      };
      fetchTemplates();
    } else {
        // Reset state on close
        setSelectedTemplate(null);
        setMapping({});
        setColumns([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedTemplate) {
      // Discover variables from the template
      const variables = new Set();
      const regex = /{{\s*([\w.-]+)\s*}}/g;
      let match;
      const templateString = JSON.stringify(selectedTemplate.template_json);
      while ((match = regex.exec(templateString)) !== null) {
        variables.add(match[1]);
      }
      const discoveredColumns = Array.from(variables);
      setColumns(discoveredColumns);
      
      // Reset mapping when template changes
      const initialMapping = {};
      discoveredColumns.forEach(col => initialMapping[col] = '');
      setMapping(initialMapping);

    } else {
      setColumns([]);
    }
  }, [selectedTemplate]);

  const handleTemplateChange = (e) => {
    const templateId = e.target.value;
    const template = templates.find(t => t.id === templateId);
    setSelectedTemplate(template);
  };
  
  const handleMappingChange = (templateVar, loomField) => {
    setMapping(prev => ({ ...prev, [templateVar]: loomField }));
  };

  const handlePrint = async () => {
    if (!selectedTemplate || selectedLooms.length === 0) {
      toast.error("Please select a template.");
      return;
    }

    const payloadData = selectedLooms.map(loom => {
        const row = {};
        columns.forEach(col => {
            const mappedField = mapping[col];
            let value = '';
            switch(mappedField) {
                case 'name':
                    value = loom.name;
                    break;
                case 'source_loc':
                    value = loom.source_loc;
                    break;
                case 'dest_loc':
                    value = loom.dest_loc;
                    break;
                case 'cable_count':
                    value = loom.cables?.length || 0;
                    break;
                case 'show_name':
                    value = showData?.name || '';
                    break;
                default:
                    value = '';
            }
            row[col] = value;
        });
        return row;
    });

    const toastId = toast.loading("Generating loom labels...");
    try {
        const response = await api.printLabels(showId, {
            template_id: selectedTemplate.id,
            data: payloadData,
        });

        const blob = new Blob([response], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Loom_Labels_${selectedTemplate.name}.pdf`;
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Print Loom Labels (Pro Engine)">
      <div className="p-6 space-y-4">
        <div>
          <label htmlFor="template" className="block text-sm font-medium text-gray-300">Label Template</label>
          <select
            id="template"
            onChange={handleTemplateChange}
            className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">-- Select a Template --</option>
            {templates.map(template => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </div>

        {selectedTemplate && (
          <div>
            <h3 className="text-lg font-medium text-white mb-2">Map Template Fields</h3>
            <div className="space-y-3">
              {columns.map(col => (
                <div key={col} className="grid grid-cols-2 gap-4 items-center">
                  <span className="font-medium text-gray-300">{`{{${col}}}`}</span>
                  <select
                    value={mapping[col] || ''}
                    onChange={(e) => handleMappingChange(col, e.target.value)}
                    className="bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500"
                  >
                    <option value="">-- Select Loom Field --</option>
                    {Object.entries(loomDataFields).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="bg-gray-800 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
        <button
          onClick={handlePrint}
          disabled={!selectedTemplate}
          className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 disabled:bg-gray-500 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm"
        >
          <Printer size={18} className="mr-2" />
          Print
        </button>
        <button
          onClick={onClose}
          className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-500 shadow-sm px-4 py-2 bg-gray-700 text-base font-medium text-white hover:bg-gray-600 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm"
        >
          Close
        </button>
      </div>
    </Modal>
  );
};

export default LoomLabelPrintModal;
