import React, { useState } from 'react';
import Modal from './Modal';

const ExportHoursModal = ({ isOpen, onClose, crewMembers, onExportWeekly, onExportAudit }) => {
    const [exportType, setExportType] = useState('weekly'); 
    const [selectedCrewIds, setSelectedCrewIds] = useState([]);

    if (!isOpen) return null;

    const handleToggleCrew = (id) => {
        setSelectedCrewIds(prev => 
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        if (selectedCrewIds.length === crewMembers.length) {
            setSelectedCrewIds([]);
        } else {
            setSelectedCrewIds(crewMembers.map(c => c.show_crew_id));
        }
    };

    const handleGenerate = () => {
        if (exportType === 'weekly') {
            onExportWeekly();
        } else {
            if (selectedCrewIds.length === 0) return;
            onExportAudit(selectedCrewIds);
        }
    };

    return (
        <Modal onClose={onClose} title="Export Timesheet Reports">
            <div className="flex gap-4 mb-6 border-b border-gray-700 pb-2 mt-2">
                <button 
                    onClick={() => setExportType('weekly')}
                    className={`pb-2 px-1 font-medium transition-colors ${exportType === 'weekly' ? 'border-b-2 border-amber-500 text-white' : 'text-gray-400 hover:text-gray-300'}`}
                >
                    Current Week
                </button>
                <button 
                    onClick={() => setExportType('audit')}
                    className={`pb-2 px-1 font-medium transition-colors ${exportType === 'audit' ? 'border-b-2 border-amber-500 text-white' : 'text-gray-400 hover:text-gray-300'}`}
                >
                    Crew Audit (All Time)
                </button>
            </div>

            <div className="min-h-[200px]">
                {exportType === 'weekly' ? (
                    <div className="space-y-2">
                        <p className="text-gray-300">
                            Download the standard timesheet for all crew members for the currently selected week.
                        </p>
                        <p className="text-sm text-gray-500 italic">
                            Perfect for standard weekly payroll processing.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-gray-300">
                            Generate a comprehensive historical report detailing day-by-day hours across the entire show.
                        </p>
                        <div className="mt-4">
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-gray-400">Select Crew Members</label>
                                <button onClick={handleSelectAll} className="text-sm text-blue-500 hover:text-blue-400">
                                    {selectedCrewIds.length === crewMembers.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                            
                            <div className="max-h-48 overflow-y-auto border border-gray-700 rounded-md bg-gray-900 p-2 space-y-1">
                                {crewMembers.length === 0 ? (
                                    <p className="text-gray-500 text-sm p-2 text-center">No crew members found.</p>
                                ) : (
                                    crewMembers.map(member => (
                                        <label key={member.show_crew_id} className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded cursor-pointer transition-colors">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedCrewIds.includes(member.show_crew_id)}
                                                onChange={() => handleToggleCrew(member.show_crew_id)}
                                                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-gray-900"
                                            />
                                            <span className="text-white text-sm">{member.first_name} {member.last_name}</span>
                                            <span className="text-gray-500 text-xs ml-auto">{member.position}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-700">
                <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-white font-medium transition-colors">
                    Cancel
                </button>
                <button 
                    onClick={handleGenerate} 
                    disabled={exportType === 'audit' && selectedCrewIds.length === 0}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed rounded-md text-black font-bold transition-colors"
                >
                    Generate PDF
                </button>
            </div>
        </Modal>
    );
};

export default ExportHoursModal;