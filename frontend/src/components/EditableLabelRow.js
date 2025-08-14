import React from 'react';
import { Save, X } from 'lucide-react';

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

  export default EditableLabelRow;