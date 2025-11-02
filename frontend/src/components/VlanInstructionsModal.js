import React from 'react';
import Modal from './Modal';

const VlanInstructionsModal = ({ isOpen, onClose }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="How to Run the VLAN Script" maxWidth="max-w-2xl">
            <div className="space-y-4 text-gray-300">
                <p>To run this VLAN script, you first need to enable Hyper-V, which can be found in "Turn Windows features on or off". Your computer will need to restart.</p>
                
                <p>After rebooting, you must run PowerShell as an administrator and execute the following command to allow scripts to run:</p>
                
                <pre className="bg-gray-900 p-3 rounded-md text-amber-400 overflow-x-auto">
                    <code>Set-ExecutionPolicy -ExecutionPolicy Unrestricted</code>
                </pre>

                <p>Once scripts are enabled, navigate to the directory where you saved the file (e.g., your Downloads folder) using the `cd` command:</p>
                 <pre className="bg-gray-900 p-3 rounded-md text-amber-400 overflow-x-auto">
                    <code>cd $HOME/Downloads</code>
                </pre>
                
                <p>Finally, execute the script by typing its name:</p>
                
                <pre className="bg-gray-900 p-3 rounded-md text-amber-400 overflow-x-auto">
                    <code>./vlan_setup.ps1</code>
                </pre>
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

export default VlanInstructionsModal;