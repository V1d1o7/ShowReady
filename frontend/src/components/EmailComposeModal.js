import React, { useState, useEffect, useCallback } from 'react';
import { X, Send, Paperclip } from 'lucide-react';
import { api } from '../api/api';
import toast from 'react-hot-toast';
import TiptapEditor from './TiptapEditor';
import InputField from './InputField';
import useHotkeys from '../hooks/useHotkeys';

// Define available variables for on-the-fly editing
const VARIABLES = {
    ROSTER: ['{{firstName}}', '{{lastName}}', '{{showName}}', '{{schedule}}'],
    CREW: ['{{firstName}}', '{{lastName}}', '{{showName}}'],
    HOURS: ['{{pmFirstName}}', '{{pmLastName}}', '{{showName}}', '{{weekStartDate}}', '{{totalCost}}'],
};

const EmailComposeModal = ({ isOpen, onClose, recipients, category, showId, weekStartDate, grandTotals }) => {
    // Close on Escape key
    useHotkeys({ 'escape': onClose });

    const [templates, setTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    
    // Core Email Fields
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [toEmail, setToEmail] = useState(''); 
    const [isSending, setIsSending] = useState(false);

    // Roster Specific
    const [shows, setShows] = useState([]);
    const [selectedShowId, setSelectedShowId] = useState(''); 
    const [scheduleText, setScheduleText] = useState('');

    // Editor Ref for inserting variables
    const [editorInstance, setEditorInstance] = useState(null);

    // Load data when opened, RESET when closed
    useEffect(() => {
        if (isOpen) {
            loadInitialData();
            // Ensure show ID is set if passed from props
            if (showId) setSelectedShowId(showId);
        } else {
            // FULL RESET when modal closes
            setSubject('');
            setBody('');
            setToEmail('');
            setSelectedTemplateId('');
            setSelectedShowId('');
            setScheduleText('');
            setIsSending(false);
        }
    }, [isOpen, category, showId]);

    const loadInitialData = async () => {
        try {
            // REMOVED: Fetching of Admin Sender Identities (getSenderIdentities)
            
            const templatesData = await api.getEmailTemplates(category);
            setTemplates(templatesData);
            
            const defaultTemplate = templatesData.find(t => t.is_default) || templatesData[0];
            if (defaultTemplate) {
                setSelectedTemplateId(defaultTemplate.id);
                setSubject(defaultTemplate.subject);
                setBody(defaultTemplate.body);
            }

            if (category === 'ROSTER') {
                const showsData = await api.getShows();
                setShows(showsData);
            } else if (category === 'HOURS' && showId) {
                const showResp = await api.getShow(showId);
                const pmEmail = showResp.info?.show_pm_email || showResp.data?.info?.show_pm_email || '';
                setToEmail(pmEmail);
            }

        } catch (error) {
            console.error("Failed to load email data:", error);
            toast.error("Failed to load email configurations.");
        }
    };

    const handleTemplateChange = (e) => {
        const templateId = e.target.value;
        setSelectedTemplateId(templateId);
        const template = templates.find(t => t.id === templateId);
        if (template) {
            setSubject(template.subject);
            setBody(template.body);
        }
    };

    const insertVariable = (variable) => {
        if (editorInstance) {
            editorInstance.chain().focus().insertContent(` ${variable} `).run();
        }
    };

    const processContent = (content) => {
        let processed = content;

        if (category === 'ROSTER') {
            const selectedShow = shows.find(s => s.id === parseInt(selectedShowId));
            const showName = selectedShow ? selectedShow.name : '[Show Name]';
            processed = processed.replace(/{{showName}}/g, showName);
            processed = processed.replace(/{{schedule}}/g, scheduleText || '[Schedule]');
        } 
        else if (category === 'HOURS') {
            processed = processed.replace(/{{weekStartDate}}/g, weekStartDate || '');
            processed = processed.replace(/{{totalCost}}/g, grandTotals ? `$${grandTotals.cost.toFixed(2)}` : '$0.00');
        }

        return processed;
    };

    const handleSend = async () => {
        setIsSending(true);
        const toastId = toast.loading("Sending emails...");

        try {
            const finalSubject = processContent(subject);
            const finalBody = processContent(body);

            if (category === 'HOURS') {
                const recipient_emails = toEmail.split(',').map(e => e.trim()).filter(e => e);
                await api.emailTimesheet(showId, weekStartDate, {
                    recipient_emails,
                    subject: finalSubject,
                    body: finalBody
                });
            } else {
                // REMOVED: sender_id from payload. 
                // The backend automatically uses your User SMTP settings.
                const payload = {
                    recipient_ids: recipients.map(r => r.id),
                    category: category,
                    subject: finalSubject,
                    body: finalBody
                };
                await api.sendCommunication(payload);
            }
            
            toast.success("Emails sent successfully!", { id: toastId });
            onClose();
        } catch (error) {
            toast.error(`Failed to send: ${error.message}`, { id: toastId });
        } finally {
            setIsSending(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4"
            onClick={onClose}
        >
            <div 
                className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-700"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Send size={20} className="text-amber-400" />
                        {category === 'HOURS' ? 'Submit Timesheet Report' : 'Compose Email'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24} /></button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* REMOVED: "From" dropdown selector */}
                        
                        <div className={category === 'HOURS' ? 'col-span-2' : 'col-span-2'}>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Load Template</label>
                            <select 
                                value={selectedTemplateId} 
                                onChange={handleTemplateChange}
                                className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                            >
                                <option value="" disabled>Select a template...</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {category === 'HOURS' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">To</label>
                            <InputField 
                                value={toEmail} 
                                onChange={(e) => setToEmail(e.target.value)} 
                                placeholder="pm@production.com"
                            />
                        </div>
                    )}

                    {category === 'ROSTER' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-gray-700 pb-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Select Show</label>
                                <select 
                                    value={selectedShowId} 
                                    onChange={(e) => setSelectedShowId(e.target.value)}
                                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-amber-500"
                                >
                                    <option value="">-- Choose Show --</option>
                                    {shows.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Schedule / Dates</label>
                                <InputField 
                                    value={scheduleText}
                                    onChange={(e) => setScheduleText(e.target.value)}
                                    placeholder="e.g. Dec 3, 5, & 13"
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Insert Variables</label>
                        <div className="flex flex-wrap gap-2">
                            {VARIABLES[category]?.map(variable => (
                                <button
                                    key={variable}
                                    onClick={() => insertVariable(variable)}
                                    className="px-2 py-1 bg-gray-700 border border-gray-600 text-xs text-amber-400 rounded-md font-mono hover:bg-gray-600 transition-colors"
                                    title="Click to insert"
                                >
                                    {variable}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <InputField 
                            label="Subject" 
                            value={subject} 
                            onChange={(e) => setSubject(e.target.value)} 
                        />
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Message Body</label>
                            <TiptapEditor 
                                value={body} 
                                onChange={setBody} 
                                placeholder="Write your message..." 
                                onEditorInstance={setEditorInstance}
                            />
                        </div>
                    </div>

                    {category === 'HOURS' && (
                        <div className="flex items-center gap-2 text-blue-300 text-sm">
                            <Paperclip size={16} />
                            <span>PDF Attachment: <strong>{`Timesheet - ${weekStartDate}.pdf`}</strong> (Auto-generated)</span>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-gray-900 border-t border-gray-700 flex justify-end gap-3 rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium">Cancel</button>
                    <button 
                        onClick={handleSend} 
                        disabled={isSending}
                        className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded flex items-center gap-2 disabled:opacity-50"
                    >
                        <Send size={18} />
                        {isSending ? 'Sending...' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EmailComposeModal;