import React from 'react';
import { Plus } from 'lucide-react';
import Card from '../components/Card';
import UserTreeView from '../components/UserTreeView';
import { useLibrary } from '../contexts/LibraryContext';

const EquipmentLibraryView = () => {
    const {
        library,
        isLoading,
        onDeleteFolder,
        onDeleteEquipment,
        onEditItem,
        onNewFolder,
        onNewEquipment,
    } = useLibrary();

    return (
        <Card className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">My Custom Equipment</h2>
                <div className="flex gap-2">
                    <button onClick={onNewFolder} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600">
                        <Plus size={16} /> New Folder
                    </button>
                    <button onClick={onNewEquipment} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400">
                        <Plus size={16} /> New Equipment
                    </button>
                </div>
            </div>
            <div className="p-4 bg-gray-900/50 rounded-lg min-h-[300px]">
                {isLoading ? (
                    <p>Loading library...</p>
                ) : (
                    <UserTreeView
                        folders={library.folders.filter(f => !f.is_default)}
                        equipment={library.equipment.filter(e => !e.is_default)}
                        onDeleteFolder={onDeleteFolder}
                        onDeleteEquipment={onDeleteEquipment}
                        onEditItem={onEditItem}
                    />
                )}
            </div>
        </Card>
    );
};

export default EquipmentLibraryView;
