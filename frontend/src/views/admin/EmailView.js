import React, { useState, useEffect } from 'react';
import { api } from '../../api/api';
import Card from '../../components/Card';
import InputField from '../../components/InputField';
import Modal from '../../components/Modal';
import toast, { Toaster } from 'react-hot-toast';
import { MailPlus, Send, Trash2 } from 'lucide-react';

// --- Sender Identity Manager Component ---
const SenderManager = ({ senders, onUpdate }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [loginEmail, setLoginEmail] = useState('');
    const [appPassword, setAppPassword] = useState('');

    const handleAddSender = async (e) => {
        e.preventDefault();
        try {
            await api.createSenderIdentity({ name, email, sender_login_email: loginEmail, app_password: appPassword });
            toast.success("Sender identity added!");
            onUpdate();
            setIsModalOpen(false);
            setName('');
            setEmail('');
            setLoginEmail('');
            setAppPassword('');
        } catch (error) {
            toast.error(`Failed to add sender: ${error.message}`);
        }
    };

    const handleDeleteSender = async (id) => {
        if (!window.confirm("Are you sure you want to delete this sender identity?")) return;
        try {
            await api.deleteSenderIdentity(id);
            toast.success("Sender identity deleted!");
            onUpdate();
        } catch (error) {
            toast.error(`Failed to delete sender: ${error.message}`);
        }
    };

    return (
        <>
            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Sender Identities</h2>
                    <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600">
                        <MailPlus size={16} /> Add Sender
                    </button>
                </div>
                <div className="space-y-2">
                    {senders.map(sender => (
                        <div key={sender.id} className="flex justify-between items-center p-2 bg-gray-800/50 rounded-lg">
                            <div>
                                <p className="font-bold">{sender.name}</p>
                                <p className="text-sm text-gray-400">{sender.email}</p>
                            </div>
                            <button onClick={() => handleDeleteSender(sender.id)} className="p-2 text-gray-500 hover:text-red-400">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </Card>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Sender Identity">
                <form onSubmit={handleAddSender} className="space-y-4">
                    <InputField label="Display Name" value={name} onChange={(e) => setName(e.target.value)} required />
                    <InputField label="Display Email (From Address)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    <InputField label="Login Email (for SMTP)" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                    <InputField label="Google App Password" type="password" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} required />
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Save Sender</button>
                    </div>
                </form>
            </Modal>
        </>
    );
};


// --- Email Composer Component ---
const EmailComposer = ({ senders }) => {
    const [roles, setRoles] = useState([]);
    const [senderId, setSenderId] = useState('');
    const [toRole, setToRole] = useState('all');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        if (senders.length > 0 && !senderId) {
            setSenderId(senders[0].id);
        }
    }, [senders, senderId]);

    useEffect(() => {
        api.getAdminUserRoles()
            .then(data => setRoles(data.roles || []))
            .catch(err => console.error("Failed to fetch roles:", err));
    }, []);

    const handleSendEmail = async (e) => {
        e.preventDefault();
        if (!senderId || !toRole || !subject || !body) {
            toast.error("Please fill out all fields before sending.");
            return;
        }

        setIsSending(true);
        const toastId = toast.loading('Sending emails...');

        try {
            const response = await api.adminSendEmail({
                sender_id: senderId,
                to_role: toRole,
                subject: subject,
                body: body
            });
            toast.success(response.message || "Emails sent successfully!", { id: toastId });
            // Clear the form on success
            setToRole('all');
            setSubject('');
            setBody('');
        } catch (error) {
            toast.error(`Failed to send emails: ${error.message}`, { id: toastId });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Card>
            <h2 className="text-xl font-bold text-white mb-4">Email Composer</h2>
            <form onSubmit={handleSendEmail} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label htmlFor="sender_id" className="block text-sm font-medium text-gray-300 mb-1.5">From:</label>
                        <select
                            id="sender_id"
                            value={senderId}
                            onChange={(e) => setSenderId(e.target.value)}
                            className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                        >
                            {senders.map(sender => (
                                <option key={sender.id} value={sender.id}>{sender.name} ({sender.email})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="to_role" className="block text-sm font-medium text-gray-300 mb-1.5">To:</label>
                        <select
                            id="to_role"
                            value={toRole}
                            onChange={(e) => setToRole(e.target.value)}
                            className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                        >
                            <option value="all">All Users</option>
                            {roles.map(role => (
                                <option key={role} value={role}>{role}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <InputField
                    label="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                />
                <div>
                    <label htmlFor="body" className="block text-sm font-medium text-gray-300 mb-1.5">Body</label>
                    <textarea
                        id="body"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        required
                        placeholder="Type your message here. Use '----' on a new line to create a section break."
                        className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg h-48 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500"
                    />
                </div>
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={isSending || senders.length === 0}
                        className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send size={16} />
                        {isSending ? 'Sending...' : 'Send Email'}
                    </button>
                </div>
            </form>
        </Card>
    );
};

const EmailView = () => {
    const [senders, setSenders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchSenders = async () => {
        setIsLoading(true);
        try {
            const sendersData = await api.getSenderIdentities();
            setSenders(sendersData);
        } catch (error) {
            console.error("Failed to fetch sender identities:", error);
            toast.error("Failed to load sender identities.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSenders();
    }, []);

    if (isLoading) {
        return <div className="p-8 text-center text-gray-400">Loading Email Tools...</div>;
    }

    return (
        <>
            <Toaster position="bottom-center" />
            <div className="space-y-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Email Management</h1>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <EmailComposer senders={senders} />
                    <SenderManager senders={senders} onUpdate={fetchSenders} />
                </div>
            </div>
        </>
    );
};

export default EmailView;
