import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/api';
import { Rnd } from 'react-rnd';
import { QRCodeSVG } from 'qrcode.react';
import JsBarcode from 'jsbarcode';
import { 
    Type, Image as ImageIcon, Square, QrCode as QrIcon, 
    Layers, ArrowLeft, AlignLeft, AlignCenter, 
    AlignRight, Trash2, Grid3x3, Magnet, 
    Undo, Redo, Lock, Copy, 
    ArrowUp, ArrowDown, Eye, EyeOff, MoreVertical, FileJson,
    Bold, Italic, Underline, Minus, GripHorizontal, Maximize,
    Layout, MousePointer2, MoveHorizontal, MoveVertical, Upload,
    Barcode, AlignVerticalJustifyCenter
} from 'lucide-react';

// ... (Constants, Helper Functions, Hooks same as before) ...
// Ensure generateId, TOOLBOX_ITEMS, VARIABLE_FIELDS are preserved

// --- Constants ---
const DPI = 96; 
const GRID_STEP_INCHES = 0.125;
const SNAP_THRESHOLD_INCHES = 0.05;
const STRAIGHT_LINE_THRESHOLD_PX = 10;
const RESIZE_SNAP_THRESHOLD = 0.15; 
const THIN_DIMENSION_THRESHOLD = 0.06; 

const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const TOOLBOX_ITEMS = [
  { id: 'select', type: 'select', name: 'Select / Move', icon: <MousePointer2 size={16}/> },
  { id: 'text', type: 'text', name: 'Text Box', icon: <Type size={16}/> },
  { id: 'barcode', type: 'barcode', name: 'Barcode (1D)', icon: <Barcode size={16}/> },
  { id: 'qrcode', type: 'qrcode', name: 'QR Code (2D)', icon: <QrIcon size={16}/> },
  { id: 'image', type: 'image', name: 'Image Placeholder', variable_field: '__SHOW_LOGO__', content: 'Show Logo', icon: <ImageIcon size={16}/> },
  { id: 'rect', type: 'shape', shape: 'rectangle', name: 'Rectangle', icon: <Square size={16}/> },
  { id: 'line', type: 'line', name: 'Line', icon: <Minus size={16}/> },
];

const VARIABLE_FIELDS = {
    "Case": ["Send To", "Contents", "Case Number", "Weight", "Truck Layer", "Department"],
    "Loom": ["Loom Name", "Source", "Destination", "Color", "Cable Count", "Length"],
    "Global": ["Current Date", "User Name", "Show Name", "Location"],
};

// ... (inchesToPixels, pixelsToInches, getStockDimensions, processTextContent, useHistory, BarcodeRenderer, Ruler, ToolboxItem, LayerItem, ContextMenu) ...
const inchesToPixels = (inches) => Math.round(inches * DPI);
const pixelsToInches = (pixels) => Number((pixels / DPI).toFixed(3));

const getStockDimensions = (stock) => {
    if (!stock) return { width: 4, height: 2, name: 'Default' };
    if (stock.label_width && stock.label_height) {
        return { width: parseFloat(stock.label_width), height: parseFloat(stock.label_height), name: stock.name };
    }
    const pageW = parseFloat(stock.page_width || 8.5);
    const pageH = parseFloat(stock.page_height || 11);
    const cols = parseInt(stock.cols_per_page || 1);
    const rows = parseInt(stock.rows_per_page || 1);
    const leftM = parseFloat(stock.left_margin || 0);
    const topM = parseFloat(stock.top_margin || 0);
    const colSpace = parseFloat(stock.col_spacing || 0);
    const rowSpace = parseFloat(stock.row_spacing || 0);
    const width = (pageW - (leftM * 2) - (colSpace * (cols - 1))) / cols;
    const height = (pageH - (topM * 2) - (rowSpace * (rows - 1))) / rows;
    return { width: Number(width.toFixed(3)), height: Number(height.toFixed(3)), name: stock.name };
};

const processTextContent = (text, isPreview) => {
    if (!text) return "";
    if (!isPreview) return text;
    return text.replace(/\{([^}]+)\}/g, (match, varName) => {
        return "SAMPLE_" + varName.toUpperCase().replace(/\s/g, '_').substring(0, 5);
    });
};

// --- Hooks ---
const useHistory = (initialState) => {
    const [history, setHistory] = useState([initialState]);
    const [index, setIndex] = useState(0);

    const setState = (action) => {
        const newState = typeof action === 'function' ? action(history[index]) : action;
        const newHistory = history.slice(0, index + 1);
        newHistory.push(newState);
        setHistory(newHistory);
        setIndex(newHistory.length - 1);
    };

    const undo = () => index > 0 && setIndex(index - 1);
    const redo = () => index < history.length - 1 && setIndex(index + 1);

    return [history[index], setState, undo, redo, index > 0, index < history.length - 1];
};

// --- Components ---

const BarcodeRenderer = ({ value, format = "CODE128" }) => {
    const canvasRef = useRef(null);
    useEffect(() => {
        if (canvasRef.current) {
            try {
                JsBarcode(canvasRef.current, value || "123456", {
                    format: format, width: 2, height: 40, displayValue: true, margin: 0, background: 'transparent'
                });
            } catch (e) { console.warn("Invalid barcode"); }
        }
    }, [value, format]);
    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};

const Ruler = ({ orientation, lengthInches, zoom }) => {
    const ticks = [];
    for (let i = 0; i <= lengthInches; i += 0.5) {
        ticks.push(
            <div 
                key={i} 
                className="absolute bg-gray-600 text-[8px] text-gray-400 flex items-center justify-center pointer-events-none"
                style={{
                    [orientation === 'horizontal' ? 'left' : 'top']: i * DPI * zoom,
                    [orientation === 'horizontal' ? 'top' : 'left']: 0,
                    width: orientation === 'horizontal' ? '1px' : '100%',
                    height: orientation === 'horizontal' ? '100%' : '1px'
                }}
            >
                {Number.isInteger(i) && <span className="absolute -top-3 left-1">{i}</span>}
            </div>
        );
    }
    return (
        <div className={`absolute z-0 ${orientation === 'horizontal' ? 'h-4 w-full border-b border-gray-700 top-0 left-0' : 'w-4 h-full border-r border-gray-700 top-0 left-0'}`}>
            {ticks}
        </div>
    );
};

const ToolboxItem = ({ item, isActive, onClick }) => (
    <button
      onClick={onClick}
      title={item.name}
      className={`
        flex flex-col items-center justify-center p-2 rounded border transition-all w-10 h-10
        ${isActive 
            ? 'bg-amber-500 border-amber-400 text-black shadow-lg scale-105' 
            : 'bg-gray-900 border-gray-600 text-gray-400 hover:border-amber-500 hover:text-amber-500'
        }
      `}
    >
      <div>{item.icon}</div>
    </button>
);

