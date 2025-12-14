import React, { useCallback, useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Heading } from '@tiptap/extension-heading';

import { Bold, Italic, Strikethrough, List, ListOrdered, Link2, Image as ImageIcon, Table as TableIcon, Code, FileCode } from 'lucide-react';
import Modal from './Modal';
import InputField from './InputField';

// --- CUSTOM EXTENSIONS TO PRESERVE STYLES ---

const addStyleAttribute = (that) => ({
    ...that.parent?.(),
    style: {
        default: null,
        parseHTML: element => element.getAttribute('style'),
        renderHTML: attributes => {
            if (!attributes.style) return {};
            return { style: attributes.style };
        },
    },
});

// 1. Custom Paragraph
const CustomParagraph = Paragraph.extend({
    addAttributes() { return addStyleAttribute(this); }
});

// 2. Custom Heading
const CustomHeading = Heading.extend({
    addAttributes() { return addStyleAttribute(this); }
});

// 3. Custom Table - STRICT LOCK
const CustomTable = Table.extend({
    // FIX: Removed selectable: false. This allows the cursor to enter the table
    // structure correctly for text selection.
    draggable: false,
    atom: false, 

    addAttributes() {
        return {
            ...this.parent?.(),
            style: {
                default: null,
                parseHTML: element => element.getAttribute('style'),
                renderHTML: attributes => {
                    if (!attributes.style) return {};
                    return { style: attributes.style };
                },
            },
            cellpadding: {
                default: '0',
                parseHTML: element => element.getAttribute('cellpadding'),
                renderHTML: attributes => ({ cellpadding: attributes.cellpadding }),
            },
            cellspacing: {
                default: '0',
                parseHTML: element => element.getAttribute('cellspacing'),
                renderHTML: attributes => ({ cellspacing: attributes.cellspacing }),
            },
            width: {
                default: '100%',
                parseHTML: element => element.getAttribute('width'),
                renderHTML: attributes => ({ width: attributes.width }),
            },
            border: {
                default: '0',
                parseHTML: element => element.getAttribute('border'),
                renderHTML: attributes => ({ border: attributes.border }),
            },
            align: {
                default: null,
                parseHTML: element => element.getAttribute('align'),
                renderHTML: attributes => ({ align: attributes.align }),
            },
        };
    },
    renderHTML({ HTMLAttributes }) {
        // Force browser to ignore dragging this element
        return ['table', mergeAttributes(HTMLAttributes, { draggable: 'false' }), ['tbody', 0]];
    }
});

// 4. Custom Table Cell
const CustomTableCell = TableCell.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            style: {
                default: null,
                parseHTML: element => element.getAttribute('style'),
                renderHTML: attributes => {
                    if (!attributes.style) return {};
                    return { style: attributes.style };
                },
            },
            align: {
                default: null,
                parseHTML: element => element.getAttribute('align'),
                renderHTML: attributes => ({ align: attributes.align }),
            },
            width: {
                default: null,
                parseHTML: element => element.getAttribute('width'),
                renderHTML: attributes => ({ width: attributes.width }),
            },
            valign: {
                default: null,
                parseHTML: element => element.getAttribute('valign'),
                renderHTML: attributes => ({ valign: attributes.valign }),
            }
        };
    }
});

// 5. Custom Link
const CustomLink = Link.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            style: {
                default: null,
                parseHTML: element => element.getAttribute('style'),
                renderHTML: attributes => {
                    if (!attributes.style) return {};
                    return { style: attributes.style };
                },
            },
        };
    }
});

// 6. Div Extension - STRICT LOCK
const DivExtension = Node.create({
    name: 'div',
    group: 'block',
    content: 'block+',
    
    // FIX: Removed selectable: false.
    draggable: false,
    atom: false,

    addAttributes() {
        return {
            style: {
                default: null,
                parseHTML: element => element.getAttribute('style'),
                renderHTML: attributes => {
                    if (!attributes.style) return {};
                    return { style: attributes.style };
                },
            },
        };
    },
    parseHTML() { return [{ tag: 'div' }]; },
    renderHTML({ HTMLAttributes }) { 
        // Force browser to ignore dragging this element
        return ['div', mergeAttributes(HTMLAttributes, { draggable: 'false' }), 0]; 
    },
});

