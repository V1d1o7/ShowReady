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
  
    useEffect(() => {
      if (showData && showData.info) {
        setFormData(showData.info);
        if (showData.info.logo_path) {
          setLogoError(false);
          supabase.storage.from('logos').createSignedUrl(showData.info.logo_path, 3600)
            .then(({ data, error }) => {
              if (error) {
                console.error("Error creating signed URL:", error);
                setLogoError(true);
              } else {
                setLogoUrl(data.signedUrl);
              }
            });
        } else {
          setLogoUrl(null);
        }
      }
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
          const updatedInfo = { ...formData, logo_path: result.logo_path };
          setFormData(updatedInfo);
          if (showData) {
            onSave({ ...showData, info: updatedInfo });
          }
        }
      } catch (error) { 
        console.error("Logo upload failed:", error); 
        setLogoError(true);
      }
      setIsUploading(false);
    };
  
    const handleSave = () => {
      if (showData) {
        onSave({ ...showData, info: formData });
      }
    };

    if (isShowLoading || !formData) {
      return (
        <div className="flex justify-center items-center h-full">
          <p>Loading show information...</p>
        </div>
      );
    }
  
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <Card className="lg:col-span-3 space-y-6">
            <InputField label="Show Name" name="show_name" value={formData.show_name || ''} onChange={handleChange} />
            <InputField label="Production Manager" name="show_pm_name" value={formData.show_pm_name || ''} onChange={handleChange} />
            <InputField label="PM Email" name="show_pm_email" type="email" value={formData.show_pm_email || ''} onChange={handleChange} />
            <InputField label="Technical Director" name="show_td_name" value={formData.show_td_name || ''} onChange={handleChange} />
            <InputField label="TD Email" name="show_td_email" type="email" value={formData.show_td_email || ''} onChange={handleChange} />
            <InputField label="Designer" name="show_designer_name" value={formData.show_designer_name || ''} onChange={handleChange} />
            <InputField label="Designer Email" name="show_designer_email" type="email" value={formData.show_designer_email || ''} onChange={handleChange} />
            <InputField label="Production Video" name="production_video" value={formData.production_video || ''} onChange={handleChange} />
          </Card>
          <Card className="lg:col-span-2 space-y-4">
            <label className="block text-sm font-medium text-gray-300">Show Logo</label>
            <div className="w-full aspect-video bg-gray-900/50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-700 overflow-hidden">
              {logoUrl && !logoError ? (
                <img 
                  src={logoUrl}
                  alt="Show Logo"
                  className="w-full h-full object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <p className="text-gray-500 text-sm px-4 text-center">
                  {logoError ? `Failed to load logo` : 'No logo uploaded'}
                </p>
              )}
            </div>
            <input type="file" id="logo-upload" className="hidden" onChange={handleLogoUpload} accept="image/*" />
            <button onClick={() => document.getElementById('logo-upload').click()} disabled={isUploading} className="w-full flex justify-center items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 disabled:bg-gray-600 transition-colors">
              <UploadCloud size={16} /> {isUploading ? 'Uploading...' : 'Upload Logo'}
            </button>
          </Card>
        </div>
        <div className="mt-8 flex justify-end space-x-4">
            {profile?.permitted_features?.includes('contextual_notes') && (
                <button onClick={() => setIsNotesDrawerOpen(true)} aria-label="Open Notes Drawer" className="flex items-center gap-2 px-5 py-2.5 bg-gray-600 hover:bg-gray-500 rounded-lg font-bold text-white transition-colors">
                    <MessageSquare size={16} /> Show Notes
                </button>
            )}
          <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors"><Save size={16} /> Save Changes</button>
        </div>
        <ContextualNotesDrawer
            entityType="show"
            entityId={showId}
            showId={showId}
            isOpen={isNotesDrawerOpen}
            onClose={() => setIsNotesDrawerOpen(false)}
            isOwner={showData?.user_id === user?.id}
        />
      </div>
    );
  }
  
  export default ShowInfoView;