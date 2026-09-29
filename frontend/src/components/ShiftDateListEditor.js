import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

// Controlled list editor for [{ shift_date, call_time, notes }] rows.
// Used both when composing an availability call and when assigning someone
// from the availability pool to specific dates.
const ShiftDateListEditor = ({ shifts, onChange, label = 'Shifts' }) => {
    const updateShift = (index, field, value) => {
        onChange(shifts.map((s, i) => i === index ? { ...s, [field]: value } : s));
    };

    const addShift = () => onChange([...shifts, { shift_date: '', call_time: '', end_time: '', notes: '' }]);
    const removeShift = (index) => onChange(shifts.filter((_, i) => i !== index));

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-400">{label}</label>
                <button type="button" onClick={addShift} className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300">
                    <Plus size={14} /> Add Date
                </button>
            </div>
            <div className="space-y-2">
                {shifts.map((shift, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <input
                            type="date"
                            value={shift.shift_date}
                            onChange={(e) => updateShift(index, 'shift_date', e.target.value)}
                            className="flex-1 bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                        <input
                            type="time"
                            value={shift.call_time || ''}
                            onChange={(e) => updateShift(index, 'call_time', e.target.value)}
                            className="w-28 bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                            title="Call time"
                        />
                        <span className="text-gray-500 text-sm">–</span>
                        <input
                            type="time"
                            value={shift.end_time || ''}
                            onChange={(e) => updateShift(index, 'end_time', e.target.value)}
                            className="w-28 bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                            title="End time"
                        />
                        <input
                            type="text"
                            value={shift.notes || ''}
                            onChange={(e) => updateShift(index, 'notes', e.target.value)}
                            className="flex-1 bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                            placeholder="Notes (optional)"
                        />
                        {shifts.length > 1 && (
                            <button type="button" onClick={() => removeShift(index)} className="text-gray-500 hover:text-red-500 transition-colors">
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ShiftDateListEditor;
