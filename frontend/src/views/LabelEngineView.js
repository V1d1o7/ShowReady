import React from 'react';
import DynamicLabelManager from '../components/DynamicLabelManager';
import Card from '../components/Card';

const LabelEngineView = () => {
  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-white">Label Engine</h1>
      </div>
      <p className="text-gray-400 mb-4">
        Select a template, generate a series or import a CSV, and print your case labels.
      </p>
      <div style={{ height: '70vh' }}>
        <DynamicLabelManager category="case" />
      </div>
    </Card>
  );
};

export default LabelEngineView;
