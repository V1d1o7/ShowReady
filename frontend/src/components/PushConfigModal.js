import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle, XCircle, MinusCircle, Loader2, Info } from 'lucide-react';
import Modal from './Modal';
import InputField from './InputField';
import ConsoleSetupInfoModal from './ConsoleSetupInfoModal';
import { api } from '../api/api';
import { testSwitchRestConnection, runSwitchRestPlan } from '../utils/switchRestExecutor';
import { isSerialSupported, requestSwitchSerialPort, runSwitchCliPlan } from '../utils/switchSerialExecutor';

// REST is still unverified guesswork against Netgear's onboard API (no official docs
// yet) -- hide it from the UI for now rather than offer a path known to be a guess.
// Nothing backend-side changes: rest_plan/generate_rest_plan stay as-is, just unused
// here. Flip this back on once REST payloads are confirmed against real hardware.
const HIDE_REST_TRANSPORT = true;

const STATUS_ICON = {
    success: <CheckCircle size={16} className="text-green-400 flex-shrink-0" />,
    failed: <XCircle size={16} className="text-red-400 flex-shrink-0" />,
    skipped: <MinusCircle size={16} className="text-gray-500 flex-shrink-0" />,
    pending: <div className="w-4 h-4 flex-shrink-0" />,
    running: <Loader2 size={16} className="text-blue-400 flex-shrink-0 animate-spin" />,
};

const StepList = ({ steps, results }) => (
    <div className="max-h-64 overflow-y-auto bg-gray-900 rounded-lg border border-gray-700 divide-y divide-gray-800">
        {steps.map((step, i) => {
            const result = results[i];
            const status = result?.status || 'pending';
            return (
                <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                    {STATUS_ICON[status]}
                    <div className="min-w-0">
                        <p className={status === 'failed' ? 'text-red-300' : 'text-gray-200'}>{step.description}</p>
                        {result?.message && status === 'failed' && (
                            <p className="text-xs text-red-400 truncate">{result.message}</p>
                        )}
                    </div>
                </div>
            );
        })}
    </div>
);

