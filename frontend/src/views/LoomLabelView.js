import React from 'react';
import LabelManagerView from '../components/LabelManagerView';

const loomLabelFields = [
    { name: 'loom_name', label: 'Loom Name', type: 'text' },
    { name: 'color', label: 'Color', type: 'color' },
    { name: 'source', label: 'Source', type: 'text' },
    { name: 'destination', label: 'Destination', type: 'text' }
];

const LoomLabelView = ({ showData, onSave }) => (
    <LabelManagerView 
        sheetType="loom_sheets" 
        pdfType="loom" 
        showData={showData} 
        onSave={onSave} 
        labelFields={loomLabelFields} 
    />
);

export default LoomLabelView;