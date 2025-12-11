import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/api';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useModal } from '../contexts/ModalContext';
import { X, MessageSquare, Trash2, Edit, CheckSquare, Square } from 'lucide-react';
import toast from 'react-hot-toast';

const ContextualNotesDrawer = ({ entityType, entityId, showId, isOpen, onClose, isOwner = false }) => {
    const { user, permitted_features } = useAuth();
    const { showConfirmationModal } = useModal();
    const [notes, setNotes] = useState([]);
    const [newNoteContent, setNewNoteContent] = useState('');
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [editingContent, setEditingContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const fetchNotes = useCallback(async () => {
        if (!entityId || !entityType) {
            setNotes([]);
            return;
        }
        setIsLoading(true);
        try {
            const fetchedNotes = await api.getNotesForEntity(entityType, entityId, showId);
            setNotes(fetchedNotes);
        } catch (error) {
            console.error('Failed to fetch notes:', error);
            toast.error('Failed to load notes.');
        } finally {
            setIsLoading(false);
        }
    }, [entityType, entityId, showId]);

    useEffect(() => {
        if (isOpen) {
            fetchNotes();
        }
    }, [isOpen, fetchNotes]);

    const handleCreateNote = async () => {
        if (!newNoteContent.trim()) {
            toast.error("Note content cannot be empty.");
            return;
        }
        try {
            const noteData = {
                parent_entity_id: String(entityId),
                parent_entity_type: entityType,
                content: newNoteContent,
            };
            if (showId) {
                noteData.show_id = showId;
            }
            const newNote = await api.createNote(noteData);
            setNotes([newNote, ...notes]);
            setNewNoteContent('');
            toast.success('Note added!');
        } catch (error) {
            console.error('Failed to create note:', error);
            toast.error('Failed to add note.');
        }
    };

    const handleDeleteNote = (noteId) => {
        showConfirmationModal(
            "Are you sure you want to delete this note?",
            async () => {
                try {
                    await api.deleteNote(noteId);
                    setNotes(notes.filter(note => note.id !== noteId));
                    toast.success('Note deleted!');
                } catch (error) {
                    console.error('Failed to delete note:', error);
                    toast.error('Failed to delete note.');
                }
            }
        );
    };

    const handleUpdateNote = async (noteId) => {
        if (!editingContent.trim()) {
            toast.error("Note content cannot be empty.");
            return;
        }
        try {
            const updatedNote = await api.updateNote(noteId, { content: editingContent });
            setNotes(notes.map(note => note.id === noteId ? updatedNote : note));
            setEditingNoteId(null);
            setEditingContent('');
            toast.success('Note updated!');
        } catch (error) {
            console.error('Failed to update note:', error);
            toast.error('Failed to update note.');
        }
    };

    const handleToggleResolve = async (note) => {
        try {
            const updatedNote = await api.updateNote(note.id, { is_resolved: !note.is_resolved });
            setNotes(notes.map(n => n.id === note.id ? updatedNote : n));
            toast.success(`Note ${updatedNote.is_resolved ? 'resolved' : 'unresolved'}!`);
        } catch (error) {
            console.error('Failed to update note status:', error);
            toast.error('Failed to update note status.');
        }
    };
    
    const startEditing = (note) => {
        setEditingNoteId(note.id);
        setEditingContent(note.content);
    };

    const cancelEditing = () => {
        setEditingNoteId(null);
        setEditingContent('');
    };

    return (
        <div className={`fixed top-0 right-0 h-full bg-gray-800 text-white shadow-lg transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} w-96 z-50 flex flex-col`}>
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold flex items-center">
                    <MessageSquare className="mr-2" />
                    Contextual Notes
                </h2>
                <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
                    <X />
                </button>
            </div>
            
            <div className="p-4 flex flex-col">
                <textarea
                    className="w-full p-2 bg-gray-700 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows="3"
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Add a new note..."
                ></textarea>
                <button
                    onClick={handleCreateNote}
                    className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded self-end"
                >
                    Add Note
                </button>
            </div>

            <div className="flex-grow overflow-y-auto p-4 space-y-4">
                {isLoading ? (
                    <p>Loading notes...</p>
                ) : notes.length > 0 ? (
                    notes.map(note => (
                        <div key={note.id} className="bg-gray-700 p-3 rounded">
                            {editingNoteId === note.id ? (
                                <>
                                    <textarea
                                        className="w-full p-2 bg-gray-600 rounded border border-gray-500"
                                        rows="3"
                                        value={editingContent}
                                        onChange={(e) => setEditingContent(e.target.value)}
                                    ></textarea>
                                    <div className="mt-2 flex justify-end space-x-2">
                                        <button onClick={cancelEditing} className="px-3 py-1 bg-gray-500 hover:bg-gray-600 rounded">Cancel</button>
                                        <button onClick={() => handleUpdateNote(note.id)} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded">Save</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="text-sm text-gray-400">
                                        {note.user_first_name} {note.user_last_name} - {new Date(note.created_at).toLocaleString()}
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap">{note.content}</p>
                                    <div className="mt-2 flex items-center justify-end space-x-2">
                                        <button onClick={() => handleToggleResolve(note)} title={note.is_resolved ? 'Mark as unresolved' : 'Mark as resolved'}>
                                            {note.is_resolved ? <CheckSquare className="text-green-400" /> : <Square className="text-gray-400" />}
                                        </button>
                                        {((user && note.user_id === user.id) || isOwner || permitted_features.includes('notes_edit')) && (
                                            <button onClick={() => startEditing(note)} title="Edit Note" className="hover:text-yellow-400">
                                                <Edit size={16} />
                                            </button>
                                        )}
                                        {((user && note.user_id === user.id) || isOwner || permitted_features.includes('notes_delete')) && (
                                            <button onClick={() => handleDeleteNote(note.id)} title="Delete Note" className="hover:text-red-400">
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    ))
                ) : (
                    <p>No notes for this item yet.</p>
                )}
            </div>
        </div>
    );
};

export default ContextualNotesDrawer;