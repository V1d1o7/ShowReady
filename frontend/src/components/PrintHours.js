import React from 'react';

const PrintHours = ({ crew, dates, hoursByDate, showData }) => {
    return (
        <div className="bg-white text-black p-4">
            <h1 className="text-2xl font-bold mb-4">{showData.info.name} - Weekly Timesheet</h1>
            <table className="min-w-full divide-y divide-gray-300">
                <thead>
                    <tr>
                        <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold">Crew Member</th>
                        {dates.map(d => <th key={d} className="px-3 py-3.5 text-left text-sm font-semibold">{d}</th>)}
                        <th className="px-3 py-3.5 text-left text-sm font-semibold">Regular</th>
                        <th className="px-3 py-3.5 text-left text-sm font-semibold">OT</th>
                        <th className="px-3 py-3.5 text-left text-sm font-semibold">Cost</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {crew.map(c => {
                        const crewHours = hoursByDate[c.id]?.hours || {};
                        const weeklyTotal = Object.values(crewHours).reduce((a, b) => a + b, 0);
                        const otHours = weeklyTotal > showData.info.ot_weekly_threshold ? weeklyTotal - showData.info.ot_weekly_threshold : 0;
                        const regularHours = weeklyTotal - otHours;
                        const cost = c.rate_type === 'daily' ? (weeklyTotal > 0 ? c.daily_rate : 0) : (regularHours * c.hourly_rate) + (otHours * c.hourly_rate * 1.5);
                        return (
                            <tr key={c.id}>
                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium">{`${c.roster.first_name} ${c.roster.last_name}`}</td>
                                {dates.map(d => (
                                    <td key={d} className="whitespace-nowrap px-3 py-4 text-sm">{crewHours[d]}</td>
                                ))}
                                <td className="whitespace-nowrap px-3 py-4 text-sm">{regularHours}</td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm">{otHours}</td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm">${cost.toFixed(2)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default PrintHours;