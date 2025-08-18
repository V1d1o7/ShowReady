import React from 'react';
import LabelManagerView from '../components/LabelManagerView';
import { useShow } from '../contexts/ShowContext';

const caseLabelFields = [
    { name: 'send_to', label: 'Send To', type: 'text' },
    { name: 'contents', label: 'Contents', type: 'textarea' }
];

const CaseLabelView = () => {
    const { showData, onSave } = useShow();
    return (
        <LabelManagerView 
            sheetType="case_sheets" 
            pdfType="case" 
            showData={showData} 
            onSave={onSave} 
            labelFields={caseLabelFields} 
        />
    );
};

export default CaseLabelView;