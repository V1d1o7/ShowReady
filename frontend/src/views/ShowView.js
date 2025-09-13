import React from 'react';
import { Outlet } from 'react-router-dom';
import { useShow } from '../contexts/ShowContext';

const ShowView = () => {
    const { isLoading, showData } = useShow();

    if (isLoading || !showData) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-xl text-gray-400">Loading Show...</div>
            </div>
        );
    }

    return <Outlet />;
};

export default ShowView;

