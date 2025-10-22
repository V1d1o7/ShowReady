import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api/api';
import { useShow } from '../contexts/ShowContext';
import PdfPreviewModal from '../components/PdfPreviewModal';

const HoursTrackingView = () => {
    const { showData } = useShow();
    const [hours, setHours] = useState([]);
    const [crew, setCrew] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editedHours, setEditedHours] = useState({});
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);

    const fetchData = useCallback(async () => {
        if (!showData) return;
        setIsLoading(true);
        try {
            const [hoursData, crewData] = await Promise.all([
                api.getDailyHours(showData.info.id),
                api.getShowCrew(showData.info.id)
            ]);
            setHours(hoursData);
            setCrew(crewData);
        } catch (error) {
            console.error("Failed to fetch hours tracking data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [showData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleHoursChange = (crewId, date, value) => {
        setEditedHours(prev => ({
            ...prev,
            [`${crewId}__${date}`]: value
        }));
    };

    const handleSaveChanges = async () => {
        const entries = Object.entries(editedHours).map(([key, hours]) => {
            const [show_crew_id, date] = key.split('__');
            return { show_crew_id, date, hours: parseFloat(hours) || 0 };
        });
        await api.bulkUpdateDailyHours(entries);
        fetchData();
        setEditedHours({});
    };

    const dates = useMemo(() => {
        const week = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date();
            day.setDate(day.getDate() - day.getDay() + i);
            week.push(day.toISOString().split('T')[0]);
        }
        return week;
    }, []);

    const handleGeneratePdf = async () => {
        const body = {
            show_name: showData.info.name,
            dates,
            crew,
            hoursByDate,
        };
        try {
            const blob = await api.generateHoursPdf(body);
            const url = URL.createObjectURL(blob);
            setPdfPreviewUrl(url);
        } catch (error) {
            console.error("Failed to generate PDF:", error.message);
        }
    };

    const hoursByDate = useMemo(() => {
        const data = {};
        crew.forEach(c => {
            data[c.id] = { hours: {} };
            dates.forEach(d => {
                const entry = hours.find(h => h.show_crew_id === c.id && h.date === d);
                data[c.id].hours[d] = entry ? entry.hours : 0;
            });
        });
        return data;
    }, [hours, crew, dates]);

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <header className="flex items-center justify-between pb-4 border-b border-gray-700">
                <h2 className="text-2xl font-bold text-white">Weekly Timesheet</h2>
            </header>
            <main className="mt-6">
                {isLoading ? <p className="text-gray-400">Loading data...</p> : (
                    <div>
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead>
                                <tr>
                                    <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white">Crew Member</th>
                                    {dates.map(d => <th key={d} className="px-3 py-3.5 text-left text-sm font-semibold text-white">{d}</th>)}
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-white">Regular</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-white">OT</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-white">Cost</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {crew.map(c => {
                                    const crewHours = hoursByDate[c.id]?.hours || {};
                                    const weeklyTotal = Object.values(crewHours).reduce((a, b) => a + b, 0);
                                    const otHours = weeklyTotal > showData.info.ot_weekly_threshold ? weeklyTotal - showData.info.ot_weekly_threshold : 0;
                                    const regularHours = weeklyTotal - otHours;
                                    const cost = c.rate_type === 'daily' ? (weeklyTotal > 0 ? c.daily_rate : 0) : (regularHours * c.hourly_rate) + (otHours * c.hourly_rate * 1.5);
                                    return (
                                        <tr key={c.id}>
                                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">{`${c.roster.first_name} ${c.roster.last_name}`}</td>
                                            {dates.map(d => (
                                                <td key={d} className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                                                    <input
                                                        type="number"
                                                        value={editedHours[`${c.id}__${d}`] ?? crewHours[d]}
                                                        onChange={(e) => handleHoursChange(c.id, d, e.target.value)}
                                                        className="w-16 bg-gray-800 border border-gray-700 rounded-md p-1 text-center"
                                                    />
                                                </td>
                                            ))}
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{regularHours}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{otHours}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">${cost.toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <div className="mt-4 flex justify-end space-x-4">
                            <button onClick={handleGeneratePdf} className="px-4 py-2 text-sm font-medium rounded-md bg-gray-600 text-white hover:bg-gray-500">Print</button>
                            <button onClick={handleSaveChanges} className="px-4 py-2 text-sm font-medium rounded-md bg-amber-500 text-black hover:bg-amber-400">Save Changes</button>
                        </div>
                    </div>
                )}
            </main>
            <PdfPreviewModal url={pdfPreviewUrl} onClose={() => setPdfPreviewUrl(null)} />
        </div>
    );
};

export default HoursTrackingView;
