import React from 'react';
import { Outlet } from 'react-router-dom';
import ShowSidebar from '../components/ShowSidebar';

const ShowLayout = () => {
    return (
        <div className="flex h-full">
            <ShowSidebar />
            <main className="flex-grow p-8 bg-gray-900 text-white">
                <Outlet />
            </main>
        </div>
    );
};

export default ShowLayout;