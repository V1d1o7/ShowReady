import React, { useState } from 'react';
import { FileText, Box, Info, ArrowLeft, Server } from 'lucide-react';
import ShowInfoView from './ShowInfoView';
import LoomLabelView from './LoomLabelView';
import CaseLabelView from './CaseLabelView';
import RackBuilderView from './RackBuilderView';


const ShowView = ({ showName, showData, onSave, onBack, isLoading }) => {
    const [activeTab, setActiveTab] = useState('info');

    const tabs = [
        { id: 'info', label: 'Show Info', icon: Info },
        { id: 'loom', label: 'Loom Labels', icon: FileText },
        { id: 'case', label: 'Case Labels', icon: Box },
        { id: 'rack', label: 'Rack Builder', icon: Server },
    ];

    if (isLoading || !showData) {
        return <div className="flex items-center justify-center h-screen"><div className="text-xl text-gray-400">Loading Show...</div></div>;
    }

    // Conditionally set the container class based on the active tab
    const containerClass = activeTab === 'rack'
        ? "p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto"
        : "p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto";

    return (
        <div className={containerClass}>
            <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-700 transition-colors"><ArrowLeft size={20} /></button>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">{showName}</h1>
                </div>
            </header>
            <div className="flex border-b border-gray-700 mb-6">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-3 text-sm font-bold transition-colors ${activeTab === tab.id ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-400 hover:text-white'}`}>
                        <tab.icon size={16} /> {tab.label}
                    </button>
                ))}
            </div>
            <main>
                {activeTab === 'info' && <ShowInfoView showData={showData} onSave={onSave} />}
                {activeTab === 'loom' && <LoomLabelView showData={showData} onSave={onSave} />}
                {activeTab === 'case' && <CaseLabelView showData={showData} onSave={onSave} />}
                {activeTab === 'rack' && <RackBuilderView showName={showName} />}
            </main>
        </div>
    );
};

export default ShowView;