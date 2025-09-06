import React, { useState, useEffect } from 'react';
import { api } from '../../api/api';
import Card from '../../components/Card';
import toast, { Toaster } from 'react-hot-toast';
import { Users, FileText, BarChart, HardDrive } from 'lucide-react';

const MetricCard = ({ title, value, icon }) => (
    <Card>
        <div className="flex items-center">
            <div className="p-3 bg-gray-700 rounded-lg mr-4">
                {icon}
            </div>
            <div>
                <p className="text-sm font-medium text-gray-400">{title}</p>
                <p className="text-2xl font-bold text-white">{value}</p>
            </div>
        </div>
    </Card>
);

const MetricsView = () => {
    const [metrics, setMetrics] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        api.getMetrics()
            .then(setMetrics)
            .catch(err => {
                toast.error("Failed to fetch metrics.");
                console.error(err);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, []);

    if (isLoading) {
        return <div className="p-8 text-center text-gray-400">Loading Metrics...</div>;
    }

    return (
        <>
            <Toaster position="bottom-center" />
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6">Application Metrics</h1>
            {metrics && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <MetricCard title="Total Users" value={metrics.userCount} icon={<Users className="text-amber-500" />} />
                    <MetricCard title="New Sign Ups (30 days)" value={metrics.signUps} icon={<Users className="text-green-500" />} />
                    <MetricCard title="Total Shows" value={metrics.showsCount} icon={<FileText className="text-blue-500" />} />
                    <MetricCard title="Total Racks" value={metrics.racksCount} icon={<BarChart className="text-indigo-500" />} />
                    <MetricCard title="Most Used Library Item" value={metrics.mostUsedEquipment} icon={<HardDrive className="text-purple-500" />} />
                    <MetricCard title="Custom Items Created" value={metrics.customItemsCreated} icon={<HardDrive className="text-pink-500" />} />
                </div>
            )}
        </>
    );
};

export default MetricsView;
