import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/api';
import { useAuth } from '../../contexts/AuthContext';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';

const LabelTemplateListView = () => {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { profile } = useAuth(); // Assuming profile contains permissions

  useEffect(() => {
    const fetchTemplates = async () => {
      if (!profile) return;
      setIsLoading(true); // Ensure loading state is set

      try {
        // api.js returns the array directly after handleResponse parses JSON
        const response = await api.getLabelTemplates();
        setTemplates(response);
      } catch (err) {
        console.error("Failed to fetch label templates:", err);
        // FIX: Use toast.error since setError state is not defined in this component
        toast.error(`Failed to fetch templates: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, [profile]);

  if (isLoading) {
    return <div className="text-center p-8">Loading templates...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">My Label Templates</h2>
        <Link 
            to="/settings/label-template-builder" 
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors"
        >
            <Plus size={16}/> New Template
        </Link>
      </div>
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="border-b border-gray-700">
            <tr>
              <th className="p-3 font-bold text-gray-400 uppercase tracking-wider">Name</th>
              <th className="p-3 font-bold text-gray-400 uppercase tracking-wider">Category</th>
              <th className="p-3 font-bold text-gray-400 uppercase tracking-wider">Type</th>
            </tr>
          </thead>
          <tbody>
            {templates.map(template => (
              <tr key={template.id} className="border-b border-gray-700/50 hover:bg-gray-700">
                <td className="p-3">{template.name}</td>
                <td className="p-3 capitalize">{template.category || 'N/A'}</td>
                <td className="p-3 capitalize">{template.is_system ? 'System' : 'Private'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {templates.length === 0 && (
            <div className="text-center py-8 text-gray-500">
                No custom templates found.
            </div>
        )}
      </div>
    </div>
  );
};

export default LabelTemplateListView;
