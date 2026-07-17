import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import SelectField from './SelectField';

const PayPeriodSettingsModal = ({ isOpen, onClose, settings, onSave }) => {
    const [currentSettings, setCurrentSettings] = useState(settings);
    const [budgetText, setBudgetText] = useState('');

    const formatCurrency = (val) => {
        if (val === undefined || val === null || val === '') return '';
        const clean = String(val).replace(/[^0-9.]/g, '');
        const num = parseFloat(clean);
        if (isNaN(num)) return '';
        return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    };

    useEffect(() => {
        setCurrentSettings(settings);
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
        onSave(currentSettings);
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
