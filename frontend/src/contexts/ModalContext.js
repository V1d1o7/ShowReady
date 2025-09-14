import React, { createContext, useState, useContext } from 'react';
import ConfirmationModal from '../components/ConfirmationModal';

const ModalContext = createContext();

export const useModal = () => useContext(ModalContext);

export const ModalProvider = ({ children }) => {
    const [modalState, setModalState] = useState({
        isOpen: false,
        message: '',
        onConfirm: () => {},
    });

    const showConfirmationModal = (message, onConfirm) => {
        setModalState({
            isOpen: true,
            message,
            onConfirm,
        });
    };

    const hideConfirmationModal = () => {
        setModalState({
            isOpen: false,
            message: '',
            onConfirm: () => {},
        });
    };

    const handleConfirm = () => {
        if (modalState.onConfirm) {
            modalState.onConfirm();
        }
        hideConfirmationModal();
    };

    return (
        <ModalContext.Provider value={{ showConfirmationModal }}>
            {children}
            {modalState.isOpen && (
                <ConfirmationModal
                    message={modalState.message}
                    onConfirm={handleConfirm}
                    onCancel={hideConfirmationModal}
                />
            )}
        </ModalContext.Provider>
    );
};
