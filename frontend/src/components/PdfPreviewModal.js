import React, { useEffect } from 'react';
import { X, Download } from 'lucide-react';

const PdfPreviewModal = ({ url, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (url) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [url, onClose]);

  if (!url) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col border border-gray-700">
        <header className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">PDF Preview</h2>
          <div className="flex items-center gap-4">
            <a href={url} download="labels.pdf" className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors">
              <Download size={16}/> Download
            </a>
            <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24}/></button>
          </div>
        </header>
        <div className="flex-grow p-4">
          <iframe src={url} title="PDF Preview" className="w-full h-full border-0 rounded-lg"></iframe>
        </div>
      </div>
    </div>
  );
};

export default PdfPreviewModal;