const PushConfigModal = ({ isOpen, onClose, switchId, driverType, initialManagementIp }) => {
    const [drivers, setDrivers] = useState([]);
    const [transport, setTransport] = useState(null); // 'rest' | 'serial'

    // REST state
    const [ip, setIp] = useState(initialManagementIp || '');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [connectionOk, setConnectionOk] = useState(false);
    const [connectError, setConnectError] = useState(null);
    const [isTesting, setIsTesting] = useState(false);

    // Serial state
    const [serialPort, setSerialPort] = useState(null);
    const [serialBaudRate, setSerialBaudRate] = useState(null);

    // Shared run state
    const [steps, setSteps] = useState([]);
    const [results, setResults] = useState({});
    const [isRunning, setIsRunning] = useState(false);
    const [runError, setRunError] = useState(null);

    useEffect(() => {
        if (!isOpen) return;
        api.getSwitchDrivers().then(setDrivers).catch(() => setDrivers([]));
        setSteps([]);
        setResults({});
        setConnectionOk(false);
        setConnectError(null);
        setRunError(null);
        setSerialPort(null);
        setSerialBaudRate(null);
    }, [isOpen]);

    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

    const supportedTransports = useMemo(() => {
        const driver = drivers.find(d => d.key === driverType);
        const transports = driver?.supported_transports || [];
        return HIDE_REST_TRANSPORT ? transports.filter(t => t !== 'rest') : transports;
    }, [drivers, driverType]);

    useEffect(() => {
        if (supportedTransports.length && !transport) {
            setTransport(supportedTransports[0]);
        }
    }, [supportedTransports, transport]);

    const handleTestConnection = async () => {
        setIsTesting(true);
        setConnectError(null);
        const result = await testSwitchRestConnection({ ip, username, password });
        setIsTesting(false);
        if (result.ok) {
            setConnectionOk(true);
            const plan = await api.getSwitchRestPlan(switchId);
            setSteps(plan);
            api.saveSwitchManagementIp(switchId, ip).catch(() => {});
        } else {
            setConnectionOk(false);
            setConnectError(result.message);
        }
    };

    const handleRunRest = async () => {
        setIsRunning(true);
        setRunError(null);
        setResults({});
        try {
            const { token } = await testSwitchRestConnection({ ip, username, password });
            await runSwitchRestPlan({ ip, token }, steps, (i, result) => {
                setResults(prev => ({ ...prev, [i]: result }));
            });
        } catch (err) {
            setRunError(err.message);
        } finally {
            setIsRunning(false);
        }
    };

    const handleConnectSerial = async () => {
        setConnectError(null);
        try {
            const port = await requestSwitchSerialPort();
            const plan = await api.getSwitchCliCommands(switchId);
            setSteps(plan.commands);
            setSerialPort(port);
            setSerialBaudRate(plan.baud_rate);
            setConnectionOk(true);
        } catch (err) {
            setConnectError(err.message);
        }
    };

    const handleRunSerial = async () => {
        if (!serialPort) return;
        setIsRunning(true);
        setRunError(null);
        setResults({});
        try {
            await runSwitchCliPlan(
                serialPort,
                { baud_rate: serialBaudRate, commands: steps },
                (i, result) => setResults(prev => ({ ...prev, [i]: result })),
            );
        } catch (err) {
            setRunError(err.message);
        } finally {
            setIsRunning(false);
        }
    };

    const resultsArray = steps.map((_, i) => results[i]).filter(Boolean);
    const isComplete = steps.length > 0 && resultsArray.length === steps.length;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Configure Switch" maxWidth="max-w-lg">
            <div className="space-y-4">
                {supportedTransports.length > 1 && (
                    <div className="flex gap-2">
                        {supportedTransports.map(t => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => { setTransport(t); setConnectionOk(false); setSteps([]); setResults({}); setSerialPort(null); setSerialBaudRate(null); }}
                                className={`flex-1 px-3 py-2 rounded-lg font-bold text-sm ${transport === t ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                            >
                                {t === 'rest' ? 'Network (REST)' : 'Console Cable'}
                            </button>
                        ))}
                    </div>
                )}

                {transport === 'rest' && (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-400">
                            Connects directly from this browser to the switch's onboard management API.
                            Credentials are sent straight to the switch and are never stored by ShowReady.
                            If this is the first time connecting to this switch, open{' '}
                            <span className="font-mono">https://{ip || '<switch-ip>'}:8443</span> in a new tab first
                            and accept the certificate warning.
                        </p>
                        <InputField label="Switch IP Address" name="ip" value={ip} onChange={(e) => setIp(e.target.value)} required autoFocus placeholder="e.g., 192.168.0.239" />
                        <InputField label="Username" name="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                        <InputField label="Password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        {connectError && <p className="text-sm text-red-400">{connectError}</p>}
                        {!connectionOk ? (
                            <button
                                type="button"
                                onClick={handleTestConnection}
                                disabled={isTesting || !ip || !username || !password}
                                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold disabled:opacity-50"
                            >
                                {isTesting ? 'Testing…' : 'Test Connection'}
                            </button>
                        ) : (
                            <p className="text-sm text-green-400">Connected. {steps.length} step(s) ready to run.</p>
                        )}
                    </div>
                )}

                {transport === 'serial' && (
                    <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-gray-400">
                                Connects to the switch's console port over USB-to-serial. No credentials needed on a
                                factory-default switch.
                            </p>
                            <button
                                type="button"
                                onClick={() => setIsInfoModalOpen(true)}
                                className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 flex-shrink-0 whitespace-nowrap"
                            >
                                <Info size={14} /> How do I connect?
                            </button>
                        </div>
                        {!isSerialSupported() && (
                            <p className="text-sm text-red-400">Web Serial isn't available in this browser. Use Chrome or Edge.</p>
                        )}
                        {connectError && <p className="text-sm text-red-400">{connectError}</p>}
                        {!connectionOk ? (
                            <button
                                type="button"
                                onClick={handleConnectSerial}
                                disabled={!isSerialSupported()}
                                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold disabled:opacity-50"
                            >
                                Select Serial Port
                            </button>
                        ) : (
                            <p className="text-sm text-green-400">Port selected. {steps.length} command(s) ready to run.</p>
                        )}
                    </div>
                )}

                {steps.length > 0 && <StepList steps={steps} results={results} />}
                {runError && <p className="text-sm text-red-400">{runError}</p>}

                <div className="flex justify-end gap-4 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">
                        {isComplete ? 'Close' : 'Cancel'}
                    </button>
                    {connectionOk && !isComplete && (
                        <button
                            type="button"
                            onClick={transport === 'rest' ? handleRunRest : handleRunSerial}
                            disabled={isRunning}
                            className="px-4 py-2 bg-green-500 hover:bg-green-400 rounded-lg font-bold text-white disabled:bg-green-700 disabled:cursor-not-allowed"
                        >
                            {isRunning ? 'Running…' : 'Run Configuration'}
                        </button>
                    )}
                </div>
            </div>
            <ConsoleSetupInfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} />
        </Modal>
    );
};

export default PushConfigModal;
