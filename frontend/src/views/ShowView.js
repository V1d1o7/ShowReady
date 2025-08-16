import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { HardDrive, FileText, ChevronLeft } from 'lucide-react';
import RackBuilderView from './RackBuilderView';
import ShowInfoView from './ShowInfoView';

const ShowView = () => {
    const { showName } = useParams();
    const navigate = useNavigate();
    const [show, setShow] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('rack-builder');

    useEffect(() => {
        const fetchShow = async () => {
            try {
                // *** THIS IS THE FIX ***
                const showData = await api.getShow(showName);
                setShow(showData);
            } catch (error) {
                console.error("Failed to fetch show details:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchShow();
    }, [showName]);

    const handleTabClick = (tabName) => {
        setActiveTab(tabName);
    };

    if (isLoading) {
        return <div className="p-8 text-center">Loading show...</div>;
    }

    if (!show) {
        return <div className="p-8 text-center">Show not found.</div>;
    }

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-8">
            <header className="mb-8">
                <button onClick={() => navigate('/dashboard')} className="flex items-center text-sm text-gray-400 hover:text-white mb-4">
                    <ChevronLeft size={16} className="mr-1" />
                    Back to Dashboard
                </button>
                <h1 className="text-4xl font-bold text-white">{show.show_name}</h1>
                <p className="text-gray-400">{show.show_description}</p>
            </header>

            <main>
                <div className="border-b border-gray-700 mb-6">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button
                            onClick={() => handleTabClick('rack-builder')}
                            className={`flex items-center whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'rack-builder' ? 'border-amber-500 text-amber-500' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}`}
                        >
                           <HardDrive size={16} className="mr-2"/> Rack Builder
                        </button>
                        <button
                            onClick={() => handleTabClick('show-info')}
                            className={`flex items-center whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'show-info' ? 'border-amber-500 text-amber-500' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}`}
                        >
                            <FileText size={16} className="mr-2"/> Show Info
                        </button>
                    </nav>
                </div>

                <div>
                    {activeTab === 'rack-builder' && <RackBuilderView showName={showName} />}
                    {activeTab === 'show-info' && <ShowInfoView showName={showName} />}
                </div>
            </main>
        </div>
    );
};

export default ShowView;