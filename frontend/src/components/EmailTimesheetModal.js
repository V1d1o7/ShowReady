import React, { useState, useEffect } from 'react';
import { api } from '../api/api';
import useHotkeys from '../hooks/useHotkeys';
import { useToast } from '../contexts/ToastContext';

const EmailTimesheetModal = ({ isOpen, onClose, showId, weekStartDate }) => {
    useHotkeys({ 'escape': onClose });
    
    const { addToast } = useToast();
    const [showData, setShowData] = useState(null);
    const [to, setTo] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (showId) {
            api.getShow(showId).then(data => {
                if (data) {
                    setShowData(data);
                    const defaultSubject = `${data.name} Timesheet - Week of ${weekStartDate}`;
                    setTo(data.data?.info?.show_pm_email || '');
                    setSubject(defaultSubject);
                    setBody(`Please find the attached timesheet for ${data.name}.`);
                }
            });
        }
    }, [showId, weekStartDate]);

    const handleSend = async () => {
        setIsLoading(true);
        try {
            const recipient_emails = to.split(',').map(email => email.trim()).filter(email => email);
            await api.emailTimesheet(showId, weekStartDate, {
                recipient_emails,
                subject,
                body,
            });
            addToast("Email sent successfully!", "success");
            onClose();
        } catch (err) {
            if (err.message?.includes("SMTP settings not configured")) {
                addToast("Error: Please configure your email (SMTP) settings in your Account page before sending.", "error");
            } else {
                addToast("Failed to send email. Please try again.", "error");
            }
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md">
                <h2 className="text-xl font-bold text-white mb-4">Email Timesheet</h2>
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
