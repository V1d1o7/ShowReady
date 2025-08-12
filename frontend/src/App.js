import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Box, Info, UploadCloud, Trash2, Edit, Plus, Save, ChevronsUpDown, LayoutDashboard, ArrowLeft, X, Download, Eye, Grid3x3, List, Upload, DownloadCloud } from 'lucide-react';

// --- API Helper Functions ---
const api = {
  getShows: () => fetch('/api/shows').then(res => res.json()),
  getShow: (showName) => fetch(`/api/shows/${showName}`).then(res => res.json()),
  saveShow: (showName, data) => fetch(`/api/shows/${showName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(res => res.json()),
  deleteShow: (showName) => fetch(`/api/shows/${showName}`, { method: 'DELETE' }),
  uploadLogo: (formData) => fetch('/api/upload/logo', {
    method: 'POST',
    body: formData,
  }).then(res => res.json()),
  generatePdf: (type, body) => fetch(`/api/pdf/${type}-labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(res => res.blob()),
  importShow: (formData) => fetch('/api/shows/import', {
    method: 'POST',
    body: formData,
  }).then(res => res.json()),
  exportShow: (showName) => fetch(`/api/shows/${showName}/export`).then(res => res.blob()),
};

// --- Main Application Component ---
export default function App() {
  const [shows, setShows] = useState([]);
  const [activeShowName, setActiveShowName] = useState('');
  const [activeShowData, setActiveShowData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewShowModalOpen, setIsNewShowModalOpen] = useState(false);

  const loadShows = useCallback(() => {
    setIsLoading(true);
    api.getShows()
      .then(showNames => {
        setShows(showNames.sort());
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Failed to fetch shows:", error);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadShows();
  }, [loadShows]);

  const fetchShowData = useCallback(async (showName) => {
    if (!showName) {
      setActiveShowData(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await api.getShow(showName);
      setActiveShowData(data);
    } catch (error) {
      console.error(`Failed to fetch data for ${showName}:`, error);
      setActiveShowName('');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (activeShowName) {
      fetchShowData(activeShowName);
    } else {
      setActiveShowData(null);
    }
  }, [activeShowName, fetchShowData]);

  const handleSaveShowData = async (updatedData) => {
    if (!activeShowName) return;
    try {
      await api.saveShow(activeShowName, updatedData);
      setActiveShowData(updatedData);
    } catch (error) {
      console.error("Failed to save show data:", error);
    }
  };

  const handleCreateShow = async (newShowName) => {
    if (!newShowName || shows.includes(newShowName)) {
      alert("Show name cannot be empty or a duplicate.");
      return;
    }
    setIsLoading(true);
    try {
      const newShowData = { info: { show_name: newShowName }, loom_sheets: {}, case_sheets: {} };
      await api.saveShow(newShowName, newShowData);
      const updatedShows = [...shows, newShowName].sort();
      setShows(updatedShows);
      setActiveShowName(newShowName);
    } catch (error) {
      console.error("Failed to create new show:", error);
      alert("Failed to create new show.");
    }
    setIsNewShowModalOpen(false);
    setIsLoading(false);
  };

  const handleDeleteShow = async (showNameToDelete) => {
    if (!window.confirm(`Are you sure you want to delete "${showNameToDelete}"? This cannot be undone.`)) {
      return;
    }
    setIsLoading(true);
    try {
      await api.deleteShow(showNameToDelete);
      const updatedShows = shows.filter(s => s !== showNameToDelete);
      setShows(updatedShows);
      if (activeShowName === showNameToDelete) {
        setActiveShowName('');
      }
    } catch (error) {
      console.error("Failed to delete show:", error);
      alert("Failed to delete show.");
    }
    setIsLoading(false);
  };

  const handleImportShow = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const result = await api.importShow(formData);
      setShows(result.shows.sort());
    } catch (error) {
      console.error("Failed to import show:", error);
      alert("Failed to import show. Please check the console for details.");
    }
    setIsLoading(false);
    event.target.value = null; // Reset file input
  };
  
  const handleExportShow = async (showNameToExport) => {
    try {
      const blob = await api.exportShow(showNameToExport);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${showNameToExport}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error("Failed to export show:", error);
      alert("Failed to export show.");
    }
  };

  return (
    <div className="bg-gray-900 text-gray-300 font-mono min-h-screen">
      {activeShowName && activeShowData ? (
        <ShowView
          showName={activeShowName}
          showData={activeShowData}
          onSave={handleSaveShowData}
          onBack={() => setActiveShowName('')}
          onExport={() => handleExportShow(activeShowName)}
          isLoading={isLoading}
        />
      ) : (
        <DashboardView
          shows={shows}
          onSelectShow={setActiveShowName}
          onNewShow={() => setIsNewShowModalOpen(true)}
          onDeleteShow={handleDeleteShow}
          onImportShow={handleImportShow}
          isLoading={isLoading}
        />
      )}
      <NewShowModal
        isOpen={isNewShowModalOpen}
        onClose={() => setIsNewShowModalOpen(false)}
        onSubmit={handleCreateShow}
      />
    </div>
  );
}

// --- Dashboard View Component ---
const DashboardView = ({ shows, onSelectShow, onNewShow, onDeleteShow, onImportShow, isLoading }) => {
  const importInputRef = React.useRef(null);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between pb-8 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="text-amber-400" size={32} />
          <h1 className="text-3xl font-bold text-white">ShowReady</h1>
        </div>
        <div className="flex items-center gap-4">
          <input type="file" ref={importInputRef} onChange={onImportShow} className="hidden" accept=".zip" />
          <button onClick={() => importInputRef.current.click()} className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 transition-colors">
            <Upload size={18} /> Import Show
          </button>
          <button onClick={onNewShow} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors">
            <Plus size={18} /> New Show
          </button>
        </div>
      </header>
      <main className="mt-8">
        {isLoading ? (
          <div className="text-center py-16 text-gray-500">Loading shows...</div>
        ) : shows.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {shows.map(showName => (
              <ShowCard key={showName} showName={showName} onSelect={() => onSelectShow(showName)} onDelete={() => onDeleteShow(showName)} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-gray-500">
            <p>No shows found.</p>
            <p className="mt-2">Click "New Show" or "Import Show" to get started.</p>
          </div>
        )}
      </main>
    </div>
  );
};

// --- Show Card Component for Dashboard ---
const ShowCard = ({ showName, onSelect, onDelete }) => {
  const handleDeleteClick = (e) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div onClick={onSelect} className="group relative bg-gray-800/50 hover:bg-gray-800/80 rounded-xl p-6 cursor-pointer transition-all duration-300 transform hover:-translate-y-1">
      <div className="absolute top-3 right-3">
        <button onClick={handleDeleteClick} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity">
          <Trash2 size={16} />
        </button>
      </div>
      <div className="flex flex-col items-center justify-center h-32">
        <h2 className="text-lg font-bold text-center text-white">{showName}</h2>
      </div>
    </div>
  );
};


// --- Show View Component ---
const ShowView = ({ showName, showData, onSave, onBack, onExport, isLoading }) => {
  const [activeTab, setActiveTab] = useState('info');

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen"><div className="text-xl text-gray-400">Loading...</div></div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between gap-4 pb-6 mb-6 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-700 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-3xl font-bold text-white">{showName}</h1>
        </div>
        <button onClick={onExport} className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 transition-colors">
          <DownloadCloud size={18} /> Export Show
        </button>
      </header>
      <div className="flex border-b border-gray-700 mb-8">
        <TabButton label="Show Info" icon={<Info size={16} />} isActive={activeTab === 'info'} onClick={() => setActiveTab('info')} />
        <TabButton label="Loom Labels" icon={<FileText size={16} />} isActive={activeTab === 'loom'} onClick={() => setActiveTab('loom')} />
        <TabButton label="Case Labels" icon={<Box size={16} />} isActive={activeTab === 'case'} onClick={() => setActiveTab('case')} />
      </div>
      <main>
        {activeTab === 'info' && <ShowInfoView showData={showData} onSave={onSave} />}
        {activeTab === 'loom' && <LoomLabelView showData={showData} onSave={onSave} />}
        {activeTab === 'case' && <CaseLabelView showData={showData} onSave={onSave} />}
      </main>
    </div>
  );
};

const TabButton = ({ label, icon, isActive, onClick }) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-colors ${isActive ? 'border-amber-400 text-amber-400' : 'border-transparent text-gray-400 hover:text-white'}`}>
    {icon}
    <span>{label}</span>
  </button>
);

// --- Reusable Card Component ---
const Card = ({ children, className = '' }) => (
  <div className={`bg-gray-800/50 rounded-xl p-6 ${className}`}>
    {children}
  </div>
);

// --- Show Info View ---
function ShowInfoView({ showData, onSave }) {
  const [formData, setFormData] = useState(showData.info);
  const [isUploading, setIsUploading] = useState(false);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => { 
    setFormData(showData.info);
    setLogoError(false);
  }, [showData]);

  const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);
    setIsUploading(true);
    setLogoError(false);
    try {
      const result = await api.uploadLogo(uploadFormData);
      if (result.logo_path) {
        setFormData(prev => ({ ...prev, logo_path: result.logo_path }));
      }
    } catch (error) { 
      console.error("Logo upload failed:", error); 
      setLogoError(true);
    }
    setIsUploading(false);
  };

  const handleSave = () => onSave({ ...showData, info: formData });

  const logoFilename = useMemo(() => {
    if (!formData.logo_path) return null;
    return formData.logo_path.split(/\/|\\/).pop();
  }, [formData.logo_path]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <Card className="lg:col-span-3 space-y-6">
          <InputField label="Show Name" name="show_name" value={formData.show_name || ''} onChange={handleChange} />
          <InputField label="Production Manager" name="production_manager" value={formData.production_manager || ''} onChange={handleChange} />
          <InputField label="PM Email" name="pm_email" type="email" value={formData.pm_email || ''} onChange={handleChange} />
          <InputField label="Production Video" name="production_video" value={formData.production_video || ''} onChange={handleChange} />
        </Card>
        <Card className="lg:col-span-2 space-y-4">
          <label className="block text-sm font-medium text-gray-300">Show Logo</label>
          <div className="w-full aspect-video bg-gray-900/50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-700 overflow-hidden">
            {logoFilename && !logoError ? (
              <img 
                src={`/static/images/${logoFilename}`}
                alt="Show Logo"
                className="w-full h-full object-contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <p className="text-gray-500 text-sm px-4 text-center">
                {logoError ? `Failed to load ${logoFilename}` : 'No logo uploaded'}
              </p>
            )}
          </div>
          <input type="file" id="logo-upload" className="hidden" onChange={handleLogoUpload} accept="image/*" />
          <button onClick={() => document.getElementById('logo-upload').click()} disabled={isUploading} className="w-full flex justify-center items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 disabled:bg-gray-600 transition-colors">
            <UploadCloud size={16} /> {isUploading ? 'Uploading...' : 'Upload Logo'}
          </button>
        </Card>
      </div>
      <div className="mt-8 flex justify-end">
        <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors"><Save size={16} /> Save Changes</button>
      </div>
    </div>
  );
}

// --- Reusable Input Field ---
const InputField = ({ label, ...props }) => (
  <div>
    <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
    <input {...props} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500" />
  </div>
);

// --- Generic Label Manager View ---
function LabelManagerView({ sheetType, showData, onSave, labelFields, pdfType }) {
  const [activeSheetName, setActiveSheetName] = useState('');
  const [isNewSheetModalOpen, setIsNewSheetModalOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [isAdvancedPrintModalOpen, setIsAdvancedPrintModalOpen] = useState(false);
  
  // State for inline editing
  const [editingIndex, setEditingIndex] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  const sheets = useMemo(() => showData[sheetType] || {}, [showData, sheetType]);
  const sheetNames = useMemo(() => Object.keys(sheets), [sheets]);
  const labels = useMemo(() => (activeSheetName ? sheets[activeSheetName] || [] : []), [activeSheetName, sheets]);

  useEffect(() => {
    if (sheetNames.length > 0 && !sheetNames.includes(activeSheetName)) {
      setActiveSheetName(sheetNames[0]);
    } else if (sheetNames.length === 0) {
      setActiveSheetName('');
    }
  }, [sheetNames, activeSheetName]);

  const handleCreateSheet = (newSheetName) => {
    if (!newSheetName || sheetNames.includes(newSheetName)) {
        alert("Sheet name cannot be empty or a duplicate.");
        return;
    }
    const updatedShowData = {
        ...showData,
        [sheetType]: { ...sheets, [newSheetName]: [] }
    };
    onSave(updatedShowData);
    setActiveSheetName(newSheetName);
    setIsNewSheetModalOpen(false);
  };

  const handleUpdateLabels = (newLabels) => {
    const updatedShowData = { ...showData, [sheetType]: { ...sheets, [activeSheetName]: newLabels } };
    onSave(updatedShowData);
  };
  
  const handleAddNewLabel = () => {
    const newLabel = labelFields.reduce((acc, f) => ({...acc, [f.name]: ''}), {});
    const newLabels = [...labels, newLabel];
    handleUpdateLabels(newLabels);
    setEditingIndex(newLabels.length - 1);
    setEditFormData(newLabel);
  };

  const handleEditClick = (label, index) => {
    setEditingIndex(index);
    setEditFormData(label);
  };
  
  const handleCancelEdit = () => {
    // If the row being cancelled was a new, unsaved row, remove it
    if (labels[editingIndex] && Object.values(labels[editingIndex]).every(val => val === '')) {
        const newLabels = labels.filter((_, i) => i !== editingIndex);
        handleUpdateLabels(newLabels);
    }
    setEditingIndex(null);
  };

  const handleSaveEdit = (index) => {
    const newLabels = [...labels];
    newLabels[index] = editFormData;
    handleUpdateLabels(newLabels);
    setEditingIndex(null);
  };

  const handleDeleteLabel = (indexToDelete) => {
    if (!window.confirm("Are you sure you want to delete this label?")) return;
    const newLabels = labels.filter((_, i) => i !== indexToDelete);
    handleUpdateLabels(newLabels);
  };

  const handleGeneratePdf = async (placement = null) => {
    const body = { labels };
    if (pdfType === 'case') body.logo_path = showData.info.logo_path;
    if (placement) body.placement = placement;
    
    try {
      const blob = await api.generatePdf(pdfType, body);
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
    } catch(e) { console.error("PDF generation failed", e); }
  };

  return (
    <>
      <Card>
        <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
          <div className="flex items-center gap-2">
            <div className="relative">
              <select value={activeSheetName} onChange={(e) => setActiveSheetName(e.target.value)} className="appearance-none p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                <option value="" disabled>{sheetNames.length === 0 ? 'No sheets' : 'Select a sheet'}</option>
                {sheetNames.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <ChevronsUpDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <button onClick={() => setIsNewSheetModalOpen(true)} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg"><Plus size={18} /></button>
          </div>
          {activeSheetName && (
            <div className="flex items-center gap-2">
              <button onClick={handleAddNewLabel} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors">
                  <Plus size={16}/> Add Label
              </button>
            </div>
          )}
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-700">
              <tr>
                {labelFields.map(f => <th key={f.name} className="p-3 text-left font-bold text-gray-400 uppercase tracking-wider">{f.label}</th>)}
                <th className="p-3 w-28 text-right font-bold text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label, idx) => (
                editingIndex === idx ? (
                  <EditableLabelRow
                    key={idx}
                    fields={labelFields}
                    formData={editFormData}
                    setFormData={setEditFormData}
                    onSave={() => handleSaveEdit(idx)}
                    onCancel={handleCancelEdit}
                  />
                ) : (
                  <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                    {labelFields.map(f => <td key={f.name} className="p-3 truncate">{label[f.name]}</td>)}
                    <td className="p-3 flex justify-end gap-2">
                      <button onClick={() => handleEditClick(label, idx)} className="text-blue-400 hover:text-blue-300"><Edit size={16} /></button>
                      <button onClick={() => handleDeleteLabel(idx)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex justify-end gap-4">
          <button onClick={() => setIsAdvancedPrintModalOpen(true)} disabled={labels.length === 0} className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-white transition-colors text-sm disabled:bg-gray-600 disabled:text-gray-400">
            <Grid3x3 size={16} /> Advanced Print
          </button>
          <button onClick={() => handleGeneratePdf()} disabled={labels.length === 0} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors text-sm disabled:bg-gray-600 disabled:text-gray-400">
            <Eye size={16} /> Generate Full Sheet
          </button>
        </div>
      </Card>
      
      <NewSheetModal isOpen={isNewSheetModalOpen} onClose={() => setIsNewSheetModalOpen(false)} onSubmit={handleCreateSheet} />
      <PdfPreviewModal url={pdfPreviewUrl} onClose={() => setPdfPreviewUrl(null)} />
      <AdvancedPrintModal 
        isOpen={isAdvancedPrintModalOpen} 
        onClose={() => setIsAdvancedPrintModalOpen(false)} 
        labels={labels}
        onGeneratePdf={handleGeneratePdf}
      />
    </>
  );
}

// --- Editable Table Row for Inline Editing ---
const EditableLabelRow = ({ fields, formData, setFormData, onSave, onCancel }) => {
  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <tr className="bg-gray-800/50">
      {fields.map(field => (
        <td key={field.name} className="p-2">
          {field.type === 'textarea' ? (
            <textarea name={field.name} value={formData[field.name] || ''} onChange={handleChange} className="w-full p-1 bg-gray-900 border border-gray-600 rounded-md text-sm" rows="1"></textarea>
          ) : (
            <input type={field.type === 'color' ? 'text' : field.type} name={field.name} value={formData[field.name] || ''} onChange={handleChange} className="w-full p-1 bg-gray-900 border border-gray-600 rounded-md text-sm" />
          )}
        </td>
      ))}
      <td className="p-2 flex justify-end gap-2">
        <button onClick={onSave} className="p-2 bg-green-600 hover:bg-green-500 rounded-lg"><Save size={16} /></button>
        <button onClick={onCancel} className="p-2 bg-red-600 hover:bg-red-500 rounded-lg"><X size={16} /></button>
      </td>
    </tr>
  );
};


// --- Specific Label View Implementations ---
const loomLabelFields = [
    { name: 'loom_name', label: 'Loom Name', type: 'text' },
    { name: 'color', label: 'Color', type: 'color' },
    { name: 'source', label: 'Source', type: 'text' },
    { name: 'destination', label: 'Destination', type: 'text' }
];
const LoomLabelView = ({ showData, onSave }) => <LabelManagerView sheetType="loom_sheets" pdfType="loom" showData={showData} onSave={onSave} labelFields={loomLabelFields} />;
const CaseLabelView = ({ showData, onSave }) => <LabelManagerView sheetType="case_sheets" pdfType="case" showData={showData} onSave={onSave} labelFields={[{ name: 'send_to', label: 'Send To', type: 'text' },{ name: 'contents', label: 'Contents', type: 'textarea' }]} />;

// --- Modal Components ---
const Modal = ({ isOpen, onClose, children, title, maxWidth = 'max-w-md' }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className={`bg-gray-800 p-6 rounded-xl shadow-xl w-full ${maxWidth} border border-gray-700`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20}/></button>
        </div>
        {children}
      </div>
    </div>
  );
};

const NewShowModal = ({ isOpen, onClose, onSubmit }) => {
    const [inputValue, setInputValue] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onSubmit(inputValue); setInputValue(''); };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Show">
            <form onSubmit={handleSubmit}>
                <InputField label="Enter a name for the new show:" type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} autoFocus />
                <div className="flex justify-end gap-4 mt-6">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">Create</button>
                </div>
            </form>
        </Modal>
    );
};

const NewSheetModal = ({ isOpen, onClose, onSubmit }) => {
    const [inputValue, setInputValue] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onSubmit(inputValue); setInputValue(''); };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Sheet">
            <form onSubmit={handleSubmit}>
                <InputField label="Enter a name for the new sheet:" type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} autoFocus />
                <div className="flex justify-end gap-4 mt-6">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">Create</button>
                </div>
            </form>
        </Modal>
    );
};

const PdfPreviewModal = ({ url, onClose }) => {
  if (!url) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col border border-gray-700">
        <header className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">PDF Preview</h2>
          <div className="flex items-center gap-4">
            <a href={url} download="labels.pdf" className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors">
              <Download size={16}/> Download
            </a>
            <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24}/></button>
          </div>
        </header>
        <div className="flex-grow p-4">
          <iframe src={url} title="PDF Preview" className="w-full h-full border-0 rounded-lg"></iframe>
        </div>
      </div>
    </div>
  );
};

const AdvancedPrintModal = ({ isOpen, onClose, labels, onGeneratePdf }) => {
    const [printSlots, setPrintSlots] = useState(Array(24).fill(null));
    const [draggedItem, setDraggedItem] = useState(null);

    const handleDragStart = (e, item) => {
        setDraggedItem(item);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e, slotIndex) => {
        e.preventDefault();
        if (draggedItem) {
            const newSlots = [...printSlots];
            // If the item was already in a slot, clear the old one
            const oldIndex = newSlots.findIndex(item => item && item.originalIndex === draggedItem.originalIndex);
            if(oldIndex > -1) newSlots[oldIndex] = null;
            newSlots[slotIndex] = draggedItem;
            setPrintSlots(newSlots);
            setDraggedItem(null);
        }
    };
    
    const removeFromSlot = (slotIndex) => {
        const newSlots = [...printSlots];
        newSlots[slotIndex] = null;
        setPrintSlots(newSlots);
    };

    const handleGenerate = () => {
        const placement = {};
        printSlots.forEach((item, slotIndex) => {
            if (item) {
                placement[slotIndex] = item.originalIndex;
            }
        });
        onGeneratePdf(placement);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Advanced Print Placement" maxWidth="max-w-4xl">
            <div className="grid grid-cols-3 gap-6 h-[60vh]">
                <div className="col-span-1 bg-gray-900/50 p-4 rounded-lg overflow-y-auto">
                    <h3 className="font-bold mb-4 text-white flex items-center gap-2"><List size={16}/> Available Labels</h3>
                    <div className="space-y-2">
                        {labels.map((label, index) => (
                            <div 
                                key={index} 
                                draggable 
                                onDragStart={(e) => handleDragStart(e, { ...label, originalIndex: index })}
                                className={`p-2 rounded-md text-sm cursor-grab ${printSlots.some(s => s && s.originalIndex === index) ? 'bg-gray-700 text-gray-500' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                                {label.loom_name || label.send_to}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="col-span-2 bg-gray-900/50 p-4 rounded-lg overflow-y-auto">
                    <h3 className="font-bold mb-4 text-white flex items-center gap-2"><Grid3x3 size={16}/> Print Sheet (24 Slots)</h3>
                    <div className="grid grid-cols-3 gap-2">
                        {printSlots.map((item, index) => (
                            <div 
                                key={index} 
                                onDragOver={handleDragOver} 
                                onDrop={(e) => handleDrop(e, index)}
                                className="relative h-20 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-center p-2 drag-over-target"
                            >
                                {item ? (
                                    <>
                                        <span className="text-xs text-gray-300">{item.loom_name || item.send_to}</span>
                                        <button onClick={() => removeFromSlot(index)} className="absolute top-1 right-1 text-gray-500 hover:text-red-400">
                                            <X size={12} />
                                        </button>
                                    </>
                                ) : (
                                    <span className="text-xs text-gray-500">Slot {index + 1}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors">Cancel</button>
                <button type="button" onClick={handleGenerate} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">Generate PDF</button>
            </div>
        </Modal>
    );
};
