import React from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from '../components/AdminSidebar';

const AdminLayout = () => {
    return (
        <div className="flex h-full">
            <AdminSidebar />
            <main className="flex-grow p-8 bg-gray-900 text-white">
                <Outlet />
            </main>
        </div>
    );
};

export default AdminLayout;
