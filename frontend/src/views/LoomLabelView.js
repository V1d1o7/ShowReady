import React, { useState } from 'react';
import LabelManagerView from '../components/LabelManagerView';
import DynamicLabelManager from '../components/DynamicLabelManager';
import Card from '../components/Card';
import { useShow } from '../contexts/ShowContext';
import { useAuth } from '../contexts/AuthContext';
import { Tag, Tags } from 'lucide-react';

const loomLabelFields = [
    { name: 'loom_name', label: 'Loom Name', type: 'text' },
    { name: 'color', label: 'Color', type: 'color' },
    { name: 'source', label: 'Source', type: 'text' },
    { name: 'destination', label: 'Destination', type: 'text' }
];

const LoomLabelView = () => {
    const { showData, onSave } = useShow();
    const { profile } = useAuth();
    const [activeTab, setActiveTab] = useState('manage');

    // 1. Check for advanced tier (Build, Run, or Admin)
    const hasAccess = profile?.permitted_features?.includes('label_engine');

    // 2. Core Tier: Return only the legacy view
    if (!hasAccess) {
        return (
            <LabelManagerView 
                sheetType="loom_sheets" 
                pdfType="loom" 
                showData={showData} 
                onSave={onSave} 
                labelFields={loomLabelFields} 
            />
        );
    }

    // 3. Advanced Tier: Return Tabbed Interface
    return (
        <div className="space-y-4">
            {/* Navigation Tabs */}
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

            {/* Tab Content */}
            <div>
                {activeTab === 'manage' ? (
                    <LabelManagerView 
                        sheetType="loom_sheets" 
                        pdfType="loom" 
                        showData={showData} 
                        onSave={onSave} 
                        labelFields={loomLabelFields} 
                    />
                ) : (
                    <Card>
                        <div className="mb-4">
                            <h2 className="text-xl font-bold text-white">Loom Label Engine</h2>
                            <p className="text-gray-400 text-sm">Select a template and print labels using your loom data.</p>
                        </div>
                        <div style={{ height: '65vh' }}>
                            <DynamicLabelManager category="loom" />
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default LoomLabelView;