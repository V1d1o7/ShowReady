import React, { useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Bold, Italic, Strikethrough, List, ListOrdered, Link2, Image as ImageIcon, Table as TableIcon, Code } from 'lucide-react';

const TiptapEditor = ({ value, onChange, placeholder, onEditorInstance }) => {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Link.configure({
                openOnClick: false,
                autolink: true,
                protocols: ['https', 'http', 'mailto'],
            }),
            Image,
            Table.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: value,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: 'prose dark:prose-invert prose-sm sm:prose-base max-w-none p-4 focus:outline-none min-h-[150px]',
            },
        },
    });

    useEffect(() => {
        if (editor && onEditorInstance) {
            onEditorInstance(editor);
        }
    }, [editor, onEditorInstance]);
    
    // When the external `value` prop changes, update the editor's content.
    // This is crucial for when a template is selected in the parent component.
    useEffect(() => {
        if (editor && value !== editor.getHTML()) {
            editor.commands.setContent(value);
        }
    }, [value, editor]);


    const setLink = useCallback(() => {
        if (!editor) return;
        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('URL', previousUrl);

        if (url === null) {
            return;
        }
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }, [editor]);
    
    const addImage = useCallback(() => {
        if (!editor) return;
        const url = window.prompt('URL');

        if (url) {
            editor.chain().focus().setImage({ src: url }).run();
        }
    }, [editor]);

    if (!editor) {
        return null;
    }
    
    const ToolbarButton = ({ onClick, isActive, children, disabled = false }) => (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`p-2 rounded-md ${isActive ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
            {children}
        </button>
    );

    return (
        <div className="border border-gray-700 rounded-lg bg-gray-800">
            <div className="flex flex-wrap items-center p-2 border-b border-gray-700 gap-1">
                <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} disabled={!editor.can().chain().focus().toggleBold().run()}><Bold size={16} /></ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} disabled={!editor.can().chain().focus().toggleItalic().run()}><Italic size={16} /></ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} disabled={!editor.can().chain().focus().toggleStrike().run()}><Strikethrough size={16} /></ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive('code')} disabled={!editor.can().chain().focus().toggleCode().run()}><Code size={16} /></ToolbarButton>
                <div className="w-px h-6 bg-gray-600 mx-1" />
                <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')}><List size={16} /></ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')}><ListOrdered size={16} /></ToolbarButton>
                <div className="w-px h-6 bg-gray-600 mx-1" />
                <ToolbarButton onClick={setLink} isActive={editor.isActive('link')}><Link2 size={16} /></ToolbarButton>
                <ToolbarButton onClick={addImage}><ImageIcon size={16} /></ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={16} /></ToolbarButton>
            </div>
            <EditorContent editor={editor} placeholder={placeholder} />
        </div>
    );
};

export default TiptapEditor;
