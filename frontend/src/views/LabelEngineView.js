import React, { useState } from 'react';
import DynamicLabelManager from '../components/DynamicLabelManager';
import Card from '../components/Card';
import { Tag, Box } from 'lucide-react';

const LabelEngineView = () => {
  const [activeCategory, setActiveCategory] = useState('case');

  return (
    <Card>
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-2xl font-bold text-white">Label Engine</h1>
            <p className="text-gray-400 text-sm mt-1">
                Print labels for your show equipment using custom templates.
            </p>
        </div>
        
        {/* Category Toggles */}
        <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700">
            <button 
                onClick={() => setActiveCategory('case')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${activeCategory === 'case' ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'}`}
            >
                <Box size={16}/> Case Labels
            </button>
            <button 
                onClick={() => setActiveCategory('loom')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${activeCategory === 'loom' ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'}`}
            >
                <Tag size={16}/> Loom Labels
            </button>
        </div>
      </div>

      <div style={{ height: '70vh' }}>
        {/* Force re-mount when category changes to reset internal state */}
        <DynamicLabelManager key={activeCategory} category={activeCategory} />
      </div>
    </Card>
  );
};

export default LabelEngineView;