import React from 'react';
import Modal from './Modal';

const ConsoleSetupInfoModal = ({ isOpen, onClose }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Connecting via Console Cable" maxWidth="max-w-2xl">
            <div className="space-y-4 text-gray-300">
                <p>
                    Console-port configuration talks directly to the switch over a serial connection --
                    no network or switch credentials needed, even on a factory-default unit.
                </p>

                <div>
                    <p className="font-bold text-white mb-1">What you need</p>
                    <ul className="list-disc list-inside space-y-1">
                        <li>A console cable for the switch's console port (a USB-to-RJ45 console cable is the
                            usual option for Netgear M4300/M4250, or a USB-to-serial adapter plus a
                            standard rollover/console cable).</li>
                        <li>Chrome or Edge -- Web Serial isn't available in Safari or Firefox.</li>
                    </ul>
                </div>

                <div>
                    <p className="font-bold text-white mb-1">Connection settings</p>
                    <p>9600 baud, 8 data bits, no parity, 1 stop bit (8N1) -- the standard for this switch
                        family. You won't need to set this manually; the browser picker below handles it.</p>
                </div>

                <div>
                    <p className="font-bold text-white mb-1">Steps</p>
                    <ol className="list-decimal list-inside space-y-1">
                        <li>Plug the console cable into the switch's console port and into this computer.</li>
                        <li>Click "Select Serial Port" below.</li>
                        <li>Chrome will show a device picker -- choose the console cable's entry (often
                            named something like "USB Serial" or the cable's chipset).</li>
                        <li>Once connected, click "Run Configuration" to send the generated commands.</li>
                    </ol>
                </div>

                <p className="text-sm text-gray-500">
                    If nothing shows up in the picker, unplug and replug the cable, or check that its driver
                    is installed (most USB-to-serial chipsets need one on Windows).
                </p>
            </div>
            <div className="flex justify-end mt-6">
                <button
                    onClick={onClose}
                    className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors"
                >
                    Close
                </button>
            </div>
        </Modal>
    );
};

export default ConsoleSetupInfoModal;
