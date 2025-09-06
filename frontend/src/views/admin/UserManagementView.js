import React, { useState, useEffect } from 'react';
import { api } from '../../api/api';
import Card from '../../components/Card';
import toast, { Toaster } from 'react-hot-toast';

const UserManagementView = () => {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        api.getAllUsers()
            .then(setUsers)
            .catch(err => {
                toast.error("Failed to fetch users.");
                console.error(err);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, []);

    if (isLoading) {
        return <div className="p-8 text-center text-gray-400">Loading User Management...</div>;
    }

    return (
        <>
            <Toaster position="bottom-center" />
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6">User Management</h1>
            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3">User</th>
                                <th scope="col" className="px-6 py-3">Roles</th>
                                <th scope="col" className="px-6 py-3">Status</th>
                                <th scope="col" className="px-6 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id} className="bg-gray-800 border-b border-gray-700 hover:bg-gray-700">
                                    <td className="px-6 py-4 font-medium text-white">
                                        {user.first_name} {user.last_name}
                                        <div className="text-xs text-gray-500">{user.email}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {user.roles.map(role => (
                                                <span key={role} className="bg-gray-600 text-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full">{role}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {user.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button className="font-medium text-amber-500 hover:underline mr-4">Edit Roles</button>
                                        <button className="font-medium text-red-500 hover:underline">Suspend</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </>
    );
};

export default UserManagementView;
