import React, { useState } from 'react';
import { Plus, Edit, Trash2, Library, Download, PanelLeftClose, FileText } from 'lucide-react';
import EditRackModal from './EditRackModal'; 

const RackList = ({ racks, onSelectRack, onNewRack, onDeleteRack, onUpdateRack, selectedRackId, onLoadFromRackLibrary, onExportPdf, onExportListPdf, title = 'Show Racks', onCollapse }) => {
    const [editingRack, setEditingRack] = useState(null);

    const handleSave = (rackData) => {
        onUpdateRack(editingRack.id, rackData);
        setEditingRack(null);
    };

    return (
        <>
            <div className="w-72 flex-shrink-0 bg-gray-800 p-3 rounded-xl flex flex-col">
                <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                        {onCollapse && (
                            <button onClick={onCollapse} className="p-2 text-gray-400 hover:text-amber-400">
                                <PanelLeftClose size={18} />
                            </button>
                        )}
                        <h3 className="text-lg font-bold text-white">{title}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onNewRack}
                            className="p-2 text-gray-400 hover:text-amber-400 hover:bg-gray-700 rounded-md transition-colors"
                        >
                            <Plus size={18} />
                        </button>
                    </div>
                </div>
                <div className="overflow-y-auto flex-grow">
                    {racks.map(rack => (
                        <div
                            key={rack.id}
                            onClick={() => onSelectRack(rack.id)}
                            className={`group p-2 rounded-md cursor-pointer mb-2 flex justify-between items-center ${selectedRackId === rack.id ? 'bg-amber-500/20 text-amber-300' : 'hover:bg-gray-700'}`}
                        >
                            <div>
                                <p className="font-bold truncate">{rack.rack_name}</p>
                                <p className="text-xs text-gray-400">{rack.ru_height}RU</p>
                            </div>
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); setEditingRack(rack); }} className="p-1 text-gray-400 hover:text-amber-400"><Edit size={16} /></button>
                                <button onClick={(e) => { e.stopPropagation(); onDeleteRack(rack.id); }} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    ))}
                </div>
                
                <div className="pt-4 border-t border-gray-700 flex flex-col gap-2">
                    {onLoadFromRackLibrary && (
                        <button onClick={onLoadFromRackLibrary} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600">
                            <Library size={16} /> Load from Rack Library
                        </button>
                    )}
                    {onExportPdf && (
                         <button onClick={onExportPdf} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600">
                            <Download size={16} /> Export PDF
                        </button>
                    )}
                    {onExportListPdf && (
                        <button onClick={onExportListPdf} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600">
                            <FileText size={16} /> Export Equipment List
                        </button>
                    )}
                </div>
            </div>
            {editingRack && (
                <EditRackModal
                    isOpen={!!editingRack}
                    onClose={() => setEditingRack(null)}
                    onSubmit={handleSave}
                    rack={editingRack}
                />
            )}
        </>
    );
};

export default RackList;