import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { api } from '../api/api';
import Card from '../components/Card';
import InputField from '../components/InputField';

const AdminView = ({ onBack }) => {
    const [folders, setFolders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchAdminData = async () => {
            try {
                const foldersData = await api.getAdminFolders(); // Assumes you create this api function
                setFolders(foldersData);
            } catch (error) {
                console.error("Failed to fetch admin data:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAdminData();
    }, []);

    if (isLoading) {
        return <div className="p-8">Loading admin data...</div>;
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
            <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-700 transition-colors"><ArrowLeft size={20} /></button>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">Super Admin Panel</h1>
                </div>
            </header>
            <main className="space-y-8">
                <Card>
                    <h2 className="text-xl font-bold mb-4 text-white">Default Library Folders</h2>
                    <ul>
                        {folders.map(folder => (
                            <li key={folder.id} className="p-2 border-b border-gray-700">{folder.name}</li>
                        ))}
                    </ul>
                    <button className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400">
                        <Plus size={16} /> Add New Folder
                    </button>
                </Card>
                {/* Add sections for Equipment Templates etc. here */}
            </main>
        </div>
    );
};

export default AdminView;