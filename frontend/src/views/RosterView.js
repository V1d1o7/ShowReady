//
import React, { useState, useEffect, useMemo, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { Plus, Edit, Trash2, Mail, HelpCircle, Lock, SlidersHorizontal, Settings2, ChevronDown, Check, Pin } from 'lucide-react';
import toast from 'react-hot-toast';
import { LayoutContext } from '../contexts/LayoutContext';
import useHotkeys from '../hooks/useHotkeys';
import RosterModal from '../components/RosterModal';
import CustomFieldManagerDrawer from '../components/CustomFieldManagerDrawer';
import EmailComposeModal from '../components/EmailComposeModal';
import ConfirmationModal from '../components/ConfirmationModal';
import InputField from '../components/InputField';
import ShortcutsModal from '../components/ShortcutsModal';

const BASE_COLUMNS = [
    { key: 'position', label: 'Position', default: true },
    { key: 'tags', label: 'Tags', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'email', label: 'Email', default: true },
    { key: 'phone_number', label: 'Phone', default: false },
];

const formatCustomValue = (def, value) => {
    if (value === undefined || value === null || value === '') return <span className="text-gray-600">&mdash;</span>;
    if (def.field_type === 'yesno') {
        return value ? <span className="text-emerald-400 font-medium">Yes</span> : <span className="text-gray-500">No</span>;
    }
    if (def.field_type === 'date') {
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString();
    }
    return String(value);
};

const RosterView = () => {
    const navigate = useNavigate();
    const { setShouldScroll } = useContext(LayoutContext);
    const [roster, setRoster] = useState([]);
    const [customFieldDefs, setCustomFieldDefs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
    const [filterText, setFilterText] = useState('');
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
    const [isFieldManagerOpen, setIsFieldManagerOpen] = useState(false);
    const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
    const [isHeaderFrozen, setIsHeaderFrozen] = useState(true);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [visibleColumns, setVisibleColumns] = useState(() =>
        Object.fromEntries(BASE_COLUMNS.map(c => [c.key, c.default]))
    );
    const selectAllRef = useRef(null);

    useEffect(() => {
        setShouldScroll(false);
    }, [setShouldScroll]);

    const fetchCustomFields = async () => {
        try {
            const defs = await api.getRosterCustomFields();
            setCustomFieldDefs(defs);
            setVisibleColumns(prev => {
                const next = { ...prev };
                defs.forEach(def => {
                    const colKey = `custom:${def.key}`;
                    if (!(colKey in next)) next[colKey] = false;
                });
                return next;
            });
        } catch (error) {
            console.error("Failed to fetch custom fields:", error);
        }
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const rosterData = await api.getRoster();
            setRoster(rosterData);
        } catch (error) {
            console.error("Failed to fetch roster data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        fetchCustomFields();
    }, []);

    const columnDropdownList = useMemo(() => [
        ...BASE_COLUMNS.map(c => ({ key: c.key, label: c.label })),
        ...customFieldDefs.map(def => ({ key: `custom:${def.key}`, label: def.label })),
    ], [customFieldDefs]);

    const toggleColumn = (key) => {
        setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const allTags = useMemo(() => {
        const tags = new Set();
        roster.forEach(member => {
            if (member.tags) {
                member.tags.forEach(tag => {
                    const cleanTag = tag.startsWith('_') ? tag.substring(1) : tag;
                    tags.add(cleanTag);
                });
            }
        });
        return Array.from(tags);
    }, [roster]);

    const filteredRoster = useMemo(() => {
        if (!filterText) {
            return roster;
        }
        const search = filterText.toLowerCase();
        return roster.filter(member => {
            const fullName = `${member.first_name || ''} ${member.last_name || ''}`.toLowerCase();
            const hasMatchingTag = member.tags && member.tags.some(tag => {
                const cleanTag = tag.startsWith('_') ? tag.substring(1) : tag;
                return cleanTag.toLowerCase().includes(search);
            });
            const hasMatchingBasicField = [member.position, member.email, member.phone_number, member.status]
                .some(value => value && String(value).toLowerCase().includes(search));
            const hasMatchingCustomField = member.custom_fields && Object.values(member.custom_fields)
                .some(value => value !== null && value !== undefined && String(value).toLowerCase().includes(search));
            return fullName.includes(search) || hasMatchingTag || hasMatchingBasicField || hasMatchingCustomField;
        });
    }, [roster, filterText]);

    // Selection persists across search terms so different filters can be combined.
    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const areAllVisibleSelected = filteredRoster.length > 0 && filteredRoster.every(m => selectedIds.has(m.id));
    const isSomeVisibleSelected = !areAllVisibleSelected && filteredRoster.some(m => selectedIds.has(m.id));

    useEffect(() => {
        if (selectAllRef.current) {
            selectAllRef.current.indeterminate = isSomeVisibleSelected;
        }
    }, [isSomeVisibleSelected]);

    const toggleSelectAllVisible = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (areAllVisibleSelected) {
                filteredRoster.forEach(m => next.delete(m.id));
            } else {
                filteredRoster.forEach(m => next.add(m.id));
            }
            return next;
        });
    };

    const selectedMembers = useMemo(() => roster.filter(m => selectedIds.has(m.id)), [roster, selectedIds]);

    const handleOpenModal = (member = null) => {
        setEditingMember(member);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditingMember(null);
        setIsModalOpen(false);
    };

    const handleSubmitModal = async (formData) => {
        try {
            if (editingMember) {
                await api.updateRosterMember(editingMember.id, formData);
                toast.success("Member updated successfully");
            } else {
                await api.createRosterMember(formData);
                toast.success("Member created successfully");
            }
            fetchData();
        } catch (error) {
            console.error("Failed to save roster member:", error);
            toast.error(`Failed to save member: ${error.message}`);
        } finally {
            handleCloseModal();
        }
    };

    const handleDeleteMember = (member) => {
        setConfirmModal({
            isOpen: true,
            message: `Are you sure you want to delete ${member.first_name} ${member.last_name}?`,
            onConfirm: async () => {
                try {
                    await api.deleteRosterMember(member.id);
                    toast.success("Member deleted successfully");
                    fetchData();
                } catch (error) {
                    console.error("Failed to delete roster member:", error);
                    toast.error(error.message || "Failed to delete member");
                } finally {
                    setConfirmModal({ isOpen: false, message: '', onConfirm: null });
                }
            }
        });
    };

    const handleEmailRoster = () => {
        if (selectedMembers.length > 0) {
            setIsEmailModalOpen(true);
        } else {
            toast.error("Select at least one roster member to email.");
        }
    };

    useHotkeys({
        'n': () => handleOpenModal(),
        'm': handleEmailRoster
    });

    const headerCellClass = `px-3 py-3.5 text-left text-sm font-semibold text-white ${isHeaderFrozen ? 'sticky top-0 z-10 bg-gray-800' : ''}`;

    return (
        <div className="h-full flex flex-col p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto w-full">

            <header className="flex-shrink-0 flex flex-wrap items-center justify-between gap-4 pb-8 border-b border-gray-700">
                <h1 className="text-3xl font-bold text-white">Global Roster</h1>
                <div className="flex flex-wrap items-center gap-3">
                    <InputField
                        placeholder="Search roster..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                    />
                    <div className="relative">
                        <button
                            onClick={() => setIsViewMenuOpen(prev => !prev)}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 font-semibold rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            <SlidersHorizontal size={16} /> View <ChevronDown size={14} />
                        </button>
                        {isViewMenuOpen && (
                            <div className="absolute top-11 right-0 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-1.5 z-30">
                                <div
                                    onClick={() => setIsHeaderFrozen(prev => !prev)}
                                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer hover:bg-gray-700 text-sm text-gray-200"
                                >
                                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${isHeaderFrozen ? 'bg-amber-500 border-amber-500' : 'border-gray-600'}`}>
                                        {isHeaderFrozen && <Check size={11} className="text-black" strokeWidth={3} />}
                                    </div>
                                    <Pin size={14} className="text-gray-400" /> Freeze Header Row
                                </div>

                                <button
                                    onClick={() => { setIsFieldManagerOpen(true); setIsViewMenuOpen(false); }}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-gray-700 text-sm text-gray-200 text-left"
                                >
                                    <Settings2 size={14} className="text-gray-400" /> Manage Custom Fields
                                </button>

                                <div className="my-1.5 border-t border-gray-700"></div>

                                <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">Visible Columns</div>
                                {columnDropdownList.map(col => (
                                    <div
                                        key={col.key}
                                        onClick={() => toggleColumn(col.key)}
                                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-gray-700 text-sm text-gray-200"
                                    >
                                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${visibleColumns[col.key] ? 'bg-amber-500 border-amber-500' : 'border-gray-600'}`}>
                                            {visibleColumns[col.key] && <Check size={11} className="text-black" strokeWidth={3} />}
                                        </div>
                                        {col.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <button onClick={handleEmailRoster} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-500 transition-colors">
                        <Mail size={18} /> Email{selectedMembers.length > 0 ? ` (${selectedMembers.length})` : ''}
                    </button>
                    <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors">
                        <Plus size={18} /> New Member
                    </button>
                </div>
            </header>
            <main className="mt-8 flex-1 min-h-0 flex flex-col">
                {isLoading ? (
                    <div className="text-center py-16 text-gray-500">Loading roster...</div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-gray-800">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-800">
                                <tr>
                                    <th className={`py-3.5 pl-4 pr-2 w-10 ${isHeaderFrozen ? 'sticky top-0 z-10 bg-gray-800' : ''}`}>
                                        <input
                                            ref={selectAllRef}
                                            type="checkbox"
                                            checked={areAllVisibleSelected}
                                            onChange={toggleSelectAllVisible}
                                            className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                                            title="Select all visible"
                                        />
                                    </th>
                                    <th className={`py-3.5 pl-1 pr-3 text-left text-sm font-semibold text-white sm:pl-2 ${isHeaderFrozen ? 'sticky top-0 z-10 bg-gray-800' : ''}`}>Name</th>
                                    {columnDropdownList.filter(c => visibleColumns[c.key]).map(col => (
                                        <th key={col.key} className={headerCellClass}>{col.label}</th>
                                    ))}
                                    <th className={`relative py-3.5 pl-3 pr-4 sm:pr-6 ${isHeaderFrozen ? 'sticky top-0 z-10 bg-gray-800' : ''}`}><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 bg-gray-900">
                                {filteredRoster.map(member => (
                                    <tr
                                        key={member.id}
                                        onClick={() => navigate(`/roster/${member.id}`)}
                                        className="cursor-pointer hover:bg-gray-800/60 transition-colors"
                                    >
                                        <td className="py-4 pl-4 pr-2" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(member.id)}
                                                onChange={() => toggleSelect(member.id)}
                                                className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                                            />
                                        </td>
                                        <td className="py-4 pl-1 pr-3 text-sm font-medium text-white sm:pl-2">
                                            {`${member.first_name || ''} ${member.last_name || ''}`}
                                        </td>
                                        {visibleColumns.position && (
                                            <td className="px-3 py-4 text-sm text-gray-300">{member.position}</td>
                                        )}
                                        {visibleColumns.tags && (
                                            <td className="px-3 py-4 text-sm text-gray-300">
                                                <div className="flex flex-wrap gap-1">
                                                    {member.tags?.map(tag => {
                                                        const isPrivate = tag.startsWith('_');
                                                        const displayName = isPrivate ? tag.substring(1) : tag;
                                                        return (
                                                            <span
                                                                key={tag}
                                                                className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                                                                    isPrivate
                                                                        ? 'bg-gray-800 text-gray-400 border border-gray-600'
                                                                        : 'bg-gray-700 text-amber-300'
                                                                }`}
                                                                title={isPrivate ? "Private Tag (Internal Only)" : "Public Tag"}
                                                            >
                                                                {displayName}
                                                                {isPrivate && <Lock size={10} className="text-amber-500/80" />}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                        )}
                                        {visibleColumns.status && (
                                            <td className="px-3 py-4 text-sm">
                                                {member.erased_at ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-gray-700/50 text-gray-400 border border-gray-600">Erased</span>
                                                ) : member.status === 'inactive' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-gray-700/50 text-gray-400 border border-gray-600">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>Inactive
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Active
                                                    </span>
                                                )}
                                            </td>
                                        )}
                                        {visibleColumns.email && (
                                            <td className="px-3 py-4 text-sm text-gray-300">{member.email}</td>
                                        )}
                                        {visibleColumns.phone_number && (
                                            <td className="px-3 py-4 text-sm text-gray-300">{member.phone_number}</td>
                                        )}
                                        {customFieldDefs.map(def => (
                                            visibleColumns[`custom:${def.key}`] && (
                                                <td key={def.id} className="px-3 py-4 text-sm text-gray-300">
                                                    {formatCustomValue(def, member.custom_fields?.[def.key])}
                                                </td>
                                            )
                                        ))}
                                        <td className="py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6" onClick={(e) => e.stopPropagation()}>
                                            <button onClick={() => handleOpenModal(member)} className="p-1 text-gray-400 hover:text-amber-400"><Edit size={16} /></button>
                                            <button onClick={() => handleDeleteMember(member)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredRoster.length === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                No members found matching "{filterText}"
                            </div>
                        )}
                    </div>
                )}
            </main>

            <button
                onClick={() => setIsShortcutsModalOpen(true)}
                className="fixed bottom-6 left-6 p-3 bg-gray-800 text-gray-400 hover:text-white rounded-full shadow-lg border border-gray-700 transition-colors z-50 hover:bg-gray-700"
                title="Shortcuts"
            >
                <HelpCircle size={24} />
            </button>

            <RosterModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSubmit={handleSubmitModal}
                member={editingMember}
                allTags={allTags}
                customFieldDefs={customFieldDefs}
            />
            <CustomFieldManagerDrawer
                isOpen={isFieldManagerOpen}
                onClose={() => setIsFieldManagerOpen(false)}
                fields={customFieldDefs}
                onFieldsChanged={fetchCustomFields}
            />
            <EmailComposeModal
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                recipients={selectedMembers}
                category="ROSTER"
            />
            <ShortcutsModal
                isOpen={isShortcutsModalOpen}
                onClose={() => setIsShortcutsModalOpen(false)}
            />
            {confirmModal.isOpen && (
                <ConfirmationModal
                    message={confirmModal.message}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal({ isOpen: false, message: '', onConfirm: null })}
                />
            )}
        </div>
    );
};

export default RosterView;
