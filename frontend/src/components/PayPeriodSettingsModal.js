import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import InputField from './InputField';
import SelectField from './SelectField';

const PayPeriodSettingsModal = ({ isOpen, onClose, settings, onSave }) => {
    const [currentSettings, setCurrentSettings] = useState(settings);

    useEffect(() => {
        setCurrentSettings(settings);
    }, [settings]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setCurrentSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        onSave(currentSettings);
        onClose();
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
            <div className="space-y-4">
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
            </div>
            <div className="mt-6 flex justify-end">
                <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors"
                >
                    Save Settings
                </button>
            </div>
        </Modal>
    );
};

export default PayPeriodSettingsModal;