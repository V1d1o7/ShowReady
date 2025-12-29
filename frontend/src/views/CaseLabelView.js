import React, { useState } from 'react';
import LabelManagerView from '../components/LabelManagerView';
import DynamicLabelManager from '../components/DynamicLabelManager';
import Card from '../components/Card';
import { useShow } from '../contexts/ShowContext';
import { useAuth } from '../contexts/AuthContext';
import { Tag, Tags } from 'lucide-react';

const caseLabelFields = [
    { name: 'send_to', label: 'Send To', type: 'text' },
    { name: 'contents', label: 'Contents', type: 'textarea' }
];

const CaseLabelView = () => {
    const { showData, onSave } = useShow();
    const { profile } = useAuth();
    const [activeTab, setActiveTab] = useState('manage');

    // Check for advanced tier (Build or Run)
  const hasAccess = profile?.permitted_features?.includes('label_engine');

    // Core Tier: Just return the legacy view
    if (!hasAccess) {
        return (
            <LabelManagerView 
                sheetType="case_sheets" 
                pdfType="case" 
                showData={showData} 
                onSave={onSave} 
                labelFields={caseLabelFields} 
            />
        );
    }

    // Advanced Tier: Tabbed Interface
    return (
        <div className="space-y-4">
            {/* Tab Navigation */}
            <div className="flex bg-gray-800 p-1 rounded-lg border border-gray-700 w-fit">
                <button
                    onClick={() => setActiveTab('manage')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${
                        activeTab === 'manage' 
                        ? 'bg-amber-500 text-black shadow' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Tag size={16} /> Labels
                </button>
                <button
                    onClick={() => setActiveTab('engine')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${
                        activeTab === 'engine' 
                        ? 'bg-amber-500 text-black shadow' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Tags size={16} /> Label Engine
                </button>
            </div>

            {/* Content Area */}
            <div>
                {activeTab === 'manage' ? (
                    <LabelManagerView 
                        sheetType="case_sheets" 
                        pdfType="case" 
                        showData={showData} 
                        onSave={onSave} 
                        labelFields={caseLabelFields} 
                    />
                ) : (
                    <Card>
                        <div className="mb-4">
                            <h2 className="text-xl font-bold text-white">Case Label Engine</h2>
                            <p className="text-gray-400 text-sm">Select a template and print labels using your case data.</p>
                        </div>
                        <div style={{ height: '65vh' }}>
                            <DynamicLabelManager category="case" />
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default CaseLabelView;