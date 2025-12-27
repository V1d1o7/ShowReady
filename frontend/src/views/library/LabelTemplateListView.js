import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/api';
import { useAuth } from '../../contexts/AuthContext';

const LabelTemplateListView = () => {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { profile } = useAuth();

  useEffect(() => {
    const fetchTemplates = async () => {
      if (!profile) return;

      try {
        const response = await api.get('/library/label-templates');
        setTemplates(response.data);
      } catch (err) {
        setError('Failed to fetch label templates.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, [profile]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Label Templates</h1>
        <Link
          to="/settings/label-template-builder"
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Create New
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.length === 0 ? (
          <p>No templates found. Create one to get started!</p>
        ) : (
          templates.map(template => (
            <div key={template.id} className="border rounded-lg p-4 shadow-sm">
              <h2 className="text-lg font-semibold">{template.name}</h2>
              <p className="text-sm text-gray-500">{template.stock_id}</p>
              {/* Add more template details or a preview image here */}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LabelTemplateListView;
