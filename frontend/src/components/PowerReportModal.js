import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import { Zap, BatteryCharging, Activity } from 'lucide-react';

const PowerReportModal = ({ isOpen, onClose, data }) => {
    const [voltage, setVoltage] = useState(120); // Default to 120V

    // --- Constants ---
    const POWER_FACTOR = 0.7; // Standard estimation for IT/AV loads
    const UPS_CAPACITY_VA = 1500; // Standard 2U UPS size

    // --- Calculations ---
    const stats = useMemo(() => {
        // FIXED: Ensure we return ALL properties needed by the render, even if data is empty
        if (!data || !data.length) {
            return { 
                totalWatts: 0, 
                totalAmps: 0, 
                totalVA: 0, 
                suggestedUPS: 0, 
                racks: [] 
            };
        }

        let totalShowWatts = 0;
        const rackStats = [];

        data.forEach(rack => {
            let rackWatts = 0;
            if (rack.equipment) {
                rack.equipment.forEach(item => {
                    if (item.equipment_templates && item.equipment_templates.power_consumption_watts) {
                        rackWatts += item.equipment_templates.power_consumption_watts;
                    }
                });
            }
            
            const rackAmps = rackWatts / voltage;
            // VA ≈ Watts / PowerFactor
            const rackVA = rackWatts / POWER_FACTOR;
            
            totalShowWatts += rackWatts;
            
            rackStats.push({
                id: rack.id,
                name: rack.rack_name,
                watts: rackWatts,
                amps: rackAmps,
                va: rackVA
            });
        });

        const totalAmps = totalShowWatts / voltage;
        const totalVA = totalShowWatts / POWER_FACTOR;
        const suggestedUPS = Math.ceil(totalVA / UPS_CAPACITY_VA);

        return {
            totalWatts: totalShowWatts,
            totalAmps,
            totalVA,
            suggestedUPS,
            racks: rackStats
        };
    }, [data, voltage]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Power Calculation Report">
            <div className="space-y-6">
                
                {/* Voltage Toggle */}
                <div className="flex justify-center mb-6">
                    <div className="bg-gray-800 p-1 rounded-lg flex space-x-1 border border-gray-700">
                        <button
                            onClick={() => setVoltage(120)}
                            className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                                voltage === 120 ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            120V
                        </button>
                        <button
                            onClick={() => setVoltage(220)}
                            className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                                voltage === 220 ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            220V
                        </button>
                    </div>
                </div>

                {/* Top Level Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex flex-col items-center justify-center text-center">
                        <Zap className="text-yellow-400 mb-2" size={32} />
                        <span className="text-gray-400 text-sm">Total Power</span>
                        <div className="text-3xl font-bold text-white mt-1">
                            {stats.totalWatts.toLocaleString()} <span className="text-sm font-normal text-gray-500">W</span>
                        </div>
                    </div>

                    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex flex-col items-center justify-center text-center">
                        <Activity className="text-blue-400 mb-2" size={32} />
                        <span className="text-gray-400 text-sm">Estimated Current (@{voltage}V)</span>
                        <div className="text-3xl font-bold text-white mt-1">
                            {stats.totalAmps.toFixed(1)} <span className="text-sm font-normal text-gray-500">Amps</span>
                        </div>
                    </div>

                    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex flex-col items-center justify-center text-center">
                        <BatteryCharging className="text-green-400 mb-2" size={32} />
                        <span className="text-gray-400 text-sm">Suggested UPS (1500VA)</span>
                        <div className="text-3xl font-bold text-white mt-1">
                            {stats.suggestedUPS} <span className="text-sm font-normal text-gray-500">Units</span>
                        </div>
                        <span className="text-xs text-gray-500 mt-2">Est. Load: {Math.ceil(stats.totalVA).toLocaleString()} VA</span>
                    </div>
                </div>

                {/* Per Rack Breakdown */}
                <div className="mt-6">
                    <h4 className="text-white font-bold mb-3">Breakdown by Rack</h4>
                    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                        <table className="w-full text-left text-sm text-gray-300">
                            <thead className="bg-gray-900 text-gray-400 uppercase font-mono text-xs">
                                <tr>
                                    <th className="px-4 py-3">Rack Name</th>
                                    <th className="px-4 py-3 text-right">Watts</th>
                                    <th className="px-4 py-3 text-right">Amps</th>
                                    <th className="px-4 py-3 text-right">VA Est.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {stats.racks.map(rack => (
                                    <tr key={rack.id} className="hover:bg-gray-700/50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-white">{rack.name}</td>
                                        <td className="px-4 py-3 text-right">{rack.watts} W</td>
                                        <td className="px-4 py-3 text-right">{rack.amps.toFixed(1)} A</td>
                                        <td className="px-4 py-3 text-right">{Math.ceil(rack.va)} VA</td>
                                    </tr>
                                ))}
                                {stats.racks.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-4 py-4 text-center text-gray-500 italic">
                                            No racks found for this show.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800 rounded-lg">
                    <p className="text-xs text-blue-200">
                        <strong>Note:</strong> Calculations assume a Power Factor of 0.7 for converting Watts to VA. 
                        UPS suggestions are estimates based on total load and do not account for runtime requirements or redundancy (N+1).
                    </p>
                </div>

                <div className="flex justify-end pt-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium"
                    >
                        Close Report
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default PowerReportModal;