import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import toast from 'react-hot-toast';
import { Plus, Upload, Printer, Trash2, AlertCircle, Database, RefreshCw, HelpCircle, X } from 'lucide-react';
import Papa from 'papaparse';

import SeriesGeneratorModal from './SeriesGeneratorModal';
import ManualCsvMappingModal from './ManualCsvMappingModal';
import Modal from './Modal'; 
import PdfPreviewModal from './PdfPreviewModal';

const formatHeader = (str) => {
    if (!str) return '';
    return str
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
};

const normalizeKey = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

const CsvImportModal = ({ isOpen, onClose, onParse }) => {
  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
        Papa.parse(e.target.files[0], {
            header: true,
            skipEmptyLines: true,
            complete: onParse,
            error: (err) => toast.error(`CSV error: ${err.message}`),
        });
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import from CSV">
        <div className="p-6">
            <p className="text-sm text-gray-400 mb-4">Upload a CSV file. The columns will be matched to your template variables.</p>
            <input type="file" accept=".csv" onChange={handleFileChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"/>
        </div>
    </Modal>
  );
};

const DynamicLabelManager = ({ category }) => {
  const { profile } = useAuth();
  const { showId, showData } = useShow();
  
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [showHelp, setShowHelp] = useState(true);

  // Modals
  const [isSeriesModalOpen, setIsSeriesModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [csvDataForMapping, setCsvDataForMapping] = useState([]);
  const [csvHeadersForMapping, setCsvHeadersForMapping] = useState([]);
  
  // PDF Preview State
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);

  const hasAccess = profile?.permitted_features?.includes('label_engine');

  useEffect(() => {
    if (hasAccess) {
      const fetchTemplates = async () => {
        try {
          const fetchedTemplates = await api.getLabelTemplates(category);
          setTemplates(fetchedTemplates);
          setSelectedTemplate(null);
          setTableData([]);
          setColumns([]);
        } catch (error) {
          toast.error('Failed to fetch templates.');
        }
      };
      fetchTemplates();
    }
  }, [hasAccess, category]);

  useEffect(() => {
    if (selectedTemplate) {
      const variables = new Set();
      const regex = /\{([^}]+)\}/g;

      (selectedTemplate.elements || []).forEach(el => {
          if (el.text_content) {
              let match;
              regex.lastIndex = 0; 
              while ((match = regex.exec(el.text_content)) !== null) {
                  variables.add(match[1]);
              }
          }
          if (el.qr_content) {
              let match;
              regex.lastIndex = 0;
              while ((match = regex.exec(el.qr_content)) !== null) {
                  variables.add(match[1]);
              }
          }
          if (el.variable_field && el.content_mode === 'variable' && !['__SHOW_LOGO__', '__COMPANY_LOGO__'].includes(el.variable_field)) {
              variables.add(el.variable_field);
          }
          // Dynamic Colors
          if (el.text_color_variable) variables.add(el.text_color_variable);
          if (el.stroke_color_variable) variables.add(el.stroke_color_variable);
          if (el.fill_color_variable) variables.add(el.fill_color_variable);
      });

      const cols = Array.from(variables);
      setColumns(cols);
      
      // Clear data initially when template changes
      setTableData([]);

      // Auto-load logic for Looms
      if (category === 'loom') {
          handleLoadShowData(cols); 
      } else if (cols.length > 0) {
          const initialRow = {};
          cols.forEach(c => initialRow[c] = '');
          setTableData([initialRow]);
      }
    } else {
      setColumns([]);
      setTableData([]);
    }
  }, [selectedTemplate]);

  // --- Load Data Logic ---
  const handleLoadShowData = async (currentColumns = columns) => {
      if (!showData) return;

      let sourceRows = [];

      // A. Extract Case Labels
      if (category === 'case' && showData.case_sheets) {
          Object.values(showData.case_sheets).forEach(sheetRows => {
              if (Array.isArray(sheetRows)) sourceRows.push(...sheetRows);
          });
      }
      
      // B. Extract Loom Labels
      else if (category === 'loom') {
          // 1. Legacy Data
          if (showData.loom_sheets) {
              Object.values(showData.loom_sheets).forEach(sheetRows => {
                  if (Array.isArray(sheetRows)) sourceRows.push(...sheetRows);
              });
          }
          // 2. Pro Loom Builder Data
          try {
              const looms = await api.getLoomsForShow(showId);
              const loomRows = looms.map(l => {
                  // Direct Mapping from Loom Object (No cable fallback)
                  const originColor = l.origin_color || '';
                  const destColor = l.destination_color || '';
                  const sourceLoc = l.source_loc || '';
                  const destLoc = l.dest_loc || '';

                  // Create a rich object with multiple key variations to ensure auto-mapping works
                  return {
                      // Standard keys
                      loom_name: l.name,
                      source_loc: sourceLoc,
                      dest_loc: destLoc,
                      origin_color: originColor,
                      destination_color: destColor,
                      
                      // Variations for Auto-Mapping
                      'loom name': l.name,
                      'loomname': l.name,
                      'name': l.name,
                      
                      'source': sourceLoc,
                      'src': sourceLoc,
                      'source location': sourceLoc,
                      'sourcelocation': sourceLoc,
                      
                      'destination': destLoc,
                      'dest': destLoc,
                      'destination location': destLoc,
                      'destinationlocation': destLoc,
                      
                      'origin color': originColor,
                      'origincolor': originColor,
                      
                      'destination color': destColor,
                      'destinationcolor': destColor,
                      
                      'color': originColor || destColor, // Fallback 'Color' field
                      
                      'cable count': (l.cables?.length || 0).toString(),
                      'cablecount': (l.cables?.length || 0).toString(),
                  };
              });
              sourceRows.push(...loomRows);
          } catch (e) { console.warn("No new looms found", e); }
      }

      if (sourceRows.length === 0) {
          if (currentColumns.some(c => ["Show Name", "Location", "User Name"].includes(c))) {
              sourceRows.push({}); // Dummy row to trigger global fill
          } else {
             // Add empty row if nothing found so table isn't invisible
             if(tableData.length === 0) {
                 const initialRow = {};
                 currentColumns.forEach(c => initialRow[c] = '');
                 setTableData([initialRow]);
             }
             return;
          }
      }

      // Prepare Global Fallbacks
      const globalValues = {
        "showname": showData.info?.show_name || "",
        "location": showData.info?.venue_details || "",
        "username": profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : "",
        "currentdate": new Date().toLocaleDateString()
      };

      // C. Auto-Map Fields
      const mappedData = sourceRows.map(sourceRow => {
          const newRow = {};
          currentColumns.forEach(colName => {
              const targetKey = normalizeKey(colName); 
              let value = "";

              // 1. Try Source Row
              // We look for exact match or normalized match
              const sourceKey = Object.keys(sourceRow).find(k => normalizeKey(k) === targetKey);
              if (sourceKey && sourceRow[sourceKey] !== null && sourceRow[sourceKey] !== undefined) {
                  value = String(sourceRow[sourceKey]);
              }

              // 2. Try Global Values
              if (!value && globalValues[targetKey]) {
                  value = globalValues[targetKey];
              }
              
              newRow[colName] = value;
          });
          return newRow;
      });

      const validRows = mappedData.filter(row => Object.values(row).some(v => v));
      setTableData(validRows);
      
      if (validRows.length > 0 && tableData.length === 0) {
          toast.success(`Imported ${validRows.length} labels.`);
      }
  };

  const handleCsvParse = (results) => {
    const headers = results.meta.fields;
    const data = results.data;
    const mapping = {};
    
    headers.forEach(header => {
      const matchedColumn = columns.find(col => normalizeKey(col) === normalizeKey(header));
      if (matchedColumn) mapping[matchedColumn] = header;
    });

    const importedData = data.map(row => {
        const newRow = {};
        columns.forEach(col => newRow[col] = row[mapping[col]] || '');
        return newRow;
    });
    setTableData(prev => [...prev, ...importedData]);
    toast.success(`Imported ${importedData.length} rows.`);
    setIsCsvModalOpen(false);
  };

  const handleCellChange = (rowIndex, columnId, value) => {
    const updated = [...tableData];
    updated[rowIndex] = { ...updated[rowIndex], [columnId]: value };
    setTableData(updated);
  };

  const handlePrint = async () => {
    if (!selectedTemplate) return;
    
    // Sanitize data: ensure all values are strings to satisfy backend Dict[str, str]
    const rawData = tableData.length > 0 ? tableData : [{}]; 
    const dataToSend = rawData.map(row => {
        const sanitizedRow = {};
        Object.keys(row).forEach(key => {
            const val = row[key];
            if (val === null || val === undefined) {
                sanitizedRow[key] = "";
            } else {
                sanitizedRow[key] = String(val);
            }
        });
        return sanitizedRow;
    });

    const toastId = toast.loading("Generating PDF...");

    try {
      const response = await api.printLabels(showId, {
        template_id: selectedTemplate.id,
        data_rows: dataToSend,
      });
      
      const url = URL.createObjectURL(new Blob([response], { type: 'application/pdf' }));
      setPdfUrl(url);
      setIsPdfPreviewOpen(true);
      
      toast.success("PDF Generated", { id: toastId });
    } catch (error) {
      toast.error("Print failed", { id: toastId });
      console.error(error);
    }
  };

  if (!hasAccess) return <div className="p-4 text-white">Access denied.</div>;

  return (
    <div className="p-4 bg-gray-800 text-white flex flex-col h-full rounded-lg shadow-xl">
      {/* HELP BOX */}
      {showHelp && (
          <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-4 mb-4 flex items-start justify-between">
              <div className="text-sm text-blue-200 space-y-1">
                  <p className="font-bold flex items-center gap-2"><HelpCircle size={16}/> How to use the Label Engine:</p>
                  <ol className="list-decimal pl-5 space-y-1">
                      <li>Go to <strong>Settings &gt; Label Template Builder</strong> to create a template.</li>
                      <li>In the builder, add text boxes with variables like <code>{`{Send To}`}</code> or <code>{`{Location}`}</code>.</li>
                      <li>Come back here, select that template below.</li>
                      <li>Click <strong>Load Show Data</strong> to automatically pull info from your Show Data tabs and Venue settings.</li>
                      <li>Click <strong>Print PDF</strong> to generate your labels.</li>
                  </ol>
              </div>
              <button onClick={() => setShowHelp(false)} className="text-blue-400 hover:text-white"><X size={16}/></button>
          </div>
      )}

      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 bg-gray-900 p-3 rounded-lg border border-gray-700">
        <div className="flex items-center gap-4">
            <div className="flex flex-col">
                <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Template</label>
                <select
                value={selectedTemplate?.id || ""}
                onChange={(e) => setSelectedTemplate(templates.find(t => t.id === e.target.value))}
                className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-white text-sm focus:border-amber-500 outline-none min-w-[250px]"
                >
                <option value="">-- Select Template --</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
            </div>
        </div>

        {/* Action Buttons */}
        {selectedTemplate && columns.length > 0 && (
            <div className="flex items-center gap-2">
                <button onClick={() => handleLoadShowData()} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-amber-400 px-3 py-1.5 rounded text-sm transition-colors border border-gray-600 shadow-sm">
                    <Database size={14} /> Reload Data
                </button>
                <div className="h-6 w-px bg-gray-700 mx-2"></div>
                <button onClick={() => setIsSeriesModalOpen(true)} className="flex items-center gap-2 bg-blue-900/50 hover:bg-blue-800 text-blue-200 px-3 py-1.5 rounded text-sm border border-blue-800 transition-colors">
                    <RefreshCw size={14} /> Series
                </button>
                <button onClick={() => setIsCsvModalOpen(true)} className="flex items-center gap-2 bg-green-900/50 hover:bg-green-800 text-green-200 px-3 py-1.5 rounded text-sm border border-green-800 transition-colors">
                    <Upload size={14} /> CSV
                </button>
            </div>
        )}
      </div>

      {/* DATA TABLE */}
      <div className="flex-grow overflow-auto border border-gray-700 rounded-md bg-gray-900 relative">
        {selectedTemplate ? (
          columns.length > 0 ? (
            <table className="min-w-full text-sm">
                <thead className="bg-gray-800 sticky top-0 z-10 shadow-sm">
                <tr>
                    <th className="p-2 w-10 border-b border-gray-700 text-center text-gray-500">#</th>
                    {columns.map(col => (
                    <th key={col} className="p-3 text-left font-semibold text-amber-500 border-b border-gray-700 border-r border-gray-700/50 last:border-r-0 min-w-[150px]">
                        {formatHeader(col)}
                    </th>
                    ))}
                    <th className="p-2 w-10 border-b border-gray-700"></th>
                </tr>
                </thead>
                <tbody>
                {tableData.map((row, rowIndex) => (
                    <tr key={rowIndex} className="group hover:bg-gray-800/50 transition-colors">
                    <td className="p-2 text-center text-gray-600 text-xs font-mono border-b border-gray-800">{rowIndex + 1}</td>
                    {columns.map(col => (
                        <td key={col} className="p-0 border-b border-gray-800 border-r border-gray-800 last:border-r-0">
                        <input 
                            type="text" 
                            value={row[col] || ''} 
                            onChange={(e) => handleCellChange(rowIndex, col, e.target.value)} 
                            className="bg-transparent text-gray-200 w-full h-full px-3 py-2 focus:outline-none focus:bg-blue-900/20 focus:text-white transition-colors"
                            placeholder="..."
                        />
                        </td>
                    ))}
                    <td className="p-2 border-b border-gray-800 text-center">
                        <button onClick={() => setTableData(prev => prev.filter((_, i) => i !== rowIndex))} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 size={14} />
                        </button>
                    </td>
                    </tr>
                ))}
                {tableData.length === 0 && (
                    <tr>
                        <td colSpan={columns.length + 2} className="p-8 text-center text-gray-500 italic">
                            No data loaded. Use "Reload Data" or enter manually.
                        </td>
                    </tr>
                )}
                </tbody>
            </table>
          ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Printer size={48} className="mb-4 opacity-20" />
                  <p>This template has no variable fields.</p>
                  <p className="text-sm mt-2 text-gray-600">The "Load Show Data" feature requires variables like <code>{`{Send To}`}</code> in your template.</p>
                  <button onClick={handlePrint} className="mt-4 bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-500">Print Static Labels</button>
              </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <AlertCircle size={48} className="mb-4 opacity-20" />
            <p>Select a template to begin.</p>
          </div>
        )}
      </div>
      
      {/* FOOTER */}
      <div className="flex justify-between items-center mt-4 pt-2 border-t border-gray-700">
        <div className="flex gap-2">
            {selectedTemplate && columns.length > 0 && (
                <>
                    <button onClick={() => {
                        const newRow = {}; columns.forEach(c => newRow[c] = '');
                        setTableData(prev => [...prev, newRow]);
                    }} className="flex items-center text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-2 rounded transition-colors">
                        <Plus size={14} className="mr-1" /> Add Row
                    </button>
                    {tableData.length > 0 && (
                        <button onClick={() => setTableData([])} className="flex items-center text-sm text-red-400 hover:text-red-300 px-3 py-2 transition-colors">
                            Clear Data
                        </button>
                    )}
                </>
            )}
        </div>
        <button onClick={handlePrint} disabled={!selectedTemplate} className="flex items-center bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-2 px-6 rounded shadow-lg transition-all">
          <Printer size={18} className="mr-2" /> Print PDF
        </button>
      </div>

      <SeriesGeneratorModal isOpen={isSeriesModalOpen} onClose={() => setIsSeriesModalOpen(false)} columns={columns} onGenerate={(series) => setTableData(prev => [...prev, ...series])} />
      <CsvImportModal isOpen={isCsvModalOpen} onClose={() => setIsCsvModalOpen(false)} onParse={handleCsvParse} />
      <ManualCsvMappingModal isOpen={isMappingModalOpen} onClose={() => setIsMappingModalOpen(false)} csvData={csvDataForMapping} csvHeaders={csvHeadersForMapping} templateColumns={columns} onComplete={(data) => setTableData(prev => [...prev, ...data])} />
      
      {isPdfPreviewOpen && (
          <PdfPreviewModal
            isOpen={isPdfPreviewOpen}
            onClose={() => {
                setIsPdfPreviewOpen(false);
                if (pdfUrl) URL.revokeObjectURL(pdfUrl);
                setPdfUrl(null);
            }}
            url={pdfUrl}
            title={`${selectedTemplate?.name || 'Labels'} Preview`}
          />
      )}
    </div>
  );
};

export default DynamicLabelManager;