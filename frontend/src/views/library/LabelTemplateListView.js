import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/api';
import { useAuth } from '../../contexts/AuthContext';
import { useModal } from '../../contexts/ModalContext'; // Import Modal Context
import { Plus, Edit2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const LabelTemplateListView = () => {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { profile } = useAuth();
  const { showConfirmationModal } = useModal(); // Use the custom modal

  const fetchTemplates = async () => {
    if (!profile) return;
    setIsLoading(true);
    try {
      const response = await api.getLabelTemplates();
      setTemplates(response);
    } catch (err) {
      toast.error(`Failed to fetch templates: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [profile]);

  const handleDelete = (id) => {
      // Replaced window.confirm with showConfirmationModal
      showConfirmationModal("Are you sure you want to delete this template?", async () => {
          try {
              await api.deleteLabelTemplate(id);
              toast.success("Template deleted");
              fetchTemplates();
          } catch(err) {
              toast.error("Failed to delete template");
          }
      });
  };

  if (isLoading) {
    return <div className="text-center p-8 text-gray-400">Loading templates...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">My Label Templates</h2>
        <Link 
            to="/settings/label-template-builder" 
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors"
        >
            <Plus size={16}/> New Template
        </Link>
      </div>
      <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
        <table className="w-full text-sm text-left text-gray-300">
          <thead className="bg-gray-700/50 text-gray-400 border-b border-gray-700">
            <tr>
              <th className="p-3 uppercase tracking-wider">Name</th>
              <th className="p-3 uppercase tracking-wider">Category</th>
              <th className="p-3 uppercase tracking-wider">Type</th>
              <th className="p-3 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map(template => (
              <tr key={template.id} className="border-b border-gray-700/50 hover:bg-gray-750 transition-colors">
                <td className="p-3 font-medium text-white">{template.name}</td>
                <td className="p-3 capitalize">{template.category || 'N/A'}</td>
                <td className="p-3 capitalize">
                    <span className={`px-2 py-0.5 rounded text-xs ${template.is_system ? 'bg-blue-900 text-blue-200' : 'bg-green-900 text-green-200'}`}>
                        {template.is_system ? 'System' : 'Custom'}
                    </span>
                </td>
                <td className="p-3 text-right flex justify-end gap-2">
                    {!template.is_system && (
                        <>
                            <Link to={`/settings/label-template-builder/${template.id}`} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors" title="Edit">
                                <Edit2 size={16}/>
                            </Link>
                            <button onClick={() => handleDelete(template.id)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors" title="Delete">
                                <Trash2 size={16}/>
                            </button>
                        </>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {templates.length === 0 && (
            <div className="text-center py-12 text-gray-500">
                No templates found. Create one to get started.
            </div>
        )}
      </div>
    </div>
  );
};

export default LabelTemplateListView;