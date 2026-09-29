import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/api';
import toast from 'react-hot-toast';
import {
    ArrowLeft, Edit, Mail, Trash2, Phone, AlertTriangle, Plus, Lock
} from 'lucide-react';
import { LayoutContext } from '../contexts/LayoutContext';
import RosterModal from '../components/RosterModal';
import CustomFieldManagerDrawer from '../components/CustomFieldManagerDrawer';
import EmailComposeModal from '../components/EmailComposeModal';
import ConfirmationModal from '../components/ConfirmationModal';
import StatusBadge, { formatShiftsSummary } from '../components/CrewStatusBadge';

const formatCustomValue = (def, value) => {
    if (value === undefined || value === null || value === '') return null;
    if (def.field_type === 'yesno') return value ? 'Yes' : 'No';
    if (def.field_type === 'date') {
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString();
    }
    return String(value);
};

const StatTile = ({ label, value, valueClassName = 'text-white' }) => (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
        <div className={`mt-2 text-2xl font-bold ${valueClassName}`}>{value}</div>
    </div>
);

const DetailRow = ({ icon: Icon, label, value, last = false }) => (
    <div className={`flex items-center gap-3 py-2.5 ${last ? '' : 'border-b border-gray-700/50'}`}>
        <Icon size={16} className="text-gray-500 flex-shrink-0" />
        <div>
            <div className="text-[11px] text-gray-500">{label}</div>
            <div className="text-sm text-gray-200">{value || <span className="text-gray-600">&mdash;</span>}</div>
        </div>
    </div>
);