const LayerItem = ({ element, isSelected, onClick, onToggleHidden, onDelete }) => {
    let icon = <Square size={14} />;
    let label = element.type;
    if (element.type === 'text') { icon = <Type size={14} />; label = element.text_content ? element.text_content.substring(0, 10) + '...' : 'Text'; }
    if (element.type === 'barcode') { icon = <Barcode size={14} />; label = 'Barcode'; } 
    if (element.type === 'line') { icon = <Minus size={14} />; label = 'Line'; }
    if (element.type === 'image') { icon = <ImageIcon size={14} />; label = element.variable_field === '__COMPANY_LOGO__' ? 'Company Logo' : 'Show Logo'; }

    return (
        <div 
            onClick={onClick}
            className={`
                flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-pointer mb-1 border-l-2 transition-colors select-none group
                ${isSelected ? 'bg-gray-700 border-amber-500 text-white' : 'border-transparent text-gray-400 hover:bg-gray-800 hover:text-gray-200'}
                ${element.hidden ? 'opacity-50' : 'opacity-100'}
            `}
        >
            <span className="opacity-70">{icon}</span>
            <span className="truncate flex-1">{label}</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button onClick={(e) => { e.stopPropagation(); onToggleHidden(); }} className="hover:text-amber-400 p-0.5">
                    {element.hidden ? <EyeOff size={12}/> : <Eye size={12}/>}
                 </button>
                 <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="hover:text-red-400 p-0.5">
                    <Trash2 size={12}/>
                 </button>
            </div>
            {element.locked && <Lock size={10} className="text-red-400 ml-1"/>}
        </div>
    );
};

const ContextMenu = ({ x, y, options, onClose }) => (
    <div className="fixed z-[100] bg-gray-800 border border-gray-600 rounded shadow-xl py-1 w-48 text-sm" style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
        {options.map((opt, i) => (
            <button key={i} onClick={() => { opt.action(); onClose(); }} className="w-full text-left px-4 py-2 hover:bg-gray-700 text-gray-200 flex items-center gap-2">
                {opt.icon} {opt.label}
            </button>
        ))}
    </div>
);

