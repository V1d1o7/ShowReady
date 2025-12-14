import React, { useState, useEffect, useCallback, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import { LayoutContext } from '../contexts/LayoutContext';
import { ChevronLeft, ChevronRight, Download, Mail, Settings, Info } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import PdfPreviewModal from '../components/PdfPreviewModal';
import EmailComposeModal from '../components/EmailComposeModal';
import PayPeriodSettingsModal from '../components/PayPeriodSettingsModal';
import CalculationInfoModal from '../components/CalculationInfoModal';
import { calculateWeeklyTotals } from '../utils/hoursCalculations';

const HoursTrackingView = () => {
    const { setShouldScroll } = useContext(LayoutContext);
    const { showId, showData, onSave } = useShow();
    const location = useLocation();

    // Enable scrolling for this view
    useEffect(() => {
        setShouldScroll(true);
        return () => setShouldScroll(false);
    }, [setShouldScroll]);

    const getInitialWeekStartDate = () => {
        const params = new URLSearchParams(location.search);
        const dateParam = params.get('week_start_date');
        if (dateParam) {
            return new Date(dateParam + 'T00:00:00');
        }
        const today = new Date();
        const dayOfWeek = today.getDay();
        const startDay = showData?.info?.pay_period_start_day || 0;
        
        // Calculate the correct start date based on the setting (0-6)
        const distance = (dayOfWeek - startDay + 7) % 7;
        const diff = today.getDate() - distance;
        return new Date(today.setDate(diff));
    };

    const [weekStartDate, setWeekStartDate] = useState(getInitialWeekStartDate);
    const [timesheet, setTimesheet] = useState(null);
    const [calculatedTimesheet, setCalculatedTimesheet] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

    const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    const fetchTimesheet = useCallback(async () => {
        if (!showId) return;
        setIsLoading(true);
        try {
            const data = await api.getWeeklyTimesheet(showId, formatDate(weekStartDate));
            setTimesheet(data);
        } catch (error) { console.error("Failed to fetch timesheet:", error); } 
        finally { setIsLoading(false); }
    }, [showId, weekStartDate]);

    useEffect(() => { fetchTimesheet(); }, [fetchTimesheet]);

    useEffect(() => {
        if (timesheet) {
            const updatedCrew = calculateWeeklyTotals(timesheet.crew_hours, timesheet.ot_daily_threshold, timesheet.ot_weekly_threshold);
            setCalculatedTimesheet({ ...timesheet, crew_hours: updatedCrew });
        }
    }, [timesheet]);

    const handleHoursChange = (showCrewId, date, hours) => {
        const updatedCrewHours = timesheet.crew_hours.map(member => 
            member.show_crew_id === showCrewId ? { ...member, hours_by_date: { ...member.hours_by_date, [date]: hours } } : member
        );
        setTimesheet(prev => ({ ...prev, crew_hours: updatedCrewHours }));
    };

    const handleSaveChanges = async () => {
        try {
            await api.updateWeeklyTimesheet(showId, timesheet);
            // Removed fetchTimesheet() here to prevent the table from reloading/blinking
            // The local state is already up to date.
        } catch (error) { console.error("Failed to save timesheet:", error); }
    };
    
    const handleSaveSettings = async (newSettings) => {
        // 1. Save settings to backend/context
        await onSave({ info: { ...showData.info, ...newSettings } });
        
        // 2. If start day changed, update the view immediately without reload
        if (newSettings.pay_period_start_day !== undefined) {
            const newStartDay = parseInt(newSettings.pay_period_start_day, 10);
            const current = new Date(weekStartDate);
            const currentDay = current.getDay();
            
            // Shift current view to align with new start day
            const distance = (currentDay - newStartDay + 7) % 7;
            const newDate = new Date(current);
            newDate.setDate(current.getDate() - distance);
            
            setWeekStartDate(newDate); // Triggers fetchTimesheet via useEffect with new dates
        } else {
            fetchTimesheet();
        }
    };

    const handleGeneratePdf = async () => {
        try {
            const blob = await api.getTimesheetPdf(showId, formatDate(weekStartDate));
            const url = URL.createObjectURL(blob);
            setPdfUrl(url);
            setIsPdfModalOpen(true);
        } catch (error) { console.error("Failed to generate PDF:", error.message); }
    };
    
    const changeWeek = (direction) => {
        const newDate = new Date(weekStartDate);
        newDate.setDate(newDate.getDate() + (direction * 7));
        setWeekStartDate(newDate);
    };

    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const dates = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(weekStartDate);
        date.setDate(date.getDate() + i);
        return date;
    });

    if (isLoading) return <p className="text-white text-center p-8">Loading timesheet...</p>;
    if (!timesheet) return <p className="text-white text-center p-8">No timesheet data available.</p>;

    const grandTotals = (calculatedTimesheet?.crew_hours || []).reduce((acc, member) => {
        acc.regular += member.calculatedStats?.regular || 0;
        acc.ot += member.calculatedStats?.ot || 0;
        acc.cost += member.calculatedStats?.cost || 0;
        return acc;
    }, { regular: 0, ot: 0, cost: 0 });

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <Toaster position="bottom-center" />
            <header className="flex items-center justify-between pb-4 border-b border-gray-700">
                <div className="flex items-center gap-4">
                    <button onClick={() => changeWeek(-1)} className="p-2 rounded-md hover:bg-gray-700"><ChevronLeft size={20} /></button>
                    <h2 className="text-xl font-bold text-white">{weekStartDate.toLocaleDateString()} - {weekEndDate.toLocaleDateString()}</h2>
                    <button onClick={() => changeWeek(1)} className="p-2 rounded-md hover:bg-gray-700"><ChevronRight size={20} /></button>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => setIsSettingsModalOpen(true)} className="p-2 rounded-md hover:bg-gray-700"><Settings size={20} /></button>
                    <div className="relative group">
                        <button onClick={() => setIsEmailModalOpen(true)} className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-500 flex items-center gap-2">
                            <Mail size={16} /> Email Report
                        </button>
                    </div>
                    <button onClick={handleGeneratePdf} className="px-4 py-2 text-sm font-medium rounded-md bg-gray-700 hover:bg-gray-600 flex items-center gap-2">
                        <Download size={16} /> Export PDF
                    </button>
                    <button onClick={handleSaveChanges} className="px-4 py-2 text-sm font-medium rounded-md bg-amber-500 text-black hover:bg-amber-400">Save Changes</button>
                    <button onClick={() => setIsInfoModalOpen(true)} className="p-2 rounded-md hover:bg-gray-700"><Info size={20} /></button>
                </div>
            </header>

            <main className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800">
                        <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Crew Member</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Rate</th>
                            {dates.map(date => (
                                <th key={date.toISOString()} className="px-3 py-2 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    {date.toLocaleDateString('en-US', { weekday: 'short' })}<br/>{date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}
                                </th>
                            ))}
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Regular</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">OT</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Cost</th>
                        </tr>
                    </thead>
                    <tbody className="bg-gray-900 divide-y divide-gray-700">
                        {(calculatedTimesheet?.crew_hours || []).map(member => (
                            <tr key={member.show_crew_id}>
                                <td className="px-3 py-2 whitespace-nowrap"><p className="font-medium text-white">{member.first_name} {member.last_name}</p><p className="text-sm text-gray-400">{member.position}</p></td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-400">{member.rate_type === 'daily' ? `$${member.daily_rate}/day` : `$${member.hourly_rate}/hr`}</td>
                                {dates.map(date => {
                                    const dateString = formatDate(date);
                                    return (
                                        <td key={dateString} className="px-3 py-2 whitespace-nowrap">
                                            <input type="number" value={member.hours_by_date[dateString] || ''} onChange={(e) => handleHoursChange(member.show_crew_id, dateString, e.target.value)} className="w-16 bg-gray-800 border border-gray-700 rounded-md p-1 text-center" placeholder="0" />
                                        </td>
                                    );
                                })}
                                <td className="px-3 py-2 whitespace-nowrap text-center text-sm text-gray-300">{member.calculatedStats?.regular.toFixed(2) || '0.00'}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-center text-sm text-gray-300">{member.calculatedStats?.ot.toFixed(2) || '0.00'}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-center text-sm text-gray-300">${member.calculatedStats?.cost.toFixed(2) || '0.00'}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-800 border-t-2 border-gray-600">
                        <tr>
                            <td colSpan={2} className="px-3 py-2 text-right font-bold text-white uppercase">Grand Totals</td>
                            <td colSpan={7}></td>
                            <td className="px-3 py-2 text-center font-bold text-white">{grandTotals.regular.toFixed(2)}</td>
                            <td className="px-3 py-2 text-center font-bold text-white">{grandTotals.ot.toFixed(2)}</td>
                            <td className="px-3 py-2 text-center font-bold text-white">${grandTotals.cost.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </main>

            <PdfPreviewModal isOpen={isPdfModalOpen} onClose={() => setIsPdfModalOpen(false)} url={pdfUrl} />
            
            <EmailComposeModal 
                isOpen={isEmailModalOpen} 
                onClose={() => setIsEmailModalOpen(false)} 
                recipients={[]} 
                category="HOURS"
                showId={showId}
                weekStartDate={formatDate(weekStartDate)}
                grandTotals={grandTotals}
            />

            <PayPeriodSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} settings={showData?.info || {}} onSave={handleSaveSettings} />
            <CalculationInfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} dailyThreshold={timesheet?.ot_daily_threshold || 10} />
        </div>
    );
};

export default HoursTrackingView;