const RosterProfileView = () => {
    const { rosterId } = useParams();
    const navigate = useNavigate();
    const { setShouldScroll } = useContext(LayoutContext);
    const [data, setData] = useState(null);
    const [customFieldDefs, setCustomFieldDefs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isFieldManagerOpen, setIsFieldManagerOpen] = useState(false);
    const [isEmailOpen, setIsEmailOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState(null);

    useEffect(() => {
        setShouldScroll(true);
        return () => setShouldScroll(false);
    }, [setShouldScroll]);

    const fetchMember = useCallback(async () => {
        try {
            const detail = await api.getRosterMember(rosterId);
            setData(detail);
        } catch (error) {
            toast.error(`Failed to load profile: ${error.message}`);
            navigate('/roster');
        } finally {
            setIsLoading(false);
        }
    }, [rosterId, navigate]);

    const fetchCustomFields = useCallback(async () => {
        try {
            const defs = await api.getRosterCustomFields();
            setCustomFieldDefs(defs);
        } catch (error) {
            console.error("Failed to fetch custom fields:", error);
        }
    }, []);

    useEffect(() => {
        setIsLoading(true);
        fetchMember();
        fetchCustomFields();
    }, [fetchMember, fetchCustomFields]);

    const handleSubmitEdit = async (formData) => {
        try {
            await api.updateRosterMember(rosterId, formData);
            toast.success("Profile updated");
            fetchMember();
        } catch (error) {
            toast.error(`Failed to save: ${error.message}`);
        } finally {
            setIsEditOpen(false);
        }
    };

    const handleDelete = () => {
        setConfirmModal({
            message: `Delete ${data.first_name} ${data.last_name}? This can't be undone.`,
            onConfirm: async () => {
                try {
                    await api.deleteRosterMember(rosterId);
                    toast.success("Member deleted");
                    navigate('/roster');
                } catch (error) {
                    toast.error(error.message || "Failed to delete member");
                    setConfirmModal(null);
                }
            }
        });
    };

    const handleErase = () => {
        setConfirmModal({
            message: `Permanently erase ${data.first_name} ${data.last_name}'s personal data? Their contact info, address, and custom field values will be permanently removed. Show assignment and pay history will be kept. This can't be undone.`,
            onConfirm: async () => {
                try {
                    await api.eraseRosterMember(rosterId);
                    toast.success("Personal data erased");
                    fetchMember();
                } catch (error) {
                    toast.error(error.message || "Failed to erase member");
                } finally {
                    setConfirmModal(null);
                }
            }
        });
    };

    if (isLoading || !data) {
        return <div className="text-center py-24 text-gray-500">Loading profile...</div>;
    }

    const isErased = !!data.erased_at;
    const hasHistory = (data.assignments || []).length > 0;
    const initials = `${(data.first_name || '?')[0] || ''}${(data.last_name || '')[0] || ''}`.toUpperCase();

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">

            <Link to="/roster" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-white mb-5">
                <ArrowLeft size={16} /> Roster
            </Link>

            <div className="flex flex-wrap items-start justify-between gap-6 pb-7 border-b border-gray-700 mb-7">
                <div className="flex gap-5">
                    <div className="w-[68px] h-[68px] rounded-2xl bg-amber-500 text-black flex items-center justify-center font-bold text-2xl flex-shrink-0">
                        {initials || '—'}
                    </div>
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-2xl font-bold text-white">{data.first_name} {data.last_name}</h1>
                            {isErased ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-gray-700/50 text-gray-400 border border-gray-600">Erased</span>
                            ) : data.status === 'inactive' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-gray-700/50 text-gray-400 border border-gray-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>Inactive
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Active
                                </span>
                            )}
                        </div>
                        <div className="mt-1 text-gray-400">{data.position}</div>
                        {data.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                                {data.tags.map(tag => {
                                    const isPrivate = tag.startsWith('_');
                                    const displayName = isPrivate ? tag.substring(1) : tag;
                                    return (
                                        <span key={tag} className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${isPrivate ? 'bg-gray-800 text-gray-400 border border-gray-600' : 'bg-gray-700 text-amber-300'}`}>
                                            {displayName}
                                            {isPrivate && <Lock size={10} className="text-amber-500/80" />}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2.5">
                    {!isErased && (
                        <button onClick={() => setIsEditOpen(true)} className="flex items-center gap-2 px-4 py-2 border border-amber-500 text-amber-500 font-bold text-sm rounded-lg hover:bg-amber-500/10 transition-colors">
                            <Edit size={15} /> Edit Profile
                        </button>
                    )}
                    <button onClick={() => setIsEmailOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold text-sm rounded-lg hover:bg-blue-500 transition-colors">
                        <Mail size={15} /> Email
                    </button>
                    {!isErased && (
                        hasHistory ? (
                            <button onClick={handleErase} className="p-2.5 border border-gray-700 text-gray-500 rounded-lg hover:border-red-500 hover:text-red-500 transition-colors" title="Erase Personal Data (GDPR)">
                                <AlertTriangle size={15} />
                            </button>
                        ) : (
                            <button onClick={handleDelete} className="p-2.5 border border-gray-700 text-gray-500 rounded-lg hover:border-red-500 hover:text-red-500 transition-colors" title="Delete">
                                <Trash2 size={15} />
                            </button>
                        )
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-7">
                <StatTile label="Shows Worked" value={data.stats.shows_worked} />
                <StatTile label="Shifts Completed" value={data.stats.completed_count} />
                <StatTile label="No-Shows" value={data.stats.no_show_count} valueClassName={data.stats.no_show_count > 0 ? 'text-rose-400' : 'text-white'} />
                <StatTile label="No-Show Rate" value={`${data.stats.no_show_rate}%`} valueClassName={data.stats.no_show_rate > 0 ? 'text-rose-400' : 'text-white'} />
                <StatTile label="Accept Rate" value={`${data.stats.accept_rate}%`} valueClassName="text-emerald-400" />
                <StatTile label="Decline Rate" value={`${data.stats.decline_rate}%`} />
            </div>

            {!isErased && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-7">
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                        <h2 className="text-base font-bold text-white mb-3">Contact &amp; Details</h2>
                        <DetailRow icon={Phone} label="Phone" value={data.phone_number} />
                        <DetailRow icon={Mail} label="Email" value={data.email} last />
                    </div>

                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-base font-bold text-white">Custom Fields</h2>
                            <button onClick={() => setIsFieldManagerOpen(true)} className="flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-amber-400">
                                <Plus size={13} /> Add Field
                            </button>
                        </div>
                        {customFieldDefs.length === 0 ? (
                            <div className="text-sm text-gray-500 py-2">No custom fields defined yet.</div>
                        ) : (
                            customFieldDefs.map((def, i) => (
                                <div key={def.id} className={`flex items-center justify-between py-2.5 ${i < customFieldDefs.length - 1 ? 'border-b border-gray-700/50' : ''}`}>
                                    <div className="text-sm text-gray-400">{def.label}</div>
                                    <div className="text-sm text-white">{formatCustomValue(def, data.custom_fields?.[def.key]) ?? <span className="text-gray-600">&mdash;</span>}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-700">
                    <h2 className="text-base font-bold text-white">Assignment History</h2>
                </div>
                {data.assignments.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 text-sm">Not yet assigned to any shows.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-900/50">
                                <th className="text-left px-5 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Show</th>
                                <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Role</th>
                                <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Rate</th>
                                <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Shifts</th>
                                <th className="text-left px-5 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.assignments.map(a => (
                                <tr key={a.show_crew_id} className="border-t border-gray-700/60">
                                    <td className="px-5 py-3 text-white font-medium">
                                        <Link to={`/show/${a.show_name.replace(/\s+/g, '-')}/info`} className="hover:text-amber-400">{a.show_name}</Link>
                                    </td>
                                    <td className="px-4 py-3 text-gray-300">{a.position || '—'}</td>
                                    <td className="px-4 py-3 text-gray-300">
                                        {a.rate_type === 'daily' ? `$${a.daily_rate}/day` : a.hourly_rate ? `$${a.hourly_rate}/hr` : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-400 text-xs max-w-xs">{formatShiftsSummary(a.shifts)}</td>
                                    <td className="px-5 py-3"><StatusBadge status={a.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <RosterModal
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                onSubmit={handleSubmitEdit}
                member={data}
                allTags={data.tags || []}
                customFieldDefs={customFieldDefs}
            />
            <CustomFieldManagerDrawer
                isOpen={isFieldManagerOpen}
                onClose={() => setIsFieldManagerOpen(false)}
                fields={customFieldDefs}
                onFieldsChanged={fetchCustomFields}
            />
            <EmailComposeModal
                isOpen={isEmailOpen}
                onClose={() => setIsEmailOpen(false)}
                recipients={[data]}
                category="ROSTER"
            />
            {confirmModal && (
                <ConfirmationModal
                    message={confirmModal.message}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal(null)}
                />
            )}
        </div>
    );
};

export default RosterProfileView;
