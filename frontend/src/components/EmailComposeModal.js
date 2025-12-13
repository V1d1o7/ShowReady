import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { toast } from 'react-hot-toast';
import { api } from '../api/api';
import Modal from './Modal';
import TiptapEditor from './TiptapEditor';
import InputField from './InputField';
import SelectField from './SelectField';

const EmailComposeModal = ({ isOpen, onClose, recipients, category }) => {
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [templates, setTemplates] = useState([]);
    const [showPreview, setShowPreview] = useState(false);
    const [isSending, setIsSending] = useState(false); // Fix: Add sending state

    useEffect(() => {
        if (isOpen) {
            const fetchTemplates = async () => {
                try {
                    const fetchedTemplates = await api.getEmailTemplates(category);
                    setTemplates(fetchedTemplates);
                } catch (error) { toast.error(`Failed to fetch email templates: ${error.message}`); }
            };
            fetchTemplates();
        } else {
            setSubject('');
            setBody('');
            setSelectedTemplate('');
            setTemplates([]);
            setShowPreview(false);
            setIsSending(false);
        }
    }, [isOpen, category]);

    const handleTemplateChange = (e) => {
        const templateId = e.target.value;
        setSelectedTemplate(templateId);
        const template = templates.find(t => t.id === templateId);
        if (template) {
            setSubject(template.subject);
            setBody(template.body);
        } else {
            setSubject('');
            setBody('');
        }
    };
    
    const generatePreviewHtml = () => {
        let previewContent = body;
        const firstRecipient = recipients && recipients.length > 0 ? recipients[0] : {};

        // Use data from the first recipient for a realistic preview, with fallbacks
        const substitutions = {
            '{{firstName}}': firstRecipient.first_name || 'John',
            '{{lastName}}': firstRecipient.last_name || 'Appleseed',
            '{{position}}': firstRecipient.position || 'Crew Member',
            '{{email}}': firstRecipient.email || 'test@example.com',
            '{{showName}}': 'The Big Gig', // Example, would need to be passed in if dynamic
            '{{pmName}}': 'Jane Doe', // Example
            '{{weekStartDate}}': new Date().toLocaleDateString(), // Example
        };

        for (const [variable, value] of Object.entries(substitutions)) {
            // Use a regex with the 'g' flag to replace all instances
            previewContent = previewContent.replace(new RegExp(variable, 'g'), value);
        }

        return DOMPurify.sanitize(previewContent);
    };

    const handleSendEmail = async () => {
        if (!subject || !body || !recipients || recipients.length === 0) {
            toast.error('Subject, body, and at least one recipient are required.');
            return;
        }

        const recipientIds = recipients.map(r => r.id);
        setIsSending(true); // Fix: Start sending state
        const toastId = toast.loading("Sending emails..."); // Fix: Add loading toast

        try {
            await api.sendCommunication({
                subject,
                body,
                recipient_ids: recipientIds,
                category,
            });
            toast.success('Email sent successfully!', { id: toastId });
            onClose();
        } catch (error) {
            toast.error(`Failed to send email: ${error.message}`, { id: toastId });
        } finally {
            setIsSending(false); // Fix: End sending state
        }
    };

    const templateOptions = templates.map(t => ({ value: t.id, label: t.name }));

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={`Compose Email for ${category}`}>
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                    <SelectField
                        label="Select a Template"
                        value={selectedTemplate}
                        onChange={handleTemplateChange}
                        options={[{ value: '', label: 'Start from scratch' }, ...templateOptions]}
                    />
                    <InputField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email Subject" />
                    <TiptapEditor value={body} onChange={setBody} placeholder="Write your email here..." />
                </div>
                <div className="mt-6 flex justify-between">
                    <button onClick={() => setShowPreview(true)} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg font-bold text-white">Preview</button>
                    <button 
                        onClick={handleSendEmail} 
                        disabled={isSending}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSending ? 'Sending...' : 'Send Email'}
                    </button>
                </div>
            </Modal>

            <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title="Email Preview">
                <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: generatePreviewHtml() }} />
            </Modal>
        </>
    );
};

export default EmailComposeModal;