import React, { useState, useEffect } from 'react';
import { X, List, Grid3x3 } from 'lucide-react';
import Modal from './Modal';

const AdvancedPrintModal = ({ isOpen, onClose, labels, onGeneratePdf, numSlots, pdfType }) => {
    const [printSlots, setPrintSlots] = useState(Array(numSlots).fill(null));
    const [draggedItem, setDraggedItem] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setPrintSlots(Array(numSlots).fill(null));
        }
    }, [isOpen, numSlots]);

    const handleDragStart = (e, item) => {
        setDraggedItem(item);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e, slotIndex) => {
        e.preventDefault();
        if (draggedItem) {
            const newSlots = [...printSlots];
            const oldIndex = newSlots.findIndex(item => item && item.originalIndex === draggedItem.originalIndex);
            if(oldIndex > -1) newSlots[oldIndex] = null;
            newSlots[slotIndex] = draggedItem;
            setPrintSlots(newSlots);
            setDraggedItem(null);
        }
    };

    const removeFromSlot = (slotIndex) => {
        const newSlots = [...printSlots];
        newSlots[slotIndex] = null;
        setPrintSlots(newSlots);
    };

    const handleGenerate = () => {
        const placement = {};
        printSlots.forEach((item, slotIndex) => {
            if (item) {
                placement[slotIndex] = item.originalIndex;
            }
        });
        onGeneratePdf(placement);
        onClose();
    };

    const title = pdfType === 'case' ? "Advanced Case Label Print" : "Advanced Loom Label Print";
    const slotText = pdfType === 'case' ? 'Page Side' : 'Slot';
    const gridCols = pdfType === 'case' ? 'grid-cols-1' : 'grid-cols-3';
    const slotHeight = pdfType === 'case' ? 'h-40' : 'h-20';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-4xl">
            <div className="grid grid-cols-3 gap-6 h-[60vh]">
                <div className="col-span-1 bg-gray-900/50 p-4 rounded-lg overflow-y-auto">
                    <h3 className="font-bold mb-4 text-white flex items-center gap-2"><List size={16}/> Available Labels</h3>
                    <div className="space-y-2">
                        {labels.map((label, index) => (
                            <div
                                key={index}
                                draggable
                                onDragStart={(e) => handleDragStart(e, { ...label, originalIndex: index })}
                                className={`p-2 rounded-md text-sm cursor-grab ${printSlots.some(s => s && s.originalIndex === index) ? 'bg-gray-700 text-gray-500' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                                {label.loom_name || label.send_to}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="col-span-2 bg-gray-900/50 p-4 rounded-lg overflow-y-auto">
                    <h3 className="font-bold mb-4 text-white flex items-center gap-2"><Grid3x3 size={16}/> Print Sheet ({numSlots} Slots)</h3>
                    <div className={`grid ${gridCols} gap-4`}>
                        {printSlots.map((item, index) => (
                            <div
                                key={index}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, index)}
                                className={`relative ${slotHeight} border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-center p-2 drag-over-target`}
                            >
                                {item ? (
                                    <>
                                        <span className="text-xs text-gray-300">{item.loom_name || item.send_to}</span>
                                        <button onClick={() => removeFromSlot(index)} className="absolute top-1 right-1 text-gray-500 hover:text-red-400">
                                            <X size={12} />
                                        </button>
                                    </>
                                ) : (
                                    <span className="text-xs text-gray-500">{slotText} {index + 1}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-200 transition-colors">Cancel</button>
                <button type="button" onClick={handleGenerate} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors">Generate PDF</button>
            </div>
        </Modal>
    );
};

export default AdvancedPrintModal;