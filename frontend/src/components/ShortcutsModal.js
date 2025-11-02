import React from 'react';
import Modal from './Modal';
import './ShortcutsModal.css';

const Shortcut = ({ action, keys }) => (
    <div className="shortcut-row">
        <span>{action}</span>
        <div className="shortcut-keys">
            {keys.map((key, index) => (
                <span key={index} className="shortcut-key">{key}</span>
            ))}
        </div>
    </div>
);

const shortcuts = {
    "General": [
        { action: 'Create new item', keys: ['N'] },
        { action: 'Close modals', keys: ['Esc'] },
        { action: 'Add', keys: ['A'] },
        { action: 'Export', keys: ['E'] },
        { action: 'Email', keys: ['M'] },
    ],
    "Hours Tracker": [
        { action: 'Open Settings modal', keys: ['S'] },
    ],
    "VLAN": [
        { action: 'Export Script', keys: ['E'] },
    ]
};

const ShortcutsModal = ({ isOpen, onClose }) => {
    const firstColumnKeys = ["General", "Hours Tracker"];
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Keyboard Shortcuts">
            <div className="shortcuts-container">
                <div className="shortcuts-column">
                    {firstColumnKeys.map(key => (
                        <div key={key} className="shortcut-section">
                            <h3>{key}</h3>
                            {shortcuts[key].map((shortcut, index) => (
                                <Shortcut key={index} action={shortcut.action} keys={shortcut.keys} />
                            ))}
                        </div>
                    ))}
                </div>
                <div className="shortcuts-column">
                    {Object.keys(shortcuts).filter(key => !firstColumnKeys.includes(key)).map(key => (
                         <div key={key} className="shortcut-section">
                            <h3>{key}</h3>
                            {shortcuts[key].map((shortcut, index) => (
                                <Shortcut key={index} action={shortcut.action} keys={shortcut.keys} />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
};

export default ShortcutsModal;
