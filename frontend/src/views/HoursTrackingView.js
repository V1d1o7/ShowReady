import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import { ChevronLeft, ChevronRight, Mail, Download, Save, Settings } from 'lucide-react';
import EmailTimesheetModal from '../components/EmailTimesheetModal';
import { useToast } from '../contexts/ToastContext';
import PdfPreviewModal from '../components/PdfPreviewModal';
import PayPeriodSettingsModal from '../components/PayPeriodSettingsModal';
import useHotkeys from '../hooks/useHotkeys';

// Helper to get the start of the pay period using UTC to avoid timezone issues.
const getWeekStartDate = (date, startDay) => {
    const d = new Date(date.valueOf()); // Clone date to avoid mutation
    d.setUTCHours(12, 0, 0, 0);
    const day = d.getUTCDay();
    const diff = (day - startDay + 7) % 7;
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().split('T')[0];
};

const HoursTrackingView = () => {
    const { showId, showData, onSave } = useShow();
    const { addToast } = useToast();
    const [timesheetData, setTimesheetData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [weekStartDate, setWeekStartDate] = useState(null);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    const handleSaveSettings = async (newSettings) => {
        if (!showData || !onSave) {
            return;
        }

        const updatedInfo = { ...showData.info, ...newSettings };
        const updatedShowData = { ...showData, info: updatedInfo };

        try {
            await onSave(updatedShowData);
            addToast('Settings saved successfully!', 'success');
        } catch (error) {
            console.error("Failed to save settings:", error);
            addToast('Failed to save settings.', 'error');
        }
    };

    const fetchTimesheet = useCallback(async () => {
        if (!showId || !weekStartDate) return;
        setIsLoading(true);
        try {
            const data = await api.getWeeklyTimesheet(showId, weekStartDate);
            setTimesheetData(data);
        } catch (error) {
            console.error("Failed to fetch timesheet data:", error);
            setTimesheetData(null);
        } finally {
            setIsLoading(false);
        }
    }, [showId, weekStartDate]);

    // Effect to initialize or update the week start date from context
    useEffect(() => {
        if (showData) {
            const startDay = showData.info?.pay_period_start_day ?? 0;
            // Only update if weekStartDate is null (initial load) or the start day changes
            if (weekStartDate === null) {
                setWeekStartDate(getWeekStartDate(new Date(), startDay));
            } else {
                // If settings change, recalculate based on the current view
                const parts = weekStartDate.split('-').map(Number);
                const currentViewDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
                setWeekStartDate(getWeekStartDate(currentViewDate, startDay));
            }
        }
    }, [showData]);

    // Effect to fetch data when the week start date changes
    useEffect(() => {
        if (weekStartDate) {
            fetchTimesheet();
        }
    }, [weekStartDate, fetchTimesheet]);

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
            await api.updateWeeklyTimesheet(showId, timesheetData);
            addToast("Timesheet saved successfully!", "success");
            fetchTimesheet(); // Refresh data after save
        } catch (error) {
            console.error("Failed to save timesheet:", error);
            addToast("Failed to save timesheet. Please try again.", "error");
        }
    };

    const handleDownloadPdf = async () => {
        try {
            const blob = await api.getTimesheetPdf(showId, weekStartDate);
            const url = URL.createObjectURL(blob);
            setPdfPreviewUrl(url);
        } catch (error) {
            console.error("Failed to generate PDF:", error.message);
        }
    };

    const changeWeek = (direction) => {
        // Use a regex to correctly parse YYYY-MM-DD and create a UTC date
        const parts = weekStartDate.split('-').map(Number);
        const currentDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        currentDate.setUTCDate(currentDate.getUTCDate() + (direction * 7));
        setWeekStartDate(getWeekStartDate(currentDate, timesheetData?.pay_period_start_day || 0));
    };

    const dateObjects = timesheetData ? Array.from({ length: 7 }, (_, i) => {
        const parts = timesheetData.week_start_date.split('-').map(Number);
        const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        d.setUTCDate(d.getUTCDate() + i);
        return d;
    }) : [];

    const displayDates = dateObjects.map(d => {
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        const year = String(d.getUTCFullYear()).slice(-2);
        return `${month}/${day}/${year}`;
    });

    const dataDates = dateObjects.map(d => d.toISOString().split('T')[0]);

    useHotkeys({
        's': () => setIsSettingsModalOpen(true),
        'e': handleDownloadPdf,
        'm': () => setIsEmailModalOpen(true),
    });

    const calculateTotals = (member) => {
        const weeklyTotal = Object.values(member.hours_by_date).reduce((sum, h) => sum + (h || 0), 0);
        let dailyRegularHours = 0;
        let dailyOtHours = 0;
        Object.values(member.hours_by_date).forEach(h => {
            const hours = h || 0;
            if (hours > timesheetData.ot_daily_threshold) {
                dailyOtHours += hours - timesheetData.ot_daily_threshold;
                dailyRegularHours += timesheetData.ot_daily_threshold;
            } else {
                dailyRegularHours += hours;
            }
        });
        const weeklyOtHours = Math.max(0, dailyRegularHours - timesheetData.ot_weekly_threshold);
        const totalOt = dailyOtHours + weeklyOtHours;
        const regularHours = weeklyTotal - totalOt;
        const cost = member.rate_type === 'daily'
            ? (weeklyTotal > 0 ? member.daily_rate : 0)
            : (regularHours * member.hourly_rate) + (totalOt * member.hourly_rate * 1.5);
        return { regularHours, totalOt, cost };
    };

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
                                        {displayDates.map(d => <th key={d} className="px-3 py-3.5 text-center text-sm font-semibold text-white">{d}</th>)}
                                        <th className="px-3 py-3.5 text-center text-sm font-semibold text-white">Regular</th>
                                        <th className="px-3 py-3.5 text-center text-sm font-semibold text-white">OT</th>
                                        <th className="px-3 py-3.5 text-center text-sm font-semibold text-white">Total Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {timesheetData.crew_hours.map(member => {
                                        const { regularHours, totalOt, cost } = calculateTotals(member);
                                        return (
                                            <tr key={member.show_crew_id}>
                                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">{`${member.first_name} ${member.last_name}`}</td>
                                                {dataDates.map((date, index) => (
                                                    <td key={date} className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                                                        <input
                                                            type="number"
                                                            value={member.hours_by_date[date] || ''}
                                                            onChange={(e) => handleHoursChange(member.show_crew_id, date, e.target.value)}
                                                            className="w-20 bg-gray-800 border border-gray-700 rounded-md p-1 text-center"
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                ))}
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-gray-300">{regularHours.toFixed(2)}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-gray-300">{totalOt.toFixed(2)}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-gray-300">${cost.toFixed(2)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-gray-500">
                                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-bold text-white sm:pl-6">Totals</td>
                                        {dataDates.map(date => (
                                            <td key={`${date}-total`} className="whitespace-nowrap px-3 py-4"></td>
                                        ))}
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center font-bold text-white">
                                            {timesheetData.crew_hours.reduce((acc, member) => acc + calculateTotals(member).regularHours, 0).toFixed(2)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center font-bold text-white">
                                            {timesheetData.crew_hours.reduce((acc, member) => acc + calculateTotals(member).totalOt, 0).toFixed(2)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center font-bold text-white">
                                            ${timesheetData.crew_hours.reduce((acc, member) => acc + calculateTotals(member).cost, 0).toFixed(2)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <div className="mt-6 flex justify-end space-x-4">
                            <button onClick={() => setIsSettingsModalOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-gray-600 text-white hover:bg-gray-500">
                                <Settings size={16} /> Settings
                            </button>
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
                    isOpen={isEmailModalOpen}
                    onClose={() => setIsEmailModalOpen(false)}
                    showId={showId}
                    weekStartDate={weekStartDate}
                />
            )}
            {isSettingsModalOpen && (
                <PayPeriodSettingsModal
                    isOpen={isSettingsModalOpen}
                    onClose={() => setIsSettingsModalOpen(false)}
                    settings={{
                        ot_daily_threshold: timesheetData?.ot_daily_threshold ?? 10,
                        ot_weekly_threshold: timesheetData?.ot_weekly_threshold ?? 40,
                        pay_period_start_day: timesheetData?.pay_period_start_day ?? 0,
                    }}
                    onSave={handleSaveSettings}
                />
            )}
            <PdfPreviewModal url={pdfPreviewUrl} onClose={() => setPdfPreviewUrl(null)} />
        </div>
    );
};

export default HoursTrackingView;
