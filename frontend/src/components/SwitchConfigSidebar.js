import React, { useState, useEffect, useContext } from 'react';
import { useShow } from '../contexts/ShowContext';
import { api } from '../api/api';
import Card from './Card';
import { HardDrive, PlusCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const SwitchConfigSidebar = ({ onSelectSwitch }) => {
    const { showId } = useShow();
    const [rackGroups, setRackGroups] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(null); // Tracks which item is being created

    const fetchSwitches = async () => {
        if (!showId) return;
        setIsLoading(true);
        try {
            const data = await api.getConfigurableSwitches(showId);
            setRackGroups(data);
        } catch (error) {
            console.error("Failed to fetch configurable switches:", error);
            toast.error("Could not load switch list.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSwitches();
    }, [showId]);

    const handleNewConfig = async (rackItemId) => {
        setIsCreating(rackItemId);
        try {
            await api.createSwitchConfig(rackItemId);
            toast.success("New switch configuration created!");
            // Refetch the list to update the UI
            fetchSwitches();
        } catch (error) {
            console.error("Failed to create new config:", error);
            toast.error(`Error: ${error.message}`);
        } finally {
            setIsCreating(null);
        }
    };

    if (isLoading) {
        return <Card><p>Loading switches...</p></Card>;
    }

    return (
        <Card className="h-full flex flex-col">
            <h2 className="text-xl font-bold mb-4 flex-shrink-0">Configurable Switches</h2>
            <div className="overflow-y-auto flex-grow">
                {rackGroups.length === 0 ? (
                    <p className="text-gray-400 text-sm">No configurable switches found in this show's racks.</p>
                ) : (
                    <ul className="space-y-4">
                        {rackGroups.map(rack => (
                            <li key={rack.rack_id}>
                                <h3 className="font-bold text-amber-400 mb-2">{rack.rack_name}</h3>
                                <ul className="space-y-1">
                                    {rack.items.map(item => (
                                        <li key={item.rack_item_id}>
                                            {item.switch_config_id ? (
                                                <button 
                                                    onClick={() => onSelectSwitch(item)}
                                                    className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700 transition-colors"
                                                >
                                                    <HardDrive className="text-blue-400" size={18} />
                                                    <span>{item.switch_name}</span>
                                                </button>
                                            ) : (
                                                <div className="flex items-center justify-between p-2 rounded-lg bg-gray-800/50">
                                                    <span className="text-gray-400">{item.switch_name}</span>
                                                    <button 
                                                        onClick={() => handleNewConfig(item.rack_item_id)}
                                                        disabled={isCreating === item.rack_item_id}
                                                        className="flex items-center gap-1.5 text-sm text-green-400 hover:text-green-300 disabled:opacity-50"
                                                    >
                                                        <PlusCircle size={16} />
                                                        {isCreating === item.rack_item_id ? 'Creating...' : 'New Config'}
                                                    </button>
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Card>
    );
};

export default SwitchConfigSidebar;
