import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '../api/api';
import Card from '../components/Card';
import InputField from '../components/InputField';

const AdvancedSSOView = ({ onBack }) => {
    const [ssoConfig, setSsoConfig] = useState({ provider: 'authentik', config: { url: '', client_id: '', client_secret: '' } });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchSsoConfig = async () => {
            try {
                const data = await api.getSsoConfig();
                if (data && data.config) {
                    setSsoConfig(data);
                }
            } catch (error) {
                console.error("Failed to fetch SSO config:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSsoConfig();
    }, []);

    const handleConfigChange = (e) => {
        setSsoConfig(prev => ({
            ...prev,
            config: { ...prev.config, [e.target.name]: e.target.value }
        }));
    };

    const handleSaveChanges = async () => {
        try {
            await api.updateSsoConfig(ssoConfig);
            alert("SSO Configuration Saved!");
        } catch (error) {
            alert(`Failed to save SSO config: ${error.message}`);
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen"><div className="text-xl text-gray-400">Loading SSO Config...</div></div>;
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
            <header className="flex items-center justify-between pb-6 mb-6 border-b border-gray-700">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-700 transition-colors"><ArrowLeft size={20} /></button>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">Advanced SSO Setup</h1>
                </div>
            </header>
            <main>
                <Card>
                    <h3 className="text-lg font-bold mb-4 text-white">Authentik Configuration</h3>
                    <div className="space-y-4">
                        <InputField label="Authentik Server URL" name="url" value={ssoConfig.config.url || ''} onChange={handleConfigChange} placeholder="https://authentik.yourcompany.com" />
                        <InputField label="Client ID" name="client_id" value={ssoConfig.config.client_id || ''} onChange={handleConfigChange} />
                        <InputField label="Client Secret" name="client_secret" type="password" value={ssoConfig.config.client_secret || ''} onChange={handleConfigChange} />
                    </div>
                    <div className="mt-6 flex justify-end">
                        <button onClick={handleSaveChanges} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors"><Save size={16} /> Save Configuration</button>
                    </div>
                </Card>
            </main>
        </div>
    );
};

export default AdvancedSSOView;