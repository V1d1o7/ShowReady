import React from 'react';
import LabelManagerView from '../components/LabelManagerView';

const caseLabelFields = [
    { name: 'send_to', label: 'Send To', type: 'text' },
    { name: 'contents', label: 'Contents', type: 'textarea' }
];

const CaseLabelView = ({ showData, onSave }) => (
    <LabelManagerView 
        sheetType="case_sheets" 
        pdfType="case" 
        showData={showData} 
        onSave={onSave} 
        labelFields={caseLabelFields} 
    />
);

export default CaseLabelView;