const TiptapEditor = ({ value, onChange, placeholder, onEditorInstance }) => {
    const [isSourceMode, setIsSourceMode] = useState(false);
    const [sourceCode, setSourceCode] = useState('');
    
    // Modal State
    const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
    const [urlModalType, setUrlModalType] = useState(null); 
    const [urlInputValue, setUrlInputValue] = useState('');

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                paragraph: false,
                heading: false,
                code: false, 
            }),
            CustomParagraph,
            CustomHeading,
            DivExtension,
            CustomLink.configure({
                openOnClick: false,
                autolink: true,
                protocols: ['https', 'http', 'mailto'],
            }),
            Image,
            CustomTable.configure({
                resizable: false, // Disable resizing handles
                allowTableNodeSelection: false, // Stop the table from being selected as a block
            }),
            TableRow, 
            TableHeader,
            CustomTableCell,
        ],
        content: value,
        onUpdate: ({ editor }) => {
            if (!isSourceMode) {
                onChange(editor.getHTML());
            }
        },
        editorProps: {
            attributes: {
                class: 'prose dark:prose-invert prose-sm sm:prose-base max-w-none p-4 focus:outline-none min-h-[300px] max-h-[600px] overflow-y-auto bg-gray-900 text-white',
                // Remove any default outline
                style: 'outline: none !important;',
            },
        },
    });

    useEffect(() => {
        if (editor && onEditorInstance) {
            onEditorInstance(editor);
        }
    }, [editor, onEditorInstance]);

    useEffect(() => {
        if (editor && !isSourceMode) {
            const currentContent = editor.getHTML();
            if (value !== currentContent) {
                editor.commands.setContent(value);
            }
        }
    }, [value, editor, isSourceMode]);

    const toggleSourceMode = useCallback(() => {
        if (isSourceMode) {
            editor?.commands.setContent(sourceCode);
            onChange(sourceCode);
            setIsSourceMode(false);
        } else {
            const html = editor?.getHTML() || '';
            setSourceCode(html);
            setIsSourceMode(true);
        }
    }, [editor, isSourceMode, sourceCode, onChange]);

    const handleSourceChange = (e) => {
        setSourceCode(e.target.value);
        onChange(e.target.value);
    };

    const openLinkModal = useCallback(() => {
        if (!editor) return;
        const previousUrl = editor.getAttributes('link').href;
        setUrlInputValue(previousUrl || '');
        setUrlModalType('link');
        setIsUrlModalOpen(true);
    }, [editor]);

    const openImageModal = useCallback(() => {
        if (!editor) return;
        setUrlInputValue('');
        setUrlModalType('image');
        setIsUrlModalOpen(true);
    }, [editor]);

    const handleUrlSubmit = (e) => {
        e.preventDefault();
        
        if (urlModalType === 'link') {
            if (urlInputValue === '') {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
            } else {
                editor.chain().focus().extendMarkRange('link').setLink({ href: urlInputValue }).run();
            }
        } else if (urlModalType === 'image') {
            if (urlInputValue) {
                editor.chain().focus().setImage({ src: urlInputValue }).run();
            }
        }
        setIsUrlModalOpen(false);
    };

    if (!editor) {
        return null;
    }

    const ToolbarButton = ({ onClick, isActive, children, disabled = false, title }) => (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`p-2 rounded-md ${isActive ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
            {children}
        </button>
    );

    return (
        <>
            {/* CSS Overrides to strictly enforce text-editor behavior */}
            <style>
                {`
                    /* Hide the blue "node selected" outline globally within the editor */
                    .ProseMirror-selectednode {
                        outline: none !important;
                        background-color: transparent !important;
                    }
                    
                    /* Force all structural elements to behave like text containers, NOT draggable objects */
                    .ProseMirror table, 
                    .ProseMirror tbody, 
                    .ProseMirror tr, 
                    .ProseMirror td, 
                    .ProseMirror div,
                    .ProseMirror p {
                        -webkit-user-drag: none;
                        user-drag: none;
                        user-select: text !important; 
                        cursor: text !important; /* Force text cursor so it doesn't look clickable/movable */
                    }

                    /* Remove resizing handles if they appear */
                    .column-resize-handle, .prosemirror-resize-handle {
                        display: none !important;
                        pointer-events: none !important;
                    }
                `}
            </style>

            <div className="border border-gray-700 rounded-lg bg-gray-800">
                <div className="flex flex-wrap items-center p-2 border-b border-gray-700 gap-1">
                    <ToolbarButton onClick={toggleSourceMode} isActive={isSourceMode} title="Toggle Source Code">
                        <FileCode size={16} /> 
                    </ToolbarButton>
                    
                    <div className="w-px h-6 bg-gray-600 mx-1" />

                    <div className={`flex gap-1 ${isSourceMode ? 'opacity-30 pointer-events-none' : ''}`}>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')}><Bold size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')}><Italic size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')}><Strikethrough size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive('code')}><Code size={16} /></ToolbarButton>
                        
                        <div className="w-px h-6 bg-gray-600 mx-1" />
                        
                        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')}><List size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')}><ListOrdered size={16} /></ToolbarButton>
                        
                        <div className="w-px h-6 bg-gray-600 mx-1" />
                        
                        <ToolbarButton onClick={openLinkModal} isActive={editor.isActive('link')}><Link2 size={16} /></ToolbarButton>
                        <ToolbarButton onClick={openImageModal}><ImageIcon size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={16} /></ToolbarButton>
                    </div>
                </div>

                {isSourceMode ? (
                    <textarea
                        value={sourceCode}
                        onChange={handleSourceChange}
                        className="w-full h-[300px] max-h-[600px] p-4 bg-gray-900 text-gray-100 font-mono text-sm focus:outline-none resize-y rounded-b-lg overflow-auto"
                        placeholder=""
                        spellCheck={false}
                    />
                ) : (
                    <EditorContent editor={editor} placeholder={placeholder} />
                )}
            </div>

            <Modal
                isOpen={isUrlModalOpen}
                onClose={() => setIsUrlModalOpen(false)}
                title={urlModalType === 'link' ? 'Insert Link' : 'Insert Image'}
            >
                <form onSubmit={handleUrlSubmit} className="space-y-4">
                    <InputField 
                        label={urlModalType === 'link' ? 'URL' : 'Image Address (URL)'}
                        value={urlInputValue}
                        onChange={(e) => setUrlInputValue(e.target.value)}
                        placeholder="https://example.com"
                        autoFocus
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <button 
                            type="button" 
                            onClick={() => setIsUrlModalOpen(false)} 
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-black transition-colors"
                        >
                            {urlModalType === 'link' ? 'Set Link' : 'Insert Image'}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
};

export default TiptapEditor;