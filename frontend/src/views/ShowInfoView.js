import React, { useState, useEffect } from 'react';
import { UploadCloud, Save, MessageSquare } from 'lucide-react';
import { supabase, api } from '../api/api';
import Card from '../components/Card';
import InputField from '../components/InputField';
import { useShow } from '../contexts/ShowContext';
import { useAuth } from '../contexts/AuthContext';
import ContextualNotesDrawer from '../components/ContextualNotesDrawer';

const ShowInfoView = () => {
    const { showData, onSave, isLoading: isShowLoading, showId } = useShow();
    const { profile, user } = useAuth();
    const [formData, setFormData] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [logoUrl, setLogoUrl] = useState(null);
    const [logoError, setLogoError] = useState(false);
    const [isNotesDrawerOpen, setIsNotesDrawerOpen] = useState(false);
    const [hasNotes, setHasNotes] = useState(false);
  
    useEffect(() => {
      if (showData && showData.info) {
        const info = showData.info;
        // Fix: Load info directly. The backend uses flat keys (e.g., show_pm_first_name)
        // defined in models.py, not nested objects.
        setFormData(info);
        
        setHasNotes(showData.has_notes || false);

        if (info.logo_path) {
          setLogoError(false);
          supabase.storage.from('logos').createSignedUrl(info.logo_path, 3600)
            .then(({ data, error }) => {
              if (error) { console.error("Error creating signed URL:", error); setLogoError(true); } 
              else { setLogoUrl(data.signedUrl); }
            });
        } else {
          setLogoUrl(null);
        }
      }
    }, [showData]);

    useEffect(() => {
        const checkNotesStatus = async () => {
            if (showId) {
                try {
                    const notes = await api.getNotesForEntity('show', showId, showId);
                    if (notes && notes.length > 0) setHasNotes(true);
                } catch (error) { console.error("Failed to check notes status:", error); }
            }
        };
        checkNotesStatus();
    }, [showId]);
  
    const handleChange = (e) => {
        const { name, value } = e.target;
        // Fix: We can simplify this since we are using flat keys now.
        setFormData(prev => ({ ...prev, [name]: value }));
    };
  
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
                const updatedInfo = { ...formData, logo_path: result.logo_path };
                setFormData(updatedInfo);
                handleSave(updatedInfo);
            }
        } catch (error) { console.error("Logo upload failed:", error); setLogoError(true); }
        setIsUploading(false);
    };
  
    const handleSave = (dataToSave = formData) => {
      if (showData) {
        onSave({ ...showData, info: dataToSave });
      }
    };

    if (isShowLoading || !formData) {
      return <div className="flex justify-center items-center h-full"><p>Loading show information...</p></div>;
    }
  
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <Card className="lg:col-span-3 space-y-6">
            <InputField label="Show Name" name="show_name" value={formData.show_name || ''} onChange={handleChange} />
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Production Manager</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Fix: Updated names to match models.py (show_pm_first_name, etc.) */}
                    <InputField label="First Name" name="show_pm_first_name" value={formData.show_pm_first_name || ''} onChange={handleChange} />
                    <InputField label="Last Name" name="show_pm_last_name" value={formData.show_pm_last_name || ''} onChange={handleChange} />
                </div>
                <InputField label="PM Email" name="show_pm_email" type="email" value={formData.show_pm_email || ''} onChange={handleChange} wrapperClassName="mt-4" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Technical Director</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InputField label="First Name" name="show_td_first_name" value={formData.show_td_first_name || ''} onChange={handleChange} />
                    <InputField label="Last Name" name="show_td_last_name" value={formData.show_td_last_name || ''} onChange={handleChange} />
                </div>
                <InputField label="TD Email" name="show_td_email" type="email" value={formData.show_td_email || ''} onChange={handleChange} wrapperClassName="mt-4" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Designer</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InputField label="First Name" name="show_designer_first_name" value={formData.show_designer_first_name || ''} onChange={handleChange} />
                    <InputField label="Last Name" name="show_designer_last_name" value={formData.show_designer_last_name || ''} onChange={handleChange} />
                </div>
                <InputField label="Designer Email" name="show_designer_email" type="email" value={formData.show_designer_email || ''} onChange={handleChange} wrapperClassName="mt-4" />
            </div>
            <InputField label="Production Video" name="production_video" value={formData.production_video || ''} onChange={handleChange} />
          </Card>
          <Card className="lg:col-span-2 space-y-4">
            <label className="block text-sm font-medium text-gray-300">Show Logo</label>
            <div className="w-full aspect-video bg-gray-900/50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-700 overflow-hidden">
              {logoUrl && !logoError ? <img src={logoUrl} alt="Show Logo" className="w-full h-full object-contain" onError={() => setLogoError(true)} /> : <p className="text-gray-500 text-sm px-4 text-center">{logoError ? `Failed to load logo` : 'No logo uploaded'}</p>}
            </div>
            <input type="file" id="logo-upload" className="hidden" onChange={handleLogoUpload} accept="image/*" />
            <button onClick={() => document.getElementById('logo-upload').click()} disabled={isUploading} className="w-full flex justify-center items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 disabled:bg-gray-600 transition-colors"><UploadCloud size={16} /> {isUploading ? 'Uploading...' : 'Upload Logo'}</button>
          </Card>
        </div>
        <div className="mt-8 flex justify-end space-x-4">
            {profile?.permitted_features?.includes('contextual_notes') && (
                <div className="relative">
                    <button onClick={() => setIsNotesDrawerOpen(true)} aria-label="Open Notes Drawer" className="relative flex items-center gap-2 px-5 py-2.5 bg-gray-600 hover:bg-gray-500 rounded-lg font-bold text-white transition-colors"><MessageSquare size={16} /> Show Notes{hasNotes && (<span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>)}</button>
                </div>
            )}
          <button onClick={() => handleSave()} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors"><Save size={16} /> Save Changes</button>
        </div>
        <ContextualNotesDrawer entityType="show" entityId={showId} showId={showId} isOpen={isNotesDrawerOpen} onClose={() => setIsNotesDrawerOpen(false)} isOwner={showData?.user_id === user?.id} onNotesUpdated={(count) => setHasNotes(count > 0)} />
      </div>
    );
  }
  
  export default ShowInfoView;