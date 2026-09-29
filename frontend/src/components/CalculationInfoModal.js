import React from 'react';
import Modal from './Modal';

const CalculationInfoModal = ({ isOpen, onClose, dailyThreshold }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="How Daily Pay is Calculated">
            <div className="text-gray-300 space-y-4 p-4">
                <p><strong className="font-bold text-white">Day Rates take priority:</strong> A Day Rate covers the first {dailyThreshold} hours of work on any given day.</p>
                <p><strong className="font-bold text-white">Concurrent Hourly Work:</strong> If a person works an Hourly role on the same day as a Day Rate role, those hours are included in the Day Rate fee (up to the {dailyThreshold}-hour mark). They are not paid separately unless they exceed that limit.</p>
                <p><strong className="font-bold text-white">Daily Overtime:</strong> Any work performed after {dailyThreshold} hours is paid as Overtime (1.5x the hourly rate).</p>
                <p className="text-sm text-gray-400 italic mt-4">Note: Only hours worked in "Hourly" positions count toward the Weekly Overtime threshold.</p>
                <p><strong className="font-bold text-white">Schedule Auto-fill:</strong> If a crew member has a scheduled shift with both a call time and an end time, their hours for that day are pre-filled automatically — the raw duration minus whatever unpaid break your show's Break Rules call for (configured alongside these OT settings). A shift with no end time yet is left blank. Auto-filled hours are just a starting point: type over them and save to make your own entry stick.</p>
            </div>
        </Modal>
    );
};

export default CalculationInfoModal;
