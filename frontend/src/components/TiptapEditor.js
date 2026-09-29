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
import { TextStyle, Color } from '@tiptap/extension-text-style';
import { TextAlign } from '@tiptap/extension-text-align';

import {
    Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, Link2,
    Image as ImageIcon, Table as TableIcon, Code, FileCode, Heading1, Heading2, Heading3,
    Pilcrow, Quote, Minus, Undo2, Redo2, Eraser, Palette, AlignLeft, AlignCenter, AlignRight
} from 'lucide-react';
import Modal from './Modal';
import InputField from './InputField';

// Brand swatches matching the default email template color scheme (see communications.py)
const COLOR_SWATCHES = [
    { label: 'White', value: '#F9FAFB' },
    { label: 'Light Gray', value: '#D1D5DB' },
    { label: 'Muted Gray', value: '#9CA3AF' },
    { label: 'Teal', value: '#14B8A6' },
    { label: 'Blue', value: '#3B82F6' },
    { label: 'Amber', value: '#F59E0B' },
    { label: 'Red', value: '#EF4444' },
];

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
    const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                paragraph: false,
                heading: false,
                code: false,
                link: false, // FIX: Disable StarterKit's link extension to avoid duplicate warning
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
            TextStyle,
            Color,
            TextAlign.configure({
                types: ['paragraph', 'heading'],
            }),
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

    const applyColor = useCallback((color) => {
        editor.chain().focus().setColor(color).run();
        setIsColorMenuOpen(false);
    }, [editor]);

    const clearColor = useCallback(() => {
        editor.chain().focus().unsetColor().run();
        setIsColorMenuOpen(false);
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

                    <div className={`flex flex-wrap items-center gap-1 ${isSourceMode ? 'opacity-30 pointer-events-none' : ''}`}>
                        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo"><Undo2 size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo"><Redo2 size={16} /></ToolbarButton>

                        <div className="w-px h-6 bg-gray-600 mx-1" />

                        <ToolbarButton onClick={() => editor.chain().focus().setParagraph().run()} isActive={editor.isActive('paragraph')} title="Paragraph"><Pilcrow size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="Heading 1"><Heading1 size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Heading 2"><Heading2 size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} title="Heading 3"><Heading3 size={16} /></ToolbarButton>

                        <div className="w-px h-6 bg-gray-600 mx-1" />

                        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Bold"><Bold size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Italic"><Italic size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Underline"><UnderlineIcon size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Strikethrough"><Strikethrough size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive('code')} title="Inline Code"><Code size={16} /></ToolbarButton>

                        <div className="relative">
                            <ToolbarButton onClick={() => setIsColorMenuOpen(o => !o)} isActive={isColorMenuOpen || !!editor.getAttributes('textStyle').color} title="Text Color">
                                <Palette size={16} />
                            </ToolbarButton>
                            {isColorMenuOpen && (
                                <>
                                    {/* Click-away layer */}
                                    <div className="fixed inset-0 z-10" onClick={() => setIsColorMenuOpen(false)} />
                                    <div className="absolute left-0 top-full mt-1 z-20 p-3 bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-52">
                                        <div className="grid grid-cols-4 gap-2 mb-3">
                                            {COLOR_SWATCHES.map(swatch => (
                                                <button
                                                    key={swatch.value}
                                                    type="button"
                                                    title={swatch.label}
                                                    onClick={() => applyColor(swatch.value)}
                                                    className="w-8 h-8 rounded-md border border-gray-600 hover:scale-110 transition-transform"
                                                    style={{ backgroundColor: swatch.value }}
                                                />
                                            ))}
                                        </div>
                                        <label className="flex items-center gap-2 mb-2 text-xs text-gray-300">
                                            <input
                                                type="color"
                                                value={editor.getAttributes('textStyle').color || '#F9FAFB'}
                                                onChange={(e) => applyColor(e.target.value)}
                                                className="w-8 h-8 p-0 bg-transparent border border-gray-600 rounded cursor-pointer"
                                            />
                                            Custom color
                                        </label>
                                        <button
                                            type="button"
                                            onClick={clearColor}
                                            className="w-full text-left text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700"
                                        >
                                            Remove color
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                        <ToolbarButton onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Clear Formatting"><Eraser size={16} /></ToolbarButton>

                        <div className="w-px h-6 bg-gray-600 mx-1" />

                        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Align Left"><AlignLeft size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Align Center"><AlignCenter size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Align Right"><AlignRight size={16} /></ToolbarButton>

                        <div className="w-px h-6 bg-gray-600 mx-1" />

                        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Bullet List"><List size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Numbered List"><ListOrdered size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="Quote"><Quote size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule"><Minus size={16} /></ToolbarButton>

                        <div className="w-px h-6 bg-gray-600 mx-1" />

                        <ToolbarButton onClick={openLinkModal} isActive={editor.isActive('link')} title="Link"><Link2 size={16} /></ToolbarButton>
                        <ToolbarButton onClick={openImageModal} title="Image"><ImageIcon size={16} /></ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert Table"><TableIcon size={16} /></ToolbarButton>
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