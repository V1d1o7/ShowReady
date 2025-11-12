import React, { useState } from 'react';
import Modal from './Modal';
import InputField from './InputField';

const PushConfigModal = ({ isOpen, onClose, onPush, isPushing }) => {
    const [targetIp, setTargetIp] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onPush({ target_ip: targetIp, username, password });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Push Configuration to Switch">
            <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-gray-400">
                    Enter the credentials for the switch. This information is encrypted and sent directly to your local agent. It is not stored on the server.
                </p>
                <InputField
                    label="Switch IP Address"
                    name="target_ip"
                    value={targetIp}
                    onChange={(e) => setTargetIp(e.target.value)}
                    required
                    autoFocus
                    placeholder="e.g., 192.168.1.10"
                />
                <InputField
                    label="Username"
                    name="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                />
                <InputField
                    label="Password"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">Cancel</button>
                    <button type="submit" disabled={isPushing} className="px-4 py-2 bg-green-500 hover:bg-green-400 rounded-lg font-bold text-white disabled:bg-green-700 disabled:cursor-not-allowed">
                        {isPushing ? 'Pushing...' : 'Start Push'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default PushConfigModal;
