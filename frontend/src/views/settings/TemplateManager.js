import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { toast } from 'react-hot-toast';
import { PlusCircle, Trash2, Save } from 'lucide-react';
import { api } from '../../api/api';
import { LayoutContext } from '../../contexts/LayoutContext';
import TiptapEditor from '../../components/TiptapEditor';
import InputField from '../../components/InputField';
import ConfirmationModal from '../../components/ConfirmationModal';

const TABS = ['ROSTER', 'CREW', 'HOURS'];

// UPDATED VARIABLES LIST 
const VARIABLES = {
    ROSTER: ['{{firstName}}', '{{lastName}}', '{{showName}}', '{{schedule}}', '{{tags}}', '{{rosteredEmail}}'],
    CREW: ['{{firstName}}', '{{lastName}}', '{{showName}}', '{{callTime}}', '{{notes}}', '{{venue}}'], // Added callTime, notes, venue
    HOURS: ['{{pmFirstName}}', '{{pmLastName}}', '{{showName}}', '{{weekStartDate}}', '{{totalCost}}'],
};

const TemplateManager = () => {
    // 1. Enable Global Scrolling
    const { setShouldScroll } = useContext(LayoutContext);
    
    useEffect(() => {
        setShouldScroll(true);
        return () => setShouldScroll(false);
    }, [setShouldScroll]);

    const [activeTab, setActiveTab] = useState(TABS[0]);
    const [templates, setTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [templateSubject, setTemplateSubject] = useState('');
    const [templateBody, setTemplateBody] = useState('');
    
    const [templateToDelete, setTemplateToDelete] = useState(null);

    const editorRef = useRef(null);

    const fetchTemplates = useCallback(async () => {
        try {
            const data = await api.getEmailTemplates(activeTab);
            setTemplates(data);
            setSelectedTemplate(null);
            setIsCreating(false);
            setTemplateName('');
            setTemplateSubject('');
            setTemplateBody('');
        } catch (error) {
            toast.error(`Failed to fetch templates: ${error.message}`);
        }
    }, [activeTab]);

    useEffect(() => {
        fetchTemplates();
    }, [fetchTemplates]);

    useEffect(() => {
        if (selectedTemplate) {
            setTemplateName(selectedTemplate.name);
            setTemplateSubject(selectedTemplate.subject);
            setTemplateBody(selectedTemplate.body);
            setIsCreating(false);
        }
    }, [selectedTemplate]);

    const handleSelectTemplate = (template) => {
        setIsCreating(false);
        setSelectedTemplate(template);
    };

    const handleNewTemplate = () => {
        setSelectedTemplate(null);
        setIsCreating(true);
        setTemplateName('New Template');
        setTemplateSubject('');
        setTemplateBody('<p>Start writing your template here.</p>');
    };

    const handleSaveTemplate = async () => {
        const templateData = {
            name: templateName,
            subject: templateSubject,
            body: templateBody,
            category: activeTab,
        };

        try {
            if (selectedTemplate?.id) {
                await api.updateEmailTemplate(selectedTemplate.id, templateData);
                toast.success('Template updated successfully!');
            } else {
                await api.createEmailTemplate(templateData);
                toast.success('Template created successfully!');
            }
            fetchTemplates();
        } catch (error) {
            toast.error(`Failed to save template: ${error.message}`);
        }
    };
    
    const handleDeleteClick = (templateId) => {
        setTemplateToDelete(templateId);
    };

    const confirmDelete = async () => {
        if (!templateToDelete) return;

        try {
            await api.deleteEmailTemplate(templateToDelete);
            toast.success('Template deleted successfully!');
            fetchTemplates();
        } catch (error) {
            toast.error(`Failed to delete template: ${error.message}`);
        } finally {
            setTemplateToDelete(null);
        }
    };

    const handleRestoreDefaults = async () => {
        try {
            await api.restoreDefaultEmailTemplates();
            toast.success('Default templates restored!');
            fetchTemplates();
        } catch (error) {
            toast.error(`Failed to restore defaults: ${error.message}`);
        }
    };

    const insertVariable = (variable) => {
        if (editorRef.current) {
            editorRef.current.chain().focus().insertContent(` ${variable} `).run();
        }
    };
    
    const handleEditorInstance = (editor) => {
        editorRef.current = editor;
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">
            <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Email Template Manager</h1>
            </header>
            
            <div className="flex gap-8 items-start">
                <aside className="w-1/4 sticky top-6">
                    <div className="flex border-b border-gray-600 mb-4">
                        {TABS.map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 py-2 text-sm font-bold ${activeTab === tab ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-400 hover:text-white'}`}
                            >
                                {tab.charAt(0) + tab.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={handleNewTemplate}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 mb-4 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-white"
                    >
                        <PlusCircle size={16} /> New Template
                    </button>
                    <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                        {templates.map(template => (
                            <li
                                key={template.id}
                                onClick={() => handleSelectTemplate(template)}
                                className={`p-3 rounded-lg cursor-pointer flex justify-between items-center ${selectedTemplate?.id === template.id ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
                            >
                                <span className="font-semibold">{template.name}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteClick(template.id); }}
                                    className="text-gray-500 hover:text-red-500"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </li>
                        ))}
                    </ul>
                     <button
                        onClick={handleRestoreDefaults}
                        className="w-full mt-6 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-white text-sm"
                    >
                        Restore Default Templates
                    </button>
                </aside>
                
                <main className="w-3/4">
                    {selectedTemplate || isCreating ? (
                        <div className="space-y-4">
                            <InputField label="Template Name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
                            <InputField label="Email Subject" value={templateSubject} onChange={(e) => setTemplateSubject(e.target.value)} />
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Variables</label>
                                <div className="flex flex-wrap gap-2 p-2 bg-gray-900 rounded-lg">
                                    {VARIABLES[activeTab].map(variable => (
                                        <button
                                            key={variable}
                                            onClick={() => insertVariable(variable)}
                                            className="px-2 py-1 bg-gray-700 text-xs text-amber-300 rounded-md font-mono hover:bg-gray-600"
                                        >
                                            {variable}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <TiptapEditor
                                value={templateBody}
                                onChange={setTemplateBody}
                                placeholder="Edit your template content..."
                                onEditorInstance={handleEditorInstance}
                            />
                            <div className="flex justify-end">
                                <button onClick={handleSaveTemplate} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">
                                    <Save size={16} /> Save Template
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-64 bg-gray-800 rounded-lg">
                            <p className="text-gray-500">Select a template to edit or create a new one.</p>
                        </div>
                    )}
                </main>
            </div>

            {templateToDelete && (
                <ConfirmationModal
                    message="Are you sure you want to delete this template? This action cannot be undone."
                    onConfirm={confirmDelete}
                    onCancel={() => setTemplateToDelete(null)}
                />
            )}
        </div>
    );
};

export default TemplateManager;