const PropertiesPanel = ({ selectedElements, onUpdate, onDelete, onAlign }) => {
    const containerClass = "bg-gray-800 h-full border-l border-gray-600 flex flex-col overflow-hidden text-gray-100 w-[320px] min-w-[320px] flex-shrink-0";
    
    if (selectedElements.length === 0) return <div className={`${containerClass} items-center justify-center text-center p-6 text-gray-500 italic`}><p>Select an element to edit.</p></div>;

    if (selectedElements.length > 1) {
        return (
            <div className={containerClass}>
                <div className="p-4 border-b border-gray-600 bg-gray-800"><h2 className="text-xs uppercase font-bold text-amber-500">Selection ({selectedElements.length})</h2></div>
                <div className="p-5">
                    <span className="text-xs text-gray-400 block mb-2">Alignment</span>
                    <div className="flex bg-gray-900 rounded border border-gray-600 overflow-hidden mb-4">
                        <button onClick={() => onAlign('left')} className="flex-1 py-2 hover:bg-gray-700 flex justify-center"><AlignLeft size={16}/></button>
                        <button onClick={() => onAlign('center')} className="flex-1 py-2 hover:bg-gray-700 flex justify-center"><AlignCenter size={16}/></button>
                        <button onClick={() => onAlign('right')} className="flex-1 py-2 hover:bg-gray-700 flex justify-center"><AlignRight size={16}/></button>
                    </div>
                    <div className="flex bg-gray-900 rounded border border-gray-600 overflow-hidden">
                         <button onClick={() => onAlign('top')} className="flex-1 py-2 hover:bg-gray-700 flex justify-center"><ArrowUp size={16}/></button>
                         <button onClick={() => onAlign('middle')} className="flex-1 py-2 hover:bg-gray-700 flex justify-center"><ArrowDown size={16} className="rotate-0"/></button> 
                    </div>
                    <button onClick={onDelete} className="w-full mt-6 bg-red-900/50 text-red-400 border border-red-900 py-2 rounded hover:bg-red-900 flex items-center justify-center gap-2">
                        <Trash2 size={16}/> Delete Selection
                    </button>
                </div>
            </div>
        );
    }

    const element = selectedElements[0];
    const handleUpdate = (prop, value) => onUpdate([element.id], { [prop]: value });
    const insertVariable = (val) => handleUpdate('text_content', (element.text_content || '') + `{${val}}`);

    const inputClass = "w-full bg-gray-900 border border-gray-600 text-gray-100 p-2 rounded text-sm focus:border-amber-500 focus:outline-none";
    const labelClass = "text-xs text-gray-400 block mb-1";
    const sectionClass = "p-5 border-b border-gray-600";

    return (
        <div className={containerClass}>
            <div className="p-4 border-b border-gray-600 bg-gray-800 flex justify-between items-center flex-shrink-0">
                <h2 className="text-xs uppercase font-bold tracking-widest text-amber-500">{element.type} Properties</h2>
                <div className="flex gap-2">
                    <button onClick={() => handleUpdate('locked', !element.locked)} className={`${element.locked ? 'text-red-500' : 'text-gray-400'} hover:bg-gray-700 p-1 rounded`}><Lock size={16}/></button>
                    <button onClick={onDelete} className="text-red-500 hover:text-red-400 p-1 hover:bg-gray-700 rounded transition-colors"><Trash2 size={16}/></button>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar">
                
                {element.type === 'image' && (
                    <div className={sectionClass}>
                        <span className={labelClass}>Image Source</span>
                        <select 
                            value={element.variable_field || '__SHOW_LOGO__'} 
                            onChange={e => handleUpdate('variable_field', e.target.value)} 
                            className={inputClass}
                        >
                            <option value="__SHOW_LOGO__">Show Logo</option>
                            <option value="__COMPANY_LOGO__">Company Logo</option>
                        </select>
                    </div>
                )}

                {(element.type === 'text' || element.type === 'qrcode' || element.type === 'barcode') && (
                    <div className={sectionClass}>
                        <div className="mb-2">
                            <span className={labelClass}>Content</span>
                            <textarea value={element.text_content || ''} onChange={e => handleUpdate('text_content', e.target.value)} className={`${inputClass} h-20 font-mono text-xs`} />
                        </div>
                        <div className="relative group">
                            <button className="w-full text-xs bg-gray-700 py-1 px-2 rounded hover:bg-gray-600 text-left flex justify-between text-gray-300">
                                + Insert Variable <MoreVertical size={12}/>
                            </button>
                            <div className="hidden group-hover:block absolute top-full left-0 w-full bg-gray-800 border border-gray-600 z-50 max-h-40 overflow-y-auto shadow-xl">
                                {Object.entries(VARIABLE_FIELDS).map(([cat, fields]) => (
                                    <div key={cat}>
                                        <div className="px-2 py-1 bg-gray-900 text-[10px] text-gray-500 font-bold">{cat}</div>
                                        {fields.map(f => (
                                            <div key={f} onClick={() => insertVariable(f)} className="px-2 py-1 text-xs hover:bg-amber-600 cursor-pointer">{f}</div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {element.type === 'text' && (
                    <div className={sectionClass}>
                        <div className="flex gap-2 mb-4">
                            <div className="flex-1"><span className={labelClass}>Font</span><select value={element.font_family} onChange={e => handleUpdate('font_family', e.target.value)} className={inputClass}><option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option><option value="Courier New">Courier Mono</option><option value="SpaceMono">Space Mono</option></select></div>
                            <div className="w-20"><span className={labelClass}>Size</span><input type="number" value={element.font_size} onChange={e => handleUpdate('font_size', parseInt(e.target.value))} className={inputClass} /></div>
                        </div>
                        <div className="flex bg-gray-900 border border-gray-600 rounded p-1 justify-between mb-4">
                             <button onClick={() => handleUpdate('font_weight', element.font_weight === 'bold' ? 'normal' : 'bold')} className={`p-1 rounded ${element.font_weight === 'bold' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}><Bold size={16}/></button>
                             <button onClick={() => handleUpdate('font_style', element.font_style === 'italic' ? 'normal' : 'italic')} className={`p-1 rounded ${element.font_style === 'italic' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}><Italic size={16}/></button>
                             <button onClick={() => handleUpdate('text_decoration', element.text_decoration === 'underline' ? 'none' : 'underline')} className={`p-1 rounded ${element.text_decoration === 'underline' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}><Underline size={16}/></button>
                             <div className="w-px bg-gray-600 mx-1"></div>
                             {/* Horizontal Align */}
                             <button onClick={() => handleUpdate('text_align', 'left')} className={`p-1 rounded ${element.text_align === 'left' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}><AlignLeft size={16}/></button>
                             <button onClick={() => handleUpdate('text_align', 'center')} className={`p-1 rounded ${element.text_align === 'center' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}><AlignCenter size={16}/></button>
                             <button onClick={() => handleUpdate('text_align', 'right')} className={`p-1 rounded ${element.text_align === 'right' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}><AlignRight size={16}/></button>
                        </div>
                        
                        {/* Vertical Align */}
                        <div className="flex bg-gray-900 border border-gray-600 rounded p-1 justify-between mb-4">
                             <span className="text-[10px] text-gray-500 uppercase font-bold self-center px-2">V-Align</span>
                             <div className="flex gap-1">
                                <button onClick={() => handleUpdate('vertical_align', 'top')} className={`p-1 rounded ${element.vertical_align === 'top' || !element.vertical_align ? 'bg-gray-700 text-white' : 'text-gray-400'}`} title="Top"><ArrowUp size={16}/></button>
                                <button onClick={() => handleUpdate('vertical_align', 'middle')} className={`p-1 rounded ${element.vertical_align === 'middle' ? 'bg-gray-700 text-white' : 'text-gray-400'}`} title="Middle"><MoreVertical size={16} className="rotate-90"/></button>
                                <button onClick={() => handleUpdate('vertical_align', 'bottom')} className={`p-1 rounded ${element.vertical_align === 'bottom' ? 'bg-gray-700 text-white' : 'text-gray-400'}`} title="Bottom"><ArrowDown size={16}/></button>
                             </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <span className={labelClass}>Show Border</span>
                            <input type="checkbox" checked={element.show_border || false} onChange={e => handleUpdate('show_border', e.target.checked)} className="accent-amber-500 h-4 w-4"/>
                        </div>
                    </div>
                )}

                {/* ... (Rest of PropertiesPanel) ... */}
                {(element.type === 'line' || element.type === 'shape') && (
                    <div className={sectionClass}>
                        {element.type === 'line' && (
                            <div className="flex gap-2 mb-4">
                                <button 
                                    onClick={() => handleUpdate('height', 0.05)} 
                                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded text-xs flex items-center justify-center gap-1"
                                    title="Make Horizontal"
                                >
                                    <MoveHorizontal size={14}/> Flatten H
                                </button>
                                <button 
                                    onClick={() => handleUpdate('width', 0.05)} 
                                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded text-xs flex items-center justify-center gap-1"
                                    title="Make Vertical"
                                >
                                    <MoveVertical size={14}/> Flatten V
                                </button>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <div className="flex-1">
                                <span className={labelClass}>Stroke Color</span>
                                <div className="flex items-center gap-2 bg-gray-900 border border-gray-600 rounded p-1">
                                    <input 
                                        type="color" 
                                        value={element.stroke_color || '#000000'} 
                                        onChange={e => handleUpdate('stroke_color', e.target.value)} 
                                        className="h-6 w-8 cursor-pointer bg-transparent border-0 p-0" 
                                    />
                                    <span className="text-xs text-gray-400 font-mono uppercase">{element.stroke_color || '#000000'}</span>
                                </div>
                            </div>
                            <div className="w-24">
                                <span className={labelClass}>Thickness</span>
                                <input 
                                    type="number" 
                                    min="1" 
                                    value={element.stroke_width || 2} 
                                    onChange={e => handleUpdate('stroke_width', parseInt(e.target.value))} 
                                    className={inputClass}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {element.type === 'barcode' && (
                    <div className={sectionClass}>
                        <span className={labelClass}>Format</span>
                        <select value={element.barcode_type} onChange={e => handleUpdate('barcode_type', e.target.value)} className={inputClass}>
                            <option value="CODE128">Code 128</option>
                            <option value="UPC">UPC</option>
                            <option value="EAN13">EAN 13</option>
                        </select>
                    </div>
                )}

                <div className={sectionClass}>
                    <div className="grid grid-cols-2 gap-3 mb-2">
                        <div><span className={labelClass}>X (in)</span><input type="number" step="0.01" value={element.x} onChange={e => handleUpdate('x', parseFloat(e.target.value))} className={inputClass} /></div>
                        <div><span className={labelClass}>Y (in)</span><input type="number" step="0.01" value={element.y} onChange={e => handleUpdate('y', parseFloat(e.target.value))} className={inputClass} /></div>
                        <div><span className={labelClass}>W (in)</span><input type="number" step="0.01" value={element.width} onChange={e => handleUpdate('width', parseFloat(e.target.value))} className={inputClass} /></div>
                        <div><span className={labelClass}>H (in)</span><input type="number" step="0.01" value={element.height} onChange={e => handleUpdate('height', parseFloat(e.target.value))} className={inputClass} /></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const LabelTemplateBuilder = () => {
    // ... (Hooks and State - Preserving previous logic) ...
    const { profile } = useAuth();
    const navigate = useNavigate();
    const canvasRef = useRef(null);
    const canvasContainerRef = useRef(null);
    const fileInputRef = useRef(null);
  
    // --- STATE ---
    const { templateId: paramId } = useParams();
    const [templateId, setTemplateId] = useState(paramId || null);
    const [templateName, setTemplateName] = useState('New Label Template');
    const [category, setCategory] = useState('generic');
    const [labelStocks, setLabelStocks] = useState([]);
    const [selectedStockId, setSelectedStockId] = useState('');
    
    // Logic State
    const [elements, setElements, undo, redo, canUndo, canRedo] = useHistory([]);
    const [selectedElementIds, setSelectedElementIds] = useState([]);
    const [contextMenu, setContextMenu] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [activeTool, setActiveTool] = useState('select');
    const [clipboard, setClipboard] = useState([]); 

    // Drawing State for Click-and-Drag
    const [drawing, setDrawing] = useState({ isDrawing: false, startX: 0, startY: 0, currX: 0, currY: 0, shiftKey: false });

    // Toolbar Position
    const [toolbarPos, setToolbarPos] = useState(() => {
        try {
            const saved = localStorage.getItem('lbl_toolbar_pos');
            return saved ? JSON.parse(saved) : { x: 0, y: 0 };
        } catch(e) { return { x: 0, y: 0 }; }
    });

    const [zoom, setZoom] = useState(1.0);
    const [showGrid, setShowGrid] = useState(true);
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [snapToObjects, setSnapToObjects] = useState(true);
    const [showPreview, setShowPreview] = useState(false);
  
    const selectedStock = useMemo(() => labelStocks.find(s => s.id == selectedStockId), [labelStocks, selectedStockId]);
    const labelDim = useMemo(() => getStockDimensions(selectedStock), [selectedStock]);
    
    // ... (Effects) ...
    useEffect(() => {
        api.getLabelStocks().then(setLabelStocks).catch(() => toast.error('Failed to load stocks.'));
        const closeMenu = () => setContextMenu(null);
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

    // Center the toolbar on load
    useEffect(() => {
        if (!localStorage.getItem('lbl_toolbar_pos')) {
            const centerX = (window.innerWidth - 450) / 2; 
            const bottomY = window.innerHeight - 100;
            setToolbarPos({ x: centerX, y: bottomY });
        }
    }, []);

    // Load Template Effect
    useEffect(() => {
        if (paramId) {
            const loadTemplate = async () => {
                const toastId = toast.loading("Loading template...");
                try {
                    const data = await api.getLabelTemplate(paramId);
                    setTemplateName(data.name);
                    setCategory(data.category);
                    setSelectedStockId(data.stock_id);
                    const loadedElements = (data.elements || []).map(el => ({ ...el, id: el.id || generateId() }));
                    setElements(loadedElements);
                    toast.success("Template loaded", { id: toastId });
                } catch (error) {
                    console.error(error);
                    toast.error("Failed to load template", { id: toastId });
                    navigate('/library/label-templates');
                }
            };
            loadTemplate();
        }
    }, [paramId, navigate]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Shift') setDrawing(prev => ({ ...prev, shiftKey: true }));
            
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            // Undo / Redo
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
            if ((e.metaKey || e.ctrlKey) && e.key === 'y') { e.preventDefault(); redo(); }

            // COPY
            if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
                e.preventDefault();
                const selected = elements.filter(el => selectedElementIds.includes(el.id));
                if (selected.length > 0) {
                    setClipboard(selected);
                    toast.success(`Copied ${selected.length} element(s)`);
                }
            }

            // PASTE
            if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
                e.preventDefault();
                if (clipboard.length > 0) {
                    const newElements = clipboard.map(item => ({
                        ...item,
                        id: generateId(),
                        x: item.x + 0.25, 
                        y: item.y + 0.25
                    }));
                    setElements(prev => [...prev, ...newElements]);
                    setSelectedElementIds(newElements.map(el => el.id));
                    toast.success(`Pasted ${newElements.length} element(s)`);
                }
            }

            // ARROW KEY NUDGE
            if (selectedElementIds.length > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                let dx = 0;
                let dy = 0;
                const step = e.shiftKey ? 0.1 : 0.01;

                if (e.key === 'ArrowUp') dy = -step;
                if (e.key === 'ArrowDown') dy = step;
                if (e.key === 'ArrowLeft') dx = -step;
                if (e.key === 'ArrowRight') dx = step;

                setElements(prev => prev.map(el => {
                    if (selectedElementIds.includes(el.id) && !el.locked) {
                        return { 
                            ...el, 
                            x: Math.max(0, Number((el.x + dx).toFixed(3))), 
                            y: Math.max(0, Number((el.y + dy).toFixed(3))) 
                        };
                    }
                    return el;
                }));
            }

            if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
            if (e.key === 'Escape') { 
                setActiveTool('select'); 
                setEditingId(null); 
                setSelectedElementIds([]);
                setDrawing({ isDrawing: false, startX: 0, startY: 0, currX: 0, currY: 0 });
            }
        };
        const handleKeyUp = (e) => {
            if (e.key === 'Shift') setDrawing(prev => ({ ...prev, shiftKey: false }));
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [undo, redo, selectedElementIds, elements, clipboard]); 

    // ... (updateElements, deleteSelection, handleImportJSON, exportJSON, handleSave) ...
    const updateElements = (ids, updates) => {
        setElements(prev => prev.map(el => ids.includes(el.id) ? { ...el, ...updates } : el));
    };

    const deleteSelection = (specificId = null) => {
        const targetId = (typeof specificId === 'string') ? specificId : null;
        if (targetId) {
             setElements(prev => prev.filter(el => el.id !== targetId));
             if (selectedElementIds.includes(targetId)) setSelectedElementIds(prev => prev.filter(id => id !== targetId));
        } else {
             setElements(prev => prev.filter(el => !selectedElementIds.includes(el.id)));
             setSelectedElementIds([]);
        }
    };

    // --- IMPORT / EXPORT HANDLERS ---
    const handleImportJSON = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.elements) {
                    if (data.name) setTemplateName(data.name);
                    if (data.category) setCategory(data.category);
                    const importedElements = data.elements.map(el => ({ ...el, id: generateId() }));
                    setElements(importedElements);
                    setTemplateId(null);
                    toast.success("Template imported successfully!");
                } else {
                    toast.error("Invalid template file format");
                }
            } catch (err) { toast.error("Failed to parse JSON file"); }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const exportJSON = () => {
        navigator.clipboard.writeText(JSON.stringify({ name: templateName, category, elements }, null, 2));
        toast.success("JSON copied!");
    };
    
    // --- SAVE HANDLER ---
    const handleSave = async () => {
        if (!templateName.trim()) {
            toast.error("Please enter a template name");
            return;
        }
        if (!selectedStockId) {
            toast.error("Please select a label stock");
            return;
        }
        
        const toastId = toast.loading(templateId ? "Updating template..." : "Creating template...");
        const payload = {
            name: templateName,
            stock_id: selectedStockId,
            category: category,
            elements
        };

        try {
            if (templateId) {
                await api.updateLabelTemplate(templateId, payload);
                toast.success("Template updated successfully!", { id: toastId });
            } else {
                const created = await api.createLabelTemplate(payload);
                setTemplateId(created.id);
                toast.success("Template created successfully!", { id: toastId });
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to save.", { id: toastId });
        }
    };

    // ... (Drawing Handlers - preserved) ...
    const handleMouseDown = (e) => {
        if (canvasContainerRef.current && e.target === canvasContainerRef.current) {
            const rect = canvasContainerRef.current.getBoundingClientRect();
            const { clientWidth, clientHeight } = canvasContainerRef.current;
            const isVerticalScrollbar = (e.clientX - rect.left) > clientWidth;
            const isHorizontalScrollbar = (e.clientY - rect.top) > clientHeight;
            if (isVerticalScrollbar || isHorizontalScrollbar) return;
        }

        if (activeTool === 'select') {
             if (e.target === canvasRef.current || e.target.id === 'canvas_droppable') {
                 setSelectedElementIds([]);
                 setEditingId(null);
             }
             return;
        }

        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        
        const xPixels = (e.clientX - rect.left) / zoom;
        const yPixels = (e.clientY - rect.top) / zoom;
        
        setDrawing(prev => ({ 
            ...prev,
            isDrawing: true, 
            startX: xPixels, 
            startY: yPixels, 
            currX: xPixels, 
            currY: yPixels 
        }));
        setEditingId(null); 
    };

    const handleMouseMove = (e) => {
        if (!drawing.isDrawing) return;
        if (!canvasRef.current) return;
        
        const rect = canvasRef.current.getBoundingClientRect();
        const xPixels = (e.clientX - rect.left) / zoom;
        const yPixels = (e.clientY - rect.top) / zoom;

        setDrawing(prev => ({ ...prev, currX: xPixels, currY: yPixels }));
    };

    const handleMouseUp = (e) => {
        if (!drawing.isDrawing) return;

        let xMin = Math.min(drawing.startX, drawing.currX);
        let yMin = Math.min(drawing.startY, drawing.currY);
        let widthPx = Math.abs(drawing.currX - drawing.startX);
        let heightPx = Math.abs(drawing.currY - drawing.startY);

        const isShift = drawing.shiftKey;
        
        if (activeTool === 'line') {
            if (isShift || heightPx < STRAIGHT_LINE_THRESHOLD_PX) {
                if (widthPx > heightPx * 2) {
                    heightPx = 0; 
                    yMin = drawing.startY; 
                }
            }
            if (isShift || widthPx < STRAIGHT_LINE_THRESHOLD_PX) {
                if (heightPx > widthPx * 2) {
                    widthPx = 0;
                    xMin = drawing.startX;
                }
            }
        }

        const xInches = pixelsToInches(xMin);
        const yInches = pixelsToInches(yMin);
        let widthInches = pixelsToInches(widthPx);
        let heightInches = pixelsToInches(heightPx);

        if (widthInches < 0.01) widthInches = 0.05; 
        if (heightInches < 0.01) heightInches = 0.05; 

        let lineDirection = 'down'; 
        if (
            (drawing.startX < drawing.currX && drawing.startY > drawing.currY) || 
            (drawing.startX > drawing.currX && drawing.startY < drawing.currY)
        ) {
            lineDirection = 'up'; 
        }

        if (widthPx < 5 && heightPx < 5) {
            const itemTemplate = TOOLBOX_ITEMS.find(t => t.id === activeTool);
            const defaultW = itemTemplate.type === 'text' ? 2 : (itemTemplate.type === 'line' ? 2 : 1);
            const defaultH = itemTemplate.type === 'line' ? 0.05 : 1;
            createObject(xInches - (defaultW/2), yInches - (defaultH/2), defaultW, defaultH, 'down');
        } else {
            createObject(xInches, yInches, widthInches, heightInches, lineDirection);
        }

        setDrawing(prev => ({ ...prev, isDrawing: false, startX: 0, startY: 0, currX: 0, currY: 0 }));
    };

    const createObject = (posX, posY, w, h, lineDirection) => {
        const itemTemplate = TOOLBOX_ITEMS.find(t => t.id === activeTool);
        if (!itemTemplate) return;

        const { id: _sourceId, icon, name, ...itemProps } = itemTemplate;
        
        const newEl = {
            id: generateId(),
            type: itemTemplate.type,
            x: Math.max(0, posX),
            y: Math.max(0, posY),
            width: w,
            height: h,
            text_content: itemTemplate.type === 'text' ? 'New Text' : '',
            barcode_type: 'CODE128',
            font_size: 12, font_family: 'Arial', text_color: '#000',
            stroke_width: (itemTemplate.type === 'line' || itemTemplate.type === 'shape') ? 2 : 1, 
            stroke_color: '#000000',
            vertical_align: 'top', // Default for new objects
            show_border: false,
            locked: false,
            hidden: false,
            lineDirection: lineDirection, 
            ...itemProps
        };

        setElements(prev => [...prev, newEl]);
        setSelectedElementIds([newEl.id]);
    };

    const handleElementClick = (e, id) => {
        if (activeTool !== 'select') return;
        e.stopPropagation();
        if (editingId === id) return;

        if (e.shiftKey) {
            setSelectedElementIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
        } else {
            if (!selectedElementIds.includes(id)) setSelectedElementIds([id]);
        }
        if (editingId !== id) setEditingId(null);
    };

    const handleElementDoubleClick = (e, id, type) => {
        e.stopPropagation();
        if (activeTool === 'select' && type === 'text') {
            setEditingId(id);
            if (!selectedElementIds.includes(id)) setSelectedElementIds([id]);
        }
    };

    const handleRndDragStop = (e, d, id) => {
        const movedEl = elements.find(el => el.id === id);
        if (!movedEl) return;

        let newXInches = pixelsToInches(d.x);
        let newYInches = pixelsToInches(d.y);

        if (snapToObjects) {
            const myW = movedEl.width;
            const myH = movedEl.height;
            const myR = newXInches + myW; 
            const myB = newYInches + myH; 

            let closestXDelta = SNAP_THRESHOLD_INCHES;
            let closestYDelta = SNAP_THRESHOLD_INCHES;
            let finalSnapX = null;
            let finalSnapY = null;

            elements.forEach(other => {
                if (other.id === id || other.hidden) return;
                const otherR = other.x + other.width;
                const otherB = other.y + other.height;

                const diffLeftLeft   = Math.abs(newXInches - other.x);
                const diffLeftRight  = Math.abs(newXInches - otherR); 
                const diffRightLeft  = Math.abs(myR - other.x);
                const diffRightRight = Math.abs(myR - otherR); 

                if (diffLeftLeft < closestXDelta)   { closestXDelta = diffLeftLeft; finalSnapX = other.x; }
                if (diffLeftRight < closestXDelta)  { closestXDelta = diffLeftRight; finalSnapX = otherR; }
                if (diffRightLeft < closestXDelta)  { closestXDelta = diffRightLeft; finalSnapX = other.x - myW; }
                if (diffRightRight < closestXDelta) { closestXDelta = diffRightRight; finalSnapX = otherR - myW; }

                const diffTopTop     = Math.abs(newYInches - other.y);
                const diffTopBottom  = Math.abs(newYInches - otherB);
                const diffBottomTop  = Math.abs(myB - other.y);
                const diffBottomBottom = Math.abs(myB - otherB);

                if (diffTopTop < closestYDelta)     { closestYDelta = diffTopTop; finalSnapY = other.y; }
                if (diffTopBottom < closestYDelta)  { closestYDelta = diffTopBottom; finalSnapY = otherB; }
                if (diffBottomTop < closestYDelta)  { closestYDelta = diffBottomTop; finalSnapY = other.y - myH; }
                if (diffBottomBottom < closestYDelta){ closestYDelta = diffBottomBottom; finalSnapY = otherB - myH; }
            });

            if (finalSnapX !== null) newXInches = finalSnapX;
            if (finalSnapY !== null) newYInches = finalSnapY;
        }

        // Calculate delta for multi-select
        const deltaX = newXInches - movedEl.x;
        const deltaY = newYInches - movedEl.y;

        setElements(prev => prev.map(el => {
            if (el.id === id) {
                return { 
                    ...el, 
                    x: Math.max(0, Number(newXInches.toFixed(3))), 
                    y: Math.max(0, Number(newYInches.toFixed(3))) 
                };
            }
            if (selectedElementIds.includes(el.id) && !el.locked) {
                return { 
                    ...el, 
                    x: Math.max(0, Number((el.x + deltaX).toFixed(3))), 
                    y: Math.max(0, Number((el.y + deltaY).toFixed(3))) 
                };
            }
            return el;
        }));
    };

    const handleToolbarDragStop = (e, d) => {
        const newPos = { x: d.x, y: d.y };
        setToolbarPos(newPos);
        localStorage.setItem('lbl_toolbar_pos', JSON.stringify(newPos));
    };

    const alignSelection = (mode) => {
        if (selectedElementIds.length < 2) return;
        const selected = elements.filter(el => selectedElementIds.includes(el.id));
        let target = 0;
        if (mode === 'left') target = Math.min(...selected.map(e => e.x));
        if (mode === 'top') target = Math.min(...selected.map(e => e.y));
        if (mode === 'right') target = Math.max(...selected.map(e => e.x + e.width));
        setElements(prev => prev.map(el => {
            if (!selectedElementIds.includes(el.id)) return el;
            if (mode === 'left') return { ...el, x: target };
            if (mode === 'top') return { ...el, y: target };
            if (mode === 'right') return { ...el, x: target - el.width };
            if (mode === 'center') return { ...el, x: target }; 
            return el;
        }));
    };

    const gridPx = snapToGrid ? inchesToPixels(GRID_STEP_INCHES) : 1;
    const canvasCursor = activeTool === 'select' ? 'default' : 'crosshair';

    // Calculation for Ghost Line Slope
    let ghostLineDirection = 'down';
    if (drawing.isDrawing && activeTool === 'line') {
         if (
            (drawing.startX < drawing.currX && drawing.startY > drawing.currY) || 
            (drawing.startX > drawing.currX && drawing.startY < drawing.currY)
        ) {
            ghostLineDirection = 'up';
        }
    }

    return (
        <div className="flex h-full flex-col bg-gray-900 font-sans text-gray-100 overflow-hidden" onContextMenu={e => e.preventDefault()}>
            {/* Hidden Input for Importing */}
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".json" 
                onChange={handleImportJSON} 
            />

            <header className="h-[60px] bg-gray-800 border-b border-gray-600 flex items-center justify-between px-5 z-20 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <Link to="/library/label-templates" className="text-gray-400 hover:text-white font-bold text-sm flex items-center gap-1">
                        <ArrowLeft size={16}/> Library
                    </Link>
                    <div className="h-6 w-px bg-gray-600 mx-2"></div>
                    <input value={templateName} onChange={e => setTemplateName(e.target.value)} className="bg-transparent text-lg font-bold border-b border-transparent focus:border-amber-500 outline-none w-64 text-gray-100 hover:border-gray-600 transition-colors" />
                    <div className="flex gap-1 ml-2">
                            <button onClick={undo} disabled={!canUndo} className="p-1 hover:bg-gray-700 rounded text-gray-400 disabled:opacity-30"><Undo size={14}/></button>
                            <button onClick={redo} disabled={!canRedo} className="p-1 hover:bg-gray-700 rounded text-gray-400 disabled:opacity-30"><Redo size={14}/></button>
                    </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                    {/* CATEGORY SELECTOR */}
                    <select value={category} onChange={e => setCategory(e.target.value)} className="bg-gray-900 border border-gray-600 text-white py-1 px-2 rounded outline-none w-32">
                        <option value="generic">Generic</option>
                        <option value="case">Case</option>
                        <option value="loom">Loom</option>
                    </select>

                    <span className="text-gray-400">Stock:</span>
                    <select value={selectedStockId} onChange={e => setSelectedStockId(e.target.value)} className="bg-gray-900 border border-gray-600 text-white py-1 px-2 rounded outline-none min-w-[200px]">
                        <option value="">Select Stock...</option>
                        {labelStocks.map(s => {
                            const dims = getStockDimensions(s);
                            return <option key={s.id} value={s.id}>{s.name} ({dims.width}"x{dims.height}")</option>;
                        })}
                    </select>
                    {/* IMPORT BUTTON */}
                    <button onClick={() => fileInputRef.current.click()} className="text-gray-500 hover:text-white ml-2 flex items-center gap-1"><Upload size={18}/></button>
                    <button onClick={exportJSON} className="text-gray-500 hover:text-white ml-2"><FileJson size={18}/></button>
                    {/* SAVE BUTTON */}
                    <button onClick={handleSave} className="ml-4 bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 rounded-md font-bold transition-colors shadow-lg">Save</button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative">
                <aside className="w-[200px] bg-gray-800 border-r border-gray-600 flex flex-col z-10 flex-shrink-0">
                    <div className="p-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-600">Tools</div>
                    <div className="grid grid-cols-4 gap-2 p-3">
                        {TOOLBOX_ITEMS.map(item => (
                            <ToolboxItem 
                                key={item.id} 
                                item={item} 
                                isActive={activeTool === item.id}
                                onClick={() => setActiveTool(item.id)}
                            />
                        ))}
                    </div>

                    <div className="mt-auto border-t border-gray-600 flex flex-col h-1/2">
                        <div className="p-4 border-b border-gray-600 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                            <Layers size={14}/> Layers ({elements.length})
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                            {[...elements].reverse().map(el => (
                                <LayerItem 
                                    key={el.id} element={el} 
                                    isSelected={selectedElementIds.includes(el.id)} 
                                    onClick={(e) => handleElementClick(e, el.id)} 
                                    onToggleHidden={() => updateElements([el.id], { hidden: !el.hidden })}
                                    onDelete={() => deleteSelection(el.id)}
                                />
                            ))}
                        </div>
                    </div>
                </aside>

                <main className="flex-1 relative flex flex-col bg-gray-900 overflow-hidden">
                    <div 
                        ref={canvasContainerRef}
                        className="flex-1 overflow-auto bg-gray-900 relative flex" 
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                    >
                        {/* --- SIZING WRAPPER: Matches zoomed size to force correct scrollbars --- */}
                        <div 
                            className="relative shrink-0 m-auto box-content p-[50px]" 
                            style={{
                                width: inchesToPixels(labelDim.width) * zoom, 
                                height: inchesToPixels(labelDim.height) * zoom,
                            }}
                        >
                            <div 
                                ref={canvasRef}
                                id="canvas_droppable"
                                className="relative shadow-2xl transition-all duration-200"
                                style={{
                                    backgroundColor: 'white',
                                    width: inchesToPixels(labelDim.width),
                                    height: inchesToPixels(labelDim.height),
                                    transform: `scale(${zoom})`,
                                    transformOrigin: 'top left', // IMPORTANT: Top Left origin aligns with the wrapper
                                    backgroundImage: showGrid ? `linear-gradient(rgba(75, 85, 99, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(75, 85, 99, 0.2) 1px, transparent 1px)` : 'none',
                                    backgroundSize: `${inchesToPixels(GRID_STEP_INCHES)}px ${inchesToPixels(GRID_STEP_INCHES)}px`
                                }}
                                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, targetId: null }); }}
                            >
                                {showGrid && (
                                    <>
                                        <div className="absolute -top-6 left-0 w-full"><Ruler orientation="horizontal" lengthInches={labelDim.width} zoom={1}/></div>
                                        <div className="absolute top-0 -left-6 h-full"><Ruler orientation="vertical" lengthInches={labelDim.height} zoom={1}/></div>
                                    </>
                                )}

                                {/* --- GHOST RENDERING --- */}
                                {drawing.isDrawing && (
                                    <>
                                        {activeTool === 'line' ? (
                                            <div 
                                                className="absolute z-[100] pointer-events-none"
                                                style={{
                                                    left: Math.min(drawing.startX, drawing.currX),
                                                    top: Math.min(drawing.startY, drawing.currY),
                                                    width: Math.abs(drawing.currX - drawing.startX),
                                                    height: Math.abs(drawing.currY - drawing.startY),
                                                }}
                                            >
                                                <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                                                    <line 
                                                        x1="0" 
                                                        y1={ghostLineDirection === 'down' ? '0' : '100%'} 
                                                        x2="100%" 
                                                        y2={ghostLineDirection === 'down' ? '100%' : '0'} 
                                                        stroke="#3b82f6" 
                                                        strokeWidth="2" 
                                                        strokeDasharray="4"
                                                    />
                                                </svg>
                                            </div>
                                        ) : (
                                            <div
                                                className="absolute border border-dashed border-blue-500 bg-blue-500/10 z-[100] pointer-events-none"
                                                style={{
                                                    left: Math.min(drawing.startX, drawing.currX),
                                                    top: Math.min(drawing.startY, drawing.currY),
                                                    width: Math.abs(drawing.currX - drawing.startX),
                                                    height: Math.abs(drawing.currY - drawing.startY),
                                                }}
                                            />
                                        )}
                                    </>
                                )}

                                {elements.map(el => {
                                    if (el.hidden) return null;
                                    const isSelected = selectedElementIds.includes(el.id);
                                    const isEditing = editingId === el.id;
                                    const pointerEvents = activeTool === 'select' ? 'auto' : 'none';

                                    const showOutline = isSelected && !isEditing && el.type !== 'line';
                                    const isHorizontal = el.height < THIN_DIMENSION_THRESHOLD;
                                    const isVertical = el.width < THIN_DIMENSION_THRESHOLD;

                                    return (
                                        <Rnd
                                            key={el.id}
                                            size={{ width: inchesToPixels(el.width), height: inchesToPixels(el.height) }}
                                            position={{ x: inchesToPixels(el.x), y: inchesToPixels(el.y) }}
                                            scale={zoom}
                                            disableDragging={el.locked || isEditing || activeTool !== 'select'}
                                            onDragStart={(e) => { if (!isSelected && !e.shiftKey) setSelectedElementIds([el.id]); }}
                                            onDragStop={(e, d) => handleRndDragStop(e, d, el.id)}
                                            onResizeStop={(e, dir, ref, delta, pos) => {
                                                let newW = pixelsToInches(ref.offsetWidth);
                                                let newH = pixelsToInches(ref.offsetHeight);
                                                
                                                if (el.type === 'line') {
                                                    if (newW < RESIZE_SNAP_THRESHOLD) newW = 0.05;
                                                    if (newH < RESIZE_SNAP_THRESHOLD) newH = 0.05;
                                                }

                                                updateElements([el.id], {
                                                    width: newW,
                                                    height: newH,
                                                    x: pixelsToInches(pos.x),
                                                    y: pixelsToInches(pos.y)
                                                });
                                            }}
                                            onClick={(e) => handleElementClick(e, el.id)}
                                            onDoubleClick={(e) => handleElementDoubleClick(e, el.id, el.type)}
                                            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, targetId: el.id }); if (!isSelected) setSelectedElementIds([el.id]); }}
                                            bounds="parent"
                                            dragGrid={snapToGrid ? [gridPx, gridPx] : [1, 1]}
                                            resizeGrid={snapToGrid ? [gridPx, gridPx] : [1, 1]}
                                            className={`absolute group ${isSelected ? 'z-50' : 'z-10'}`}
                                            style={{ pointerEvents }} 
                                        >
                                            <div 
                                                className={`
                                                    w-full h-full
                                                    ${el.type === 'line' ? 'overflow-visible' : 'overflow-hidden'}
                                                    ${showOutline ? 'outline outline-2 outline-blue-500' : ''}
                                                    ${!isSelected && !el.locked ? 'hover:outline hover:outline-1 hover:outline-blue-300' : ''}
                                                `}
                                            >
                                                {el.locked && <div className="absolute top-0 right-0 p-1 text-red-500 z-10"><Lock size={10}/></div>}
                                                
                                                {isEditing && el.type === 'text' ? (
                                                    <textarea
                                                        autoFocus
                                                        value={el.text_content}
                                                        onChange={(e) => updateElements([el.id], { text_content: e.target.value })}
                                                        onBlur={() => setEditingId(null)}
                                                        style={{
                                                            width: '100%', height: '100%',
                                                            fontFamily: el.font_family, fontSize: `${el.font_size}pt`,
                                                            fontWeight: el.font_weight, fontStyle: el.font_style, textDecoration: el.text_decoration,
                                                            color: el.text_color, textAlign: el.text_align,
                                                            background: 'transparent',
                                                            border: 'none', 
                                                            outline: '2px solid #f59e0b',
                                                            resize: 'none',
                                                            padding: 0, margin: 0, overflow: 'hidden',
                                                            whiteSpace: 'pre-wrap',
                                                            lineHeight: '1.2'
                                                        }}
                                                    />
                                                ) : (
                                                    <div 
                                                        style={{
                                                            width: '100%', height: '100%',
                                                            fontFamily: el.font_family, fontSize: `${el.font_size}pt`,
                                                            fontWeight: el.font_weight, fontStyle: el.font_style, textDecoration: el.text_decoration,
                                                            color: el.text_color, textAlign: el.text_align,
                                                            border: (el.type === 'text' && el.show_border) ? '1px solid black' : 'none',
                                                            display: 'flex', 
                                                            // Vertical Alignment Implementation using Flexbox
                                                            alignItems: el.type === 'text' ? (el.vertical_align === 'middle' ? 'center' : (el.vertical_align === 'bottom' ? 'flex-end' : 'flex-start')) : 'center',
                                                            justifyContent: el.type === 'text' ? (el.text_align === 'center' ? 'center' : el.text_align === 'right' ? 'flex-end' : 'flex-start') : 'center',
                                                            lineHeight: '1.2',
                                                            whiteSpace: 'pre-wrap'
                                                        }}
                                                    >
                                                        {el.type === 'text' && processTextContent(el.text_content, showPreview)}
                                                        {el.type === 'barcode' && <BarcodeRenderer value={showPreview ? '12345' : el.text_content} format={el.barcode_type} />}
                                                        {el.type === 'qrcode' && <QRCodeSVG value={el.text_content || 'QR'} width="100%" height="100%" />}
                                                        
                                                        {/* SVG LINE RENDERER */}
                                                        {el.type === 'line' && (
                                                            <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                                                                <line 
                                                                    x1={isVertical ? '50%' : '0'} 
                                                                    y1={isHorizontal ? '50%' : (el.lineDirection === 'down' ? '0' : '100%')} 
                                                                    x2={isVertical ? '50%' : '100%'} 
                                                                    y2={isHorizontal ? '50%' : (el.lineDirection === 'down' ? '100%' : '0')} 
                                                                    stroke="transparent" 
                                                                    strokeWidth="20"
                                                                    style={{ cursor: 'pointer' }}
                                                                />
                                                                {isSelected && (
                                                                    <line 
                                                                        x1={isVertical ? '50%' : '0'} 
                                                                        y1={isHorizontal ? '50%' : (el.lineDirection === 'down' ? '0' : '100%')} 
                                                                        x2={isVertical ? '50%' : '100%'} 
                                                                        y2={isHorizontal ? '50%' : (el.lineDirection === 'down' ? '100%' : '0')} 
                                                                        stroke="#3b82f6" 
                                                                        strokeWidth={(el.stroke_width || 2) + 4} 
                                                                        opacity="0.5"
                                                                    />
                                                                )}
                                                                <line 
                                                                    x1={isVertical ? '50%' : '0'} 
                                                                    y1={isHorizontal ? '50%' : (el.lineDirection === 'down' ? '0' : '100%')} 
                                                                    x2={isVertical ? '50%' : '100%'} 
                                                                    y2={isHorizontal ? '50%' : (el.lineDirection === 'down' ? '100%' : '0')} 
                                                                    stroke={el.stroke_color || 'black'} 
                                                                    strokeWidth={el.stroke_width || 2} 
                                                                />
                                                            </svg>
                                                        )}
                                                        
                                                        {el.type === 'image' && <div className="text-[8px] text-gray-400 border border-dashed border-gray-400 w-full h-full flex items-center justify-center">LOGO</div>}
                                                        {el.type === 'shape' && <div className="w-full h-full" style={{ border: `${el.stroke_width}px solid ${el.stroke_color || 'black'}` }}/>}
                                                    </div>
                                                )}
                                            </div>
                                        </Rnd>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* FIXED TOOLBAR: No CSS 'transform', manual position controlled by Rnd */}
                    <Rnd
                        default={{ x: 0, y: 0, width: 'auto', height: 'auto' }}
                        position={{ x: toolbarPos.x, y: toolbarPos.y }}
                        onDragStop={handleToolbarDragStop}
                        enableResizing={false}
                        bounds="window"
                        cancel=".nodrag" // IMPORTANT: Prevents dragging when interacting with elements marked 'nodrag'
                        className="z-50"
                        style={{ position: 'absolute' }} // Removed bottom/left/transform centering
                    >
                        <div className="bg-gray-800 border border-gray-600 py-2 px-6 rounded-full flex gap-5 text-xs font-bold text-gray-400 shadow-xl items-center whitespace-nowrap">
                            <GripHorizontal size={14} className="cursor-move text-gray-600"/>
                            <div className="flex items-center gap-2">
                                <Maximize size={14}/>
                                <span className="w-12 text-right">{Math.round(zoom * 100)}%</span>
                                <input 
                                    type="range" 
                                    min="0.5" 
                                    max="3" 
                                    step="0.1" 
                                    value={zoom} 
                                    onChange={e => setZoom(parseFloat(e.target.value))} 
                                    onPointerDown={e => e.stopPropagation()} 
                                    className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-amber-500 nodrag" // Added nodrag
                                />
                            </div>
                            <div className="h-4 w-px bg-gray-600"></div>
                            <button onClick={() => setShowGrid(!showGrid)} title="Toggle Grid" className={`flex items-center gap-1 transition-colors ${showGrid ? 'text-amber-500' : 'hover:text-white'} nodrag`}><Grid3x3 size={14}/></button>
                            <button onClick={() => setSnapToGrid(!snapToGrid)} title="Snap to Grid" className={`flex items-center gap-1 transition-colors ${snapToGrid ? 'text-amber-500' : 'hover:text-white'} nodrag`}><Magnet size={14}/></button>
                            <button onClick={() => setSnapToObjects(!snapToObjects)} title="Snap to Objects" className={`flex items-center gap-1 transition-colors ${snapToObjects ? 'text-amber-500' : 'hover:text-white'} nodrag`}><Layout size={14}/></button>
                            <div className="h-4 w-px bg-gray-600"></div>
                            <button onClick={() => setShowPreview(!showPreview)} className={`flex items-center gap-1 transition-colors ${showPreview ? 'text-amber-500' : 'hover:text-white'} nodrag`}>{showPreview ? <Eye size={14}/> : <EyeOff size={14}/>}</button>
                        </div>
                    </Rnd>
                </main>

                <aside className="flex-shrink-0 z-10 shadow-xl">
                    <PropertiesPanel 
                        selectedElements={elements.filter(el => selectedElementIds.includes(el.id))}
                        onUpdate={updateElements}
                        onDelete={() => deleteSelection()}
                        onAlign={alignSelection}
                    />
                </aside>
            </div>

            {contextMenu && (
                <ContextMenu 
                    x={contextMenu.x} y={contextMenu.y} 
                    onClose={() => setContextMenu(null)}
                    options={[
                        { label: 'Duplicate', icon: <Copy size={14}/>, action: () => {
                            const target = elements.find(e => e.id === contextMenu.targetId);
                            if (target) {
                                const newEl = { ...target, id: generateId(), x: target.x + 0.1, y: target.y + 0.1 };
                                setElements(prev => [...prev, newEl]);
                                setSelectedElementIds([newEl.id]);
                            }
                        }},
                        { label: 'Delete', icon: <Trash2 size={14}/>, action: deleteSelection }
                    ]}
                />
            )}
        </div>
    );
};

export default LabelTemplateBuilder;