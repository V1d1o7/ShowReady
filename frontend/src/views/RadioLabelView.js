import React, { useState, useEffect } from 'react';
import { useShow } from '../contexts/ShowContext';
import Card from '../components/Card';
import { api } from '../api/api';
import PdfPreviewModal from '../components/PdfPreviewModal';

const RadioLabelView = () => {
    const { showData, showId, onSave } = useShow();
    const [channels, setChannels] = useState({});
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);

    useEffect(() => {
        const initialChannels = {};
        for (let i = 1; i <= 16; i++) {
            initialChannels[i] = showData?.radio_channels?.[i] || '';
        }
        setChannels(initialChannels);
    }, [showData]);

    const handleChannelChange = (channelNumber, value) => {
        setChannels(prev => ({ ...prev, [channelNumber]: value }));
    };

    const handleSave = () => {
        const updatedShowData = {
            ...showData,
            radio_channels: channels,
        };
        onSave(updatedShowData);
    };
    
    const handleExportPdf = async () => {
        try {
            const blob = await api.generateRadioPdf(showId, { radio_channels: channels });
            const url = URL.createObjectURL(blob);
            setPdfPreviewUrl(url);
        } catch (e) {
            console.error("PDF generation failed", e);
        }
    };

    return (
        <>
            <Card>
                <h2 className="text-xl font-bold mb-4">Radio Channels</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from({ length: 16 }, (_, i) => i + 1).map(channelNumber => (
                        <div key={channelNumber} className="flex items-center gap-2">
                            <label className="w-20 text-right font-bold text-gray-400">Channel {channelNumber}</label>
                            <input
                                type="text"
                                value={channels[channelNumber] || ''}
                                onChange={(e) => handleChannelChange(channelNumber, e.target.value)}
                                className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                        </div>
                    ))}
                </div>
                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={handleSave} className="px-5 py-2.5 bg-blue-500 hover:bg-blue-400 rounded-lg font-bold text-white transition-colors text-sm">
                        Save Changes
                    </button>
                    <button onClick={handleExportPdf} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors text-sm">
                        Export PDF
                    </button>
                </div>
            </Card>
            <PdfPreviewModal url={pdfPreviewUrl} onClose={() => setPdfPreviewUrl(null)} />
        </>
    );
};

export default RadioLabelView;
