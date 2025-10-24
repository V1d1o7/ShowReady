import React, { useState } from 'react';
import { api } from '../api/api';

const EmailTimesheetModal = ({ show, onClose, showData, weekStartDate }) => {
    const defaultSubject = `${showData.info.name} Timesheet - Week of ${weekStartDate}`;
    const [to, setTo] = useState(showData.info.show_pm_email || '');
    const [subject, setSubject] = useState(defaultSubject);
    const [body, setBody] = useState(`Please find the attached timesheet for ${showData.info.name}.`);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSend = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await api.emailTimesheet(showData.info.id, weekStartDate, {
                recipient_email: to,
                subject,
                body,
            });
            onClose();
        } catch (err) {
            if (err.response?.data?.detail?.includes("SMTP settings not configured")) {
                setError("Error: Please configure your email (SMTP) settings in your Account page before sending.");
            } else {
                setError("Failed to send email. Please try again.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md">
                <h2 className="text-xl font-bold text-white mb-4">Email Timesheet</h2>
                {error && <div className="bg-red-500 text-white p-3 rounded mb-4">{error}</div>}
                <div className="space-y-4">
                    <input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="To:" className="w-full p-2 bg-gray-700 border border-gray-600 rounded" />
                    <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject:" className="w-full p-2 bg-gray-700 border border-gray-600 rounded" />
                    <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} className="w-full p-2 bg-gray-700 border border-gray-600 rounded" />
                </div>
                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500">Cancel</button>
                    <button onClick={handleSend} disabled={isLoading} className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-black">
                        {isLoading ? "Sending..." : "Send"}
                    </button>
                </div>
            </div>
        </div>
    );
};
export default EmailTimesheetModal;
