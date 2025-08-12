import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Box, Info, UploadCloud, Trash2, Edit, PlusCircle, Save } from 'lucide-react';

// --- API Helper Functions ---
const api = {
  getShows: () => fetch('/api/shows').then(res => res.json()),
  getShow: (showName) => fetch(`/api/shows/${showName}`).then(res => res.json()),
  saveShow: (showName, data) => fetch(`/api/shows/${showName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(res => res.json()),
  uploadLogo: (formData) => fetch('/api/upload/logo', {
    method: 'POST',
    body: formData,
  }).then(res => res.json()),
  generatePdf: (type, body) => fetch(`/api/pdf/${type}-labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(res => res.blob()),
};

// --- Main Application Component ---
export default function App() {
  const [activeView, setActiveView] = useState('info');
  const [shows, setShows] = useState([]);
  const [activeShowName, setActiveShowName] = useState('');
  const [activeShowData, setActiveShowData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewShowModalOpen, setIsNewShowModalOpen] = useState(false);

  // --- FIX: Refactored state management and data fetching ---

  // 1. Fetch the list of shows on initial component mount
  useEffect(() => {
    setIsLoading(true);
    api.getShows()
      .then(showNames => {
        setShows(showNames);
        if (showNames.length > 0) {
          setActiveShowName(showNames[0]);
        } else {
          setIsLoading(false); // No shows to load
        }
      })
      .catch(error => {
        console.error("Failed to fetch shows:", error);
        setIsLoading(false);
      });
  }, []);

  // 2. Fetch the detailed data for the currently active show
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
    }
    setIsLoading(false);
  }, []);

  // 3. This effect runs whenever the active show name changes
  useEffect(() => {
    fetchShowData(activeShowName);
  }, [activeShowName, fetchShowData]);

  const handleSaveShowData = async (updatedData) => {
    if (!activeShowName) return;
    setIsLoading(true);
    try {
      await api.saveShow(activeShowName, updatedData);
      setActiveShowData(updatedData);
    } catch (error) {
      console.error("Failed to save show data:", error);
    }
    setIsLoading(false);
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
      
      // Update the frontend state directly for an immediate UI response
      setShows(prevShows => [...prevShows, newShowName]);
      setActiveShowName(newShowName);
    } catch (error) {
      console.error("Failed to create new show:", error);
    }
    // Let the useEffect for fetchShowData handle the loading state
    setIsNewShowModalOpen(false);
  };

  const renderActiveView = () => {
    if (isLoading) return <div className="text-center p-10">Loading...</div>;
    if (!activeShowData) return <div className="text-center p-10 text-gray-400">No show selected. Create a new show to get started.</div>;
    
    switch (activeView) {
      case 'loom':
        return <LoomLabelView showData={activeShowData} onSave={handleSaveShowData} />;
      case 'case':
        return <CaseLabelView showData={activeShowData} onSave={handleSaveShowData} />;
      case 'info':
        return <ShowInfoView showData={activeShowData} onSave={handleSaveShowData} />;
      default:
        return <ShowInfoView showData={activeShowData} onSave={handleSaveShowData} />;
    }
  };

  return (
    <>
      <div className="flex h-screen bg-gray-900 text-gray-200 font-sans">
        <aside className="w-64 bg-gray-800/50 border-r border-gray-700/50 flex flex-col">
          <div className="p-4 border-b border-gray-700/50">
            <h1 className="text-2xl font-bold text-purple-400">ShowReady</h1>
          </div>
          <div className="p-4 space-y-2">
            <label htmlFor="show-select" className="text-sm font-bold text-gray-400">ACTIVE SHOW</label>
            <select id="show-select" value={activeShowName} onChange={(e) => setActiveShowName(e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500">
              {shows.map((show) => <option key={show} value={show}>{show}</option>)}
            </select>
            <button onClick={() => setIsNewShowModalOpen(true)} className="w-full flex justify-center items-center gap-2 p-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold">
                <PlusCircle size={18} /> New Show
            </button>
          </div>
          <nav className="flex-grow p-4">
            <NavItem icon={<Info size={20} />} label="Show Info" active={activeView === 'info'} onClick={() => setActiveView('info')} />
            <NavItem icon={<FileText size={20} />} label="Loom Labels" active={activeView === 'loom'} onClick={() => setActiveView('loom')} />
            <NavItem icon={<Box size={20} />} label="Case Labels" active={activeView === 'case'} onClick={() => setActiveView('case')} />
          </nav>
          <div className="p-4 border-t border-gray-700/50 text-xs text-gray-500"><p>Version 1.0.0 (Web)</p></div>
        </aside>
        <main className="flex-1 p-8 overflow-y-auto">{renderActiveView()}</main>
      </div>
      <Modal
        isOpen={isNewShowModalOpen}
        onClose={() => setIsNewShowModalOpen(false)}
        onSubmit={handleCreateShow}
        title="Create New Show"
        prompt="Enter the name for the new show:"
      />
    </>
  );
}

const NavItem = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center p-3 my-1 rounded-md transition-colors duration-200 ${active ? 'bg-purple-500/20 text-purple-300' : 'text-gray-400 hover:bg-gray-700/50'}`}>
    {icon}<span className="ml-4 font-semibold">{label}</span>
  </button>
);

function ShowInfoView({ showData, onSave }) {
  const [formData, setFormData] = useState(showData.info);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => { setFormData(showData.info); }, [showData]);

  const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);
    setIsUploading(true);
    try {
      const result = await api.uploadLogo(uploadFormData);
      if (result.logo_path) setFormData(prev => ({ ...prev, logo_path: result.logo_path }));
    } catch (error) { console.error("Logo upload failed:", error); }
    setIsUploading(false);
  };

  const handleSave = () => onSave({ ...showData, info: formData });

  return (
    <div>
      <h2 className="text-3xl font-bold text-purple-400 border-b border-gray-700 pb-4 mb-6">Show Information</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <InputField label="Show Name" name="show_name" value={formData.show_name || ''} onChange={handleChange} />
          <InputField label="Production Manager" name="production_manager" value={formData.production_manager || ''} onChange={handleChange} />
          <InputField label="PM Email" name="pm_email" type="email" value={formData.pm_email || ''} onChange={handleChange} />
          <InputField label="Production Video" name="production_video" value={formData.production_video || ''} onChange={handleChange} />
        </div>
        <div className="space-y-4">
          <label className="block text-sm font-bold text-gray-400">Show Logo</label>
          <div className="w-full h-48 bg-gray-800 rounded-md flex items-center justify-center border-2 border-dashed border-gray-600">
            {formData.logo_path ? <p className="text-gray-400 truncate px-4">{formData.logo_path.split(/\/|\\/).pop()}</p> : <p className="text-gray-500">No logo uploaded</p>}
          </div>
          <input type="file" id="logo-upload" className="hidden" onChange={handleLogoUpload} accept="image/*" />
          <button onClick={() => document.getElementById('logo-upload').click()} disabled={isUploading} className="w-full flex justify-center items-center gap-2 p-2 bg-blue-500 hover:bg-blue-600 rounded-md font-semibold disabled:bg-gray-500">
            <UploadCloud size={20} /> {isUploading ? 'Uploading...' : 'Upload Logo'}
          </button>
        </div>
      </div>
      <div className="mt-8 flex justify-end">
        <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2 bg-green-500 hover:bg-green-600 rounded-md font-bold"><Save size={20} /> Save Changes</button>
      </div>
    </div>
  );
}

const InputField = ({ label, ...props }) => (
  <div>
    <label className="block text-sm font-bold text-gray-400 mb-1">{label}</label>
    <input {...props} className="w-full p-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500" />
  </div>
);

function LabelManagerView({ title, sheetType, showData, onSave, labelFields, pdfType }) {
  const [activeSheetName, setActiveSheetName] = useState('');
  const [labels, setLabels] = useState([]);
  const [editingLabel, setEditingLabel] = useState(null);
  const [isNewSheetModalOpen, setIsNewSheetModalOpen] = useState(false);

  const sheets = useMemo(() => showData[sheetType] || {}, [showData, sheetType]);
  const sheetNames = useMemo(() => Object.keys(sheets), [sheets]);

  useEffect(() => {
    if (sheetNames.length > 0 && !sheetNames.includes(activeSheetName)) {
      setActiveSheetName(sheetNames[0]);
    } else if (sheetNames.length === 0) {
      setActiveSheetName('');
    }
  }, [sheetNames, activeSheetName]);

  useEffect(() => {
    setLabels(activeSheetName ? sheets[activeSheetName] || [] : []);
    setEditingLabel(null);
  }, [activeSheetName, sheets]);

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

  const handleSaveLabel = (labelData) => {
    const updatedLabels = editingLabel ? labels.map(l => l === editingLabel ? labelData : l) : [...labels, labelData];
    const updatedShowData = { ...showData, [sheetType]: { ...sheets, [activeSheetName]: updatedLabels } };
    onSave(updatedShowData);
    setEditingLabel(null);
  };

  const handleDeleteLabel = (labelToDelete) => {
    const updatedLabels = labels.filter(l => l !== labelToDelete);
    const updatedShowData = { ...showData, [sheetType]: { ...sheets, [activeSheetName]: updatedLabels } };
    onSave(updatedShowData);
  };

  const handleGeneratePdf = async () => {
    const body = { labels };
    if (pdfType === 'case') body.logo_path = showData.info.logo_path;
    try {
      const blob = await api.generatePdf(pdfType, body);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch(e) { console.error("PDF generation failed", e); }
  };

  return (
    <>
      <div>
        <h2 className="text-3xl font-bold text-purple-400 border-b border-gray-700 pb-4 mb-6">{title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <h3 className="text-xl font-bold mb-4">{editingLabel ? 'Edit Label' : 'Add New Label'}</h3>
            {activeSheetName ? <LabelForm fields={labelFields} initialData={editingLabel} onSubmit={handleSaveLabel} onCancel={() => setEditingLabel(null)} /> : <p className="text-gray-500">Create or select a sheet to add labels.</p>}
          </div>
          <div className="md:col-span-2">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Labels</h3>
              <div className="flex items-center gap-2">
                <select value={activeSheetName} onChange={(e) => setActiveSheetName(e.target.value)} className="p-2 bg-gray-700 border border-gray-600 rounded-md">
                  <option value="" disabled>{sheetNames.length === 0 ? 'No sheets available' : 'Select a sheet'}</option>
                  {sheetNames.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
                <button onClick={() => setIsNewSheetModalOpen(true)} className="p-2 bg-green-600 hover:bg-green-700 rounded-md"><PlusCircle size={20} /></button>
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 min-h-[200px]">
              <table className="w-full">
                <thead className="border-b border-gray-700"><tr>{labelFields.map(f => <th key={f.name} className="p-3 text-left font-semibold text-gray-400">{f.label}</th>)}<th className="p-3 text-right font-semibold text-gray-400">Actions</th></tr></thead>
                <tbody>{labels.map((label, idx) => (<tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-700/30">{labelFields.map(f => <td key={f.name} className="p-3 truncate">{label[f.name]}</td>)}<td className="p-3 flex justify-end gap-2"><button onClick={() => setEditingLabel(label)} className="text-blue-400 hover:text-blue-300"><Edit size={18} /></button><button onClick={() => handleDeleteLabel(label)} className="text-red-400 hover:text-red-300"><Trash2 size={18} /></button></td></tr>))}</tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end"><button onClick={handleGeneratePdf} disabled={labels.length === 0} className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-md font-bold disabled:bg-gray-600">Generate PDF</button></div>
          </div>
        </div>
      </div>
      <Modal isOpen={isNewSheetModalOpen} onClose={() => setIsNewSheetModalOpen(false)} onSubmit={handleCreateSheet} title="Create New Sheet" prompt="Enter the name for the new sheet:" />
    </>
  );
}

const LoomLabelView = ({ showData, onSave }) => <LabelManagerView title="Loom Label Generator" sheetType="loom_sheets" pdfType="loom" showData={showData} onSave={onSave} labelFields={[{ name: 'loom_name', label: 'Loom Name', type: 'text' },{ name: 'color', label: 'Color', type: 'text' },{ name: 'source', label: 'Source', type: 'text' },{ name: 'destination', label: 'Destination', type: 'text' }]} />;
const CaseLabelView = ({ showData, onSave }) => <LabelManagerView title="Case Label Generator" sheetType="case_sheets" pdfType="case" showData={showData} onSave={onSave} labelFields={[{ name: 'send_to', label: 'Send To', type: 'text' },{ name: 'contents', label: 'Contents', type: 'textarea' }]} />;

function LabelForm({ fields, initialData, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    const defaultState = initialData || fields.reduce((acc, f) => ({...acc, [f.name]: ''}), {});
    setFormData(defaultState);
  }, [initialData, fields]);

  const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
    if (!initialData) setFormData(fields.reduce((acc, f) => ({...acc, [f.name]: ''}), {}));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map(field => ( field.type === 'textarea' ? <textarea key={field.name} name={field.name} value={formData[field.name] || ''} onChange={handleChange} placeholder={field.label} rows="4" className="w-full p-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"></textarea> : <InputField key={field.name} label={field.label} name={field.name} type={field.type} value={formData[field.name] || ''} onChange={handleChange} /> ))}
      <div className="flex gap-2">
        <button type="submit" className="flex-1 flex justify-center items-center gap-2 p-2 bg-green-500 hover:bg-green-600 rounded-md font-semibold">{initialData ? <Save size={18}/> : <PlusCircle size={18}/>}{initialData ? 'Save Changes' : 'Add Label'}</button>
        {initialData && <button type="button" onClick={onCancel} className="p-2 bg-gray-600 hover:bg-gray-500 rounded-md font-semibold">Cancel</button>}
      </div>
    </form>
  );
}

// --- Reusable Modal Component ---
function Modal({ isOpen, onClose, onSubmit, title, prompt }) {
    const [inputValue, setInputValue] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(inputValue);
        setInputValue('');
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4">{title}</h2>
                <form onSubmit={handleSubmit}>
                    <label className="block text-sm font-bold text-gray-400 mb-2">{prompt}</label>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        autoFocus
                    />
                    <div className="flex justify-end gap-4 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md font-semibold">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold">Create</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
