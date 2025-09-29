import React, { useState, useEffect } from 'react';
import Modal from './Modal';

const FeedbackModal = ({ isOpen, onClose, onSubmit }) => {
    const [feedbackType, setFeedbackType] = useState('UI Issue');
    const [feedback, setFeedback] = useState('');

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ feedback_type: feedbackType, feedback });
        // Reset state for the next time the modal is opened
        setFeedbackType('UI Issue');
        setFeedback('');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Submit Feedback">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="feedbackType" className="block text-sm font-medium text-gray-300">
                        Feedback Type
                    </label>
                    <select
                        id="feedbackType"
                        value={feedbackType}
                        onChange={(e) => setFeedbackType(e.target.value)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm rounded-md bg-gray-700 text-white"
                    >
                        <option>UI Issue</option>
                        <option>Bug</option>
                        <option>Feature Request</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="feedback" className="block text-sm font-medium text-gray-300">
                        Feedback
                    </label>
                    <textarea
                        id="feedback"
                        rows="4"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm rounded-md bg-gray-700 text-white"
                        required
                    />
                </div>
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold">
                        Cancel
                    </button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black">
                        Submit
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default FeedbackModal;