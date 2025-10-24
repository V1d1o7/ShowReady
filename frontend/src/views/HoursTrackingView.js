import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import { ChevronLeft, ChevronRight, Mail, Download, Save } from 'lucide-react';
import EmailTimesheetModal from '../components/EmailTimesheetModal';
import PdfPreviewModal from '../components/PdfPreviewModal';

// Helper to get the start of the week (Sunday)
const getWeekStartDate = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
};

const HoursTrackingView = () => {
    const { showData } = useShow();
    const [timesheetData, setTimesheetData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [weekStartDate, setWeekStartDate] = useState(getWeekStartDate(new Date()));
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);

    const fetchData = useCallback(async () => {
        if (!showData) return;
        setIsLoading(true);
        try {
            const data = await api.getWeeklyTimesheet(showData.info.id, weekStartDate);
            setTimesheetData(data);
        } catch (error) {
            console.error("Failed to fetch timesheet data:", error);
            setTimesheetData(null); // Clear data on error
        } finally {
            setIsLoading(false);
        }
    }, [showData, weekStartDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleHoursChange = (crewMemberId, date, value) => {
        setTimesheetData(prev => {
            const newCrewHours = prev.crew_hours.map(member => {
                if (member.show_crew_id === crewMemberId) {
                    const newHoursByDate = { ...member.hours_by_date, [date]: parseFloat(value) || 0 };
                    return { ...member, hours_by_date: newHoursByDate };
                }
                return member;
            });
            return { ...prev, crew_hours: newCrewHours };
        });
    };

    const handleSaveChanges = async () => {
        if (!timesheetData) return;
        try {
            await api.updateWeeklyTimesheet(showData.info.id, timesheetData);
            // Optionally show a success toast
            fetchData(); // Refresh data after save
        } catch (error) {
            console.error("Failed to save timesheet:", error);
            // Optionally show an error toast
        }
    };

    const handleDownloadPdf = async () => {
        try {
            const blob = await api.getTimesheetPdf(showData.info.id, weekStartDate);
            const url = URL.createObjectURL(blob);
            setPdfPreviewUrl(url);
        } catch (error) {
            console.error("Failed to generate PDF:", error.message);
        }
    };

    const changeWeek = (direction) => {
        const currentDate = new Date(weekStartDate);
        currentDate.setDate(currentDate.getDate() + (direction * 7));
        setWeekStartDate(getWeekStartDate(currentDate));
    };

    const dates = timesheetData ? Array.from({ length: 7 }, (_, i) => {
        const d = new Date(timesheetData.week_start_date);
        d.setDate(d.getDate() + i);
        return d.toISOString().split('T')[0];
    }) : [];

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <header className="flex flex-col sm:flex-row items-center justify-between pb-4 border-b border-gray-700 gap-4">
                <h2 className="text-2xl font-bold text-white">Weekly Timesheet</h2>
                <div className="flex items-center gap-4">
                    <button onClick={() => changeWeek(-1)} className="p-2 rounded-md bg-gray-700 hover:bg-gray-600"><ChevronLeft size={20} /></button>
                    <span className="font-semibold text-lg text-white">{weekStartDate}</span>
                    <button onClick={() => changeWeek(1)} className="p-2 rounded-md bg-gray-700 hover:bg-gray-600"><ChevronRight size={20} /></button>
                </div>
            </header>
            <main className="mt-6">
                {isLoading ? <p className="text-gray-400">Loading data...</p> : !timesheetData ? <p className="text-gray-400">No data available for this week.</p> : (
                    <div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead>
                                    <tr>
                                        <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white">Crew Member</th>
                                        {dates.map(d => <th key={d} className="px-3 py-3.5 text-center text-sm font-semibold text-white">{d}</th>)}
                                        <th className="px-3 py-3.5 text-center text-sm font-semibold text-white">Regular</th>
                                        <th className="px-3 py-3.5 text-center text-sm font-semibold text-white">OT</th>
                                        <th className="px-3 py-3.5 text-center text-sm font-semibold text-white">Total Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {timesheetData.crew_hours.map(member => {
                                        const weeklyTotal = Object.values(member.hours_by_date).reduce((acc, h) => acc + h, 0);
                                        const otHours = weeklyTotal > timesheetData.ot_weekly_threshold ? weeklyTotal - timesheetData.ot_weekly_threshold : 0;
                                        const regularHours = weeklyTotal - otHours;
                                        const cost = member.rate_type === 'daily' 
                                            ? (weeklyTotal > 0 ? member.daily_rate : 0) 
                                            : (regularHours * member.hourly_rate) + (otHours * member.hourly_rate * 1.5);
                                        
                                        return (
                                            <tr key={member.show_crew_id}>
                                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">{`${member.first_name} ${member.last_name}`}</td>
                                                {dates.map(d => (
                                                    <td key={d} className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                                                        <input
                                                            type="number"
                                                            value={member.hours_by_date[d] || ''}
                                                            onChange={(e) => handleHoursChange(member.show_crew_id, d, e.target.value)}
                                                            className="w-20 bg-gray-800 border border-gray-700 rounded-md p-1 text-center"
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                ))}
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-gray-300">{regularHours.toFixed(2)}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-gray-300">{otHours.toFixed(2)}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-gray-300">${cost.toFixed(2)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-6 flex justify-end space-x-4">
                            <button onClick={() => setIsEmailModalOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-gray-600 text-white hover:bg-gray-500">
                                <Mail size={16} /> Email
                            </button>
                            <button onClick={handleDownloadPdf} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-gray-600 text-white hover:bg-gray-500">
                                <Download size={16} /> Download PDF
                            </button>
                            <button onClick={handleSaveChanges} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-amber-500 text-black hover:bg-amber-400">
                                <Save size={16} /> Save Changes
                            </button>
                        </div>
                    </div>
                )}
            </main>
            {isEmailModalOpen && (
                <EmailTimesheetModal
                    show={isEmailModalOpen}
                    onClose={() => setIsEmailModalOpen(false)}
                    showData={showData}
                    weekStartDate={weekStartDate}
                />
            )}
            <PdfPreviewModal url={pdfPreviewUrl} onClose={() => setPdfPreviewUrl(null)} />
        </div>
    );
};

export default HoursTrackingView;
