import React, { useState, useEffect } from 'react';
import { api } from '../../api/api';
import Card from '../../components/Card';
import InputField from '../../components/InputField';
import Modal from '../../components/Modal';
import toast, { Toaster } from 'react-hot-toast';
import { MailPlus, Send, Trash2 } from 'lucide-react';
import ConfirmationModal from '../../components/ConfirmationModal';

// --- Sender Identity Manager Component ---
const SenderManager = ({ senders, onUpdate }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [loginEmail, setLoginEmail] = useState('');
    const [confirmationModal, setConfirmationModal] = useState({ isOpen: false, message: '', onConfirm: () => {} });

    const handleAddSender = async (e) => {
        e.preventDefault();
        try {
            await api.createSenderIdentity({ name, email, sender_login_email: loginEmail });
            toast.success("Sender identity added!");
            onUpdate();
            setIsModalOpen(false);
            setName('');
            setEmail('');
            setLoginEmail('');
        } catch (error) {
            toast.error(`Failed to add sender: ${error.message}`);
        }
    };

    const handleDeleteSender = (id) => {
        setConfirmationModal({
            isOpen: true,
            message: "Are you sure you want to delete this sender identity?",
            onConfirm: async () => {
                try {
                    await api.deleteSenderIdentity(id);
                    toast.success("Sender identity deleted!");
                    onUpdate();
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                } catch (error) {
                    toast.error(`Failed to delete sender: ${error.message}`);
                    setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} });
                }
            }
        });
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
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Save Sender</button>
                    </div>
                </form>
            </Modal>
            {confirmationModal.isOpen && (
                <ConfirmationModal
                    message={confirmationModal.message}
                    onConfirm={confirmationModal.onConfirm}
                    onCancel={() => setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} })}
                />
            )}
        </>
    );
};


// --- Email Composer Component ---
const EmailComposer = ({ senders }) => {
    const [sendMode, setSendMode] = useState('users'); // 'users' or 'new_users'
    const [roles, setRoles] = useState([]);
    const [selectedRole, setSelectedRole] = useState('all');
    const [newUsers, setNewUsers] = useState([]);
    const [senderId, setSenderId] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newUserName, setNewUserName] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');

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

    const handleAddUser = (e) => {
        e.preventDefault();
        if (newUserName && newUserEmail) {
            setNewUsers([...newUsers, { name: newUserName, email: newUserEmail }]);
            setNewUserName('');
            setNewUserEmail('');
            setIsModalOpen(false);
        }
    };

    const handleRemoveUser = (index) => {
        setNewUsers(newUsers.filter((_, i) => i !== index));
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!senderId || !subject || !body) {
            toast.error("Please fill out all fields.");
            return;
        }

        let payload;
        let apiCall;

        if (sendMode === 'users') {
            if (!selectedRole) {
                toast.error("Please select a role.");
                return;
            }
            payload = { to_role: selectedRole, subject, body, sender_id: senderId };
            apiCall = api.adminSendEmail;
        } else { // 'new_users'
            if (newUsers.length === 0) {
                toast.error("Please add at least one new user.");
                return;
            }
            payload = { recipients: newUsers, subject, body, sender_id: senderId };
            apiCall = api.sendNewUserListEmail;
        }

        setIsSending(true);
        const toastId = toast.loading("Sending emails...");

        try {
            const response = await apiCall(payload);
            toast.success(response.message || "Emails sent successfully!", { id: toastId });
            // Clear fields on success
            setSubject('');
            setBody('');
            setNewUsers([]);
        } catch (error) {
            toast.error(`Failed to send emails: ${error.message}`, { id: toastId });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Card>
            <h2 className="text-xl font-bold text-white mb-4">Email Composer</h2>
            <form onSubmit={handleSend} className="space-y-4">
                <div className="flex items-center space-x-4">
                    <span className="text-sm font-medium text-gray-300">Users</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={sendMode === 'new_users'} onChange={() => setSendMode(sendMode === 'users' ? 'new_users' : 'users')} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-4 peer-focus:ring-amber-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                    </label>
                    <span className="text-sm font-medium text-gray-300">New Users</span>
                </div>

                {sendMode === 'users' ? (
                    <div>
                        <label htmlFor="role" className="block text-sm font-medium text-gray-300">User Role</label>
                        <select id="role" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} required className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm">
                            <option value="all">All Users</option>
                            {roles.map(role => <option key={role} value={role}>{role}</option>)}
                        </select>
                    </div>
                ) : (
                    <div>
                        <label className="block text-sm font-medium text-gray-300">New Users List</label>
                        <div className="mt-1 space-y-2">
                            {newUsers.map((user, index) => (
                                <div key={index} className="flex items-center justify-between bg-gray-800/50 p-2 rounded-lg">
                                    <div>
                                        <p className="font-bold">{user.name}</p>
                                        <p className="text-sm text-gray-400">{user.email}</p>
                                    </div>
                                    <button type="button" onClick={() => handleRemoveUser(index)} className="p-2 text-gray-500 hover:text-red-400">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={() => setIsModalOpen(true)} className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-white text-sm font-bold rounded-lg hover:bg-gray-600">
                            <MailPlus size={16} /> Add User
                        </button>
                    </div>
                )}
                
                <div>
                    <label htmlFor="sender" className="block text-sm font-medium text-gray-300">Sender</label>
                    <select id="sender" value={senderId} onChange={(e) => setSenderId(e.target.value)} required className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm">
                        <option value="" disabled>Select a sender</option>
                        {senders.map(sender => <option key={sender.id} value={sender.id}>{sender.name} &lt;{sender.email}&gt;</option>)}
                    </select>
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
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New User">
                <form onSubmit={handleAddUser} className="space-y-4">
                    <InputField label="Name" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} required />
                    <InputField label="Email" type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required />
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">Add User</button>
                    </div>
                </form>
            </Modal>
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
