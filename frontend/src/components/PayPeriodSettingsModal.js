import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from './Modal';
import InputField from './InputField';
import SelectField from './SelectField';

const DEFAULT_BREAK_RULES = [{ threshold_hours: 5, break_minutes: 60 }];

const PayPeriodSettingsModal = ({ isOpen, onClose, settings, onSave }) => {
    const [currentSettings, setCurrentSettings] = useState(settings);
    const [budgetText, setBudgetText] = useState('');
    const [breakRules, setBreakRules] = useState(settings.break_rules || DEFAULT_BREAK_RULES);

    const formatCurrency = (val) => {
        if (val === undefined || val === null || val === '') return '';
        const clean = String(val).replace(/[^0-9.]/g, '');
        const num = parseFloat(clean);
        if (isNaN(num)) return '';
        return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    };

    useEffect(() => {
        setCurrentSettings(settings);
        setBreakRules(settings.break_rules && settings.break_rules.length > 0 ? settings.break_rules : DEFAULT_BREAK_RULES);
        if (settings.labor_budget !== undefined && settings.labor_budget !== null) {
            setBudgetText(formatCurrency(settings.labor_budget));
        } else {
            setBudgetText('');
        }
    }, [settings]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setCurrentSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleAutofillToggle = (e) => {
        setCurrentSettings(prev => ({ ...prev, schedule_autofill_enabled: e.target.checked }));
    };

    const handleBreakRuleChange = (index, field, value) => {
        setBreakRules(prev => prev.map((rule, i) => i === index ? { ...rule, [field]: value } : rule));
    };

    const handleAddBreakRule = () => {
        setBreakRules(prev => [...prev, { threshold_hours: '', break_minutes: '' }]);
    };

    const handleRemoveBreakRule = (index) => {
        setBreakRules(prev => prev.filter((_, i) => i !== index));
    };

    const handleBudgetChange = (e) => {
        const val = e.target.value;
        setBudgetText(val);
        const clean = val.replace(/[^0-9.]/g, '');
        setCurrentSettings(prev => ({ ...prev, labor_budget: clean === '' ? null : parseFloat(clean) }));
    };

    const handleBudgetFocus = () => {
        if (currentSettings.labor_budget !== undefined && currentSettings.labor_budget !== null) {
            setBudgetText(String(currentSettings.labor_budget));
        }
    };

    const handleBudgetBlur = () => {
        setBudgetText(formatCurrency(currentSettings.labor_budget));
    };

    const handleSave = () => {
        const cleanBreakRules = breakRules
            .filter(r => r.threshold_hours !== '' && r.break_minutes !== '')
            .map(r => ({ threshold_hours: parseFloat(r.threshold_hours), break_minutes: parseFloat(r.break_minutes) }));
        onSave({ ...currentSettings, break_rules: cleanBreakRules });
        onClose();
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        handleSave();
    };

    const dayOptions = [
        { value: 0, label: 'Sunday' },
        { value: 1, label: 'Monday' },
        { value: 2, label: 'Tuesday' },
        { value: 3, label: 'Wednesday' },
        { value: 4, label: 'Thursday' },
        { value: 5, label: 'Friday' },
        { value: 6, label: 'Saturday' },
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Pay Period & OT Settings">
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField
                    label="OT Daily Threshold (hours)"
                    name="ot_daily_threshold"
                    type="number"
                    value={currentSettings.ot_daily_threshold || ''}
                    onChange={handleChange}
                />
                <InputField
                    label="OT Weekly Threshold (hours)"
                    name="ot_weekly_threshold"
                    type="number"
                    value={currentSettings.ot_weekly_threshold || ''}
                    onChange={handleChange}
                />
                <SelectField
                    label="Pay Period Start Day"
                    name="pay_period_start_day"
                    value={currentSettings.pay_period_start_day || 0}
                    onChange={handleChange}
                    options={dayOptions}
                />
                <div className="pt-2 border-t border-gray-700">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-300 cursor-pointer">
                        <input
                            type="checkbox"
                            className="accent-amber-500"
                            checked={currentSettings.schedule_autofill_enabled !== false}
                            onChange={handleAutofillToggle}
                        />
                        Auto-fill hours from the Schedule tab
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                        When a crew member has a scheduled shift with both a call time and an end time, their hours are pre-filled below (minus any break deducted per the rules below). Blank cells stay blank until an end time is set, and anything you type or save always takes priority over the schedule.
                    </p>
                </div>

                <div className={currentSettings.schedule_autofill_enabled === false ? 'opacity-50 pointer-events-none' : ''}>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Unpaid Break Rules</label>
                    <div className="space-y-2">
                        {breakRules.map((rule, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 whitespace-nowrap">After</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={rule.threshold_hours}
                                    onChange={(e) => handleBreakRuleChange(index, 'threshold_hours', e.target.value)}
                                    className="w-20 p-2 bg-gray-800 border border-gray-700 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                                <span className="text-xs text-gray-400 whitespace-nowrap">hrs worked, deduct</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="5"
                                    value={rule.break_minutes}
                                    onChange={(e) => handleBreakRuleChange(index, 'break_minutes', e.target.value)}
                                    className="w-20 p-2 bg-gray-800 border border-gray-700 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                                <span className="text-xs text-gray-400 whitespace-nowrap">min</span>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveBreakRule(index)}
                                    className="ml-auto p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-gray-800"
                                    aria-label="Remove break rule"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={handleAddBreakRule}
                        className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300"
                    >
                        <Plus size={14} /> Add Rule
                    </button>
                    <p className="text-xs text-gray-500 mt-1">The highest threshold a shift's duration reaches applies — breaks aren't cumulative across rules. Remove all rules for no automatic breaks.</p>
                </div>

                <InputField
                    label="Labor Budget ($)"
                    name="labor_budget"
                    type="text"
                    value={budgetText}
                    onChange={handleBudgetChange}
                    onFocus={handleBudgetFocus}
                    onBlur={handleBudgetBlur}
                />
                <div className="mt-6 flex justify-end">
                    <button
                        type="submit"
                        className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors"
                    >
                        Save Settings
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default PayPeriodSettingsModal;
