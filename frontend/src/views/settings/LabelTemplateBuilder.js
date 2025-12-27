import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/api';
import { Rnd } from 'react-rnd';
import { v4 as uuidv4 } from 'uuid';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { QRCodeSVG } from 'qrcode.react';


// --- Constants ---
const DPI = 96; // Standard screen DPI
const GRID_STEP_INCHES = 0.125;
const TOOLBOX_ITEMS = {
  text: { type: 'text', name: 'Static Text' },
  variable: { type: 'variable', name: 'Variable' },
  show_logo: { type: 'image', name: 'Show Logo', content: '__SHOW_LOGO__' },
  company_logo: { type: 'image', name: 'Company Logo', content: '__COMPANY_LOGO__' },
  rect: { type: 'shape', shape: 'rectangle', name: 'Rectangle' },
  line: { type: 'shape', shape: 'line', name: 'Line' },
  circle: { type: 'shape', shape: 'circle', name: 'Circle' },
  qrcode: { type: 'qrcode', name: 'QR Code' },
};


// --- Helper Functions ---
const inchesToPixels = (inches, zoom) => inches * DPI * zoom;
const pixelsToInches = (pixels, zoom) => pixels / (DPI * zoom);

// --- Components ---

const ToolboxItem = ({ id, data }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id, data });
    const style = transform ? {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      zIndex: 1000,
      cursor: 'grabbing',
    } : { cursor: 'grab' };
  
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className="bg-gray-700 text-white p-2 rounded mb-2 text-center select-none"
      >
        {data.name}
      </div>
    );
};

const Toolbox = () => (
  <div className="bg-gray-800 h-full p-4 overflow-y-auto">
    <h2 className="text-lg font-bold text-white mb-4">Toolbox</h2>
    <div className="space-y-2">
        {Object.entries(TOOLBOX_ITEMS).map(([key, item]) => (
            <ToolboxItem key={key} id={key} data={item} />
        ))}
    </div>
  </div>
);

const Canvas = ({ elements, stock, zoom, onElementUpdate, onSelectElement, selectedElementId, setNodeRef, canvasRef }) => {
    if (!stock) {
      return (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          Select a label stock to begin.
        </div>
      );
    }
  
    const canvasWidthPx = inchesToPixels(stock.width_in, zoom);
    const canvasHeightPx = inchesToPixels(stock.height_in, zoom);
    const gridStepPx = inchesToPixels(GRID_STEP_INCHES, zoom);
  
    const gridStyle = {
      backgroundImage: `
        linear-gradient(to right, rgba(107, 114, 128, 0.5) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(107, 114, 128, 0.5) 1px, transparent 1px)
      `,
      backgroundSize: `${gridStepPx}px ${gridStepPx}px`,
    };
  
    return (
      <div ref={canvasRef}>
        <div
          ref={setNodeRef}
          className="bg-white shadow-lg relative"
          style={{
            width: `${canvasWidthPx}px`,
            height: `${canvasHeightPx}px`,
            ...gridStyle
          }}
          onClick={() => onSelectElement(null)} // Deselect on canvas click
        >
          {elements.map(element => (
            <Rnd
              key={element.id}
              size={{
                width: inchesToPixels(element.width, zoom),
                height: inchesToPixels(element.height, zoom),
              }}
              position={{
                x: inchesToPixels(element.x, zoom),
                y: inchesToPixels(element.y, zoom),
              }}
              onDragStop={(e, d) => onElementUpdate(element.id, { x: pixelsToInches(d.x, zoom), y: pixelsToInches(d.y, zoom) })}
              onResizeStop={(e, direction, ref, delta, position) => {
                onElementUpdate(element.id, {
                  width: pixelsToInches(ref.offsetWidth, zoom),
                  height: pixelsToInches(ref.offsetHeight, zoom),
                  x: pixelsToInches(position.x, zoom),
                  y: pixelsToInches(position.y, zoom),
                });
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectElement(element.id);
              }}
              enableResizing={{ top: true, right: true, bottom: true, left: true, topRight: true, bottomRight: true, bottomLeft: true, topLeft: true }}
              dragGrid={[gridStepPx, gridStepPx]}
              resizeGrid={[gridStepPx, gridStepPx]}
              className={`border-2 ${selectedElementId === element.id ? 'border-blue-500 bg-blue-500 bg-opacity-10' : 'border-transparent'}`}
            >
              <ElementRenderer element={element} zoom={zoom} />
            </Rnd>
          ))}
        </div>
      </div>
    );
};

const ElementRenderer = ({ element, zoom }) => {
    const baseStyle = {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    };

    switch (element.type) {
        case 'text':
            return (
                <div style={{
                    ...baseStyle,
                    color: element.text_color,
                    fontFamily: element.font_family,
                    fontSize: `${element.font_size * zoom}pt`,
                    fontWeight: element.font_weight,
                    textAlign: element.text_align,
                    padding: '2px',
                    whiteSpace: 'nowrap',
                }}>
                    {element.content_mode === 'variable' ? `{{${element.variable_field}}}` : element.text_content}
                </div>
            );
        case 'image':
            return (
                <div style={{ ...baseStyle, flexDirection: 'column', backgroundColor: '#e0e0e0', color: '#555', fontSize: '10px' }}>
                    <span className="font-bold">Image</span>
                    <span>{element.content === '__SHOW_LOGO__' ? 'Show Logo' : 'Company Logo'}</span>
                </div>
            );
        case 'shape':
            const svgStyle = {
                width: '100%',
                height: '100%',
                fill: element.fill_color,
                stroke: element.stroke_color,
                strokeWidth: `${element.stroke_width * zoom}pt`,
            };
            if (element.shape === 'rectangle') {
                return <svg style={svgStyle}><rect width="100%" height="100%" rx={element.corner_radius * DPI * zoom} /></svg>;
            }
            if (element.shape === 'circle') {
                return <svg style={svgStyle}><ellipse cx="50%" cy="50%" rx="50%" ry="50%" /></svg>;
            }
            if (element.shape === 'line') {
                return <svg style={svgStyle}><line x1="0" y1="50%" x2="100%" y2="50%" /></svg>;
            }
            return null;
        case 'qrcode':
            return (
                <div style={{...baseStyle, padding: '4px', backgroundColor: 'white'}}>
                    <QRCodeSVG value={`{{${element.qr_content}}}`} width="100%" height="100%" />
                </div>
            );
        default:
            return (
                <div className="w-full h-full flex items-center justify-center bg-gray-200">
                    <span className="text-xs text-gray-500">{element.type}</span>
                </div>
            );
    }
};

const PropertiesPanel = ({ element, onUpdate, variables }) => {
    if (!element) {
      return (
        <div className="bg-gray-800 h-full p-4 text-gray-400">
          <h2 className="text-lg font-bold text-white mb-4">Properties</h2>
          <p>Select an element to edit its properties.</p>
        </div>
      );
    }
  
    const handleUpdate = (prop, value) => {
      onUpdate(element.id, { [prop]: value });
    };
  
    return (
      <div className="bg-gray-800 h-full p-4 text-white overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">Properties: {element.type}</h2>
        
        {/* Common Properties */}
        <div className="grid grid-cols-2 gap-2 mb-4">
            <div><label>X (in)</label><input type="number" step="0.01" value={element.x.toFixed(3)} onChange={e => handleUpdate('x', parseFloat(e.target.value))} className="w-full bg-gray-700 p-1 rounded" /></div>
            <div><label>Y (in)</label><input type="number" step="0.01" value={element.y.toFixed(3)} onChange={e => handleUpdate('y', parseFloat(e.target.value))} className="w-full bg-gray-700 p-1 rounded" /></div>
            <div><label>W (in)</label><input type="number" step="0.01" value={element.width.toFixed(3)} onChange={e => handleUpdate('width', parseFloat(e.target.value))} className="w-full bg-gray-700 p-1 rounded" /></div>
            <div><label>H (in)</label><input type="number" step="0.01" value={element.height.toFixed(3)} onChange={e => handleUpdate('height', parseFloat(e.target.value))} className="w-full bg-gray-700 p-1 rounded" /></div>
        </div>
        
        {/* Text-specific Properties */}
        {element.type === 'text' && (
          <div className="space-y-3">
            {element.content_mode === 'static' ? (
              <div><label>Content</label><input type="text" value={element.text_content} onChange={e => handleUpdate('text_content', e.target.value)} className="w-full bg-gray-700 p-1 rounded" /></div>
            ) : (
              <div>
                <label>Variable</label>
                <select value={element.variable_field} onChange={e => handleUpdate('variable_field', e.target.value)} className="w-full bg-gray-700 p-1 rounded">
                  {Object.entries(variables).map(([category, fields]) => (
                    <optgroup label={category} key={category}>
                      {fields.map(field => <option key={field} value={field}>{field}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
            <div><label>Font Size (pt)</label><input type="number" value={element.font_size} onChange={e => handleUpdate('font_size', parseInt(e.target.value, 10))} className="w-full bg-gray-700 p-1 rounded" /></div>
            <div><label>Font Weight</label><select value={element.font_weight} onChange={e => handleUpdate('font_weight', e.target.value)} className="w-full bg-gray-700 p-1 rounded"><option value="normal">Normal</option><option value="bold">Bold</option></select></div>
            <div><label>Alignment</label><select value={element.text_align} onChange={e => handleUpdate('text_align', e.target.value)} className="w-full bg-gray-700 p-1 rounded"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div>
            <div><label>Color</label><input type="color" value={element.text_color} onChange={e => handleUpdate('text_color', e.target.value)} className="w-full bg-gray-700 p-1 rounded" /></div>
          </div>
        )}

        {/* Shape-specific Properties */}
        {element.type === 'shape' && (
            <div className="space-y-3">
                <div><label>Fill Color</label><input type="color" value={element.fill_color} onChange={e => handleUpdate('fill_color', e.target.value)} className="w-full bg-gray-700 p-1 rounded" /></div>
                <div><label>Stroke Color</label><input type="color" value={element.stroke_color} onChange={e => handleUpdate('stroke_color', e.target.value)} className="w-full bg-gray-700 p-1 rounded" /></div>
                <div><label>Stroke Width (pt)</label><input type="number" step="0.1" value={element.stroke_width} onChange={e => handleUpdate('stroke_width', parseFloat(e.target.value))} className="w-full bg-gray-700 p-1 rounded" /></div>
                {element.shape === 'rectangle' && (
                    <div><label>Corner Radius (in)</label><input type="number" step="0.01" value={element.corner_radius} onChange={e => handleUpdate('corner_radius', parseFloat(e.target.value))} className="w-full bg-gray-700 p-1 rounded" /></div>
                )}
            </div>
        )}

        {/* QR Code-specific Properties */}
        {element.type === 'qrcode' && (
            <div className="space-y-3">
                <div>
                    <label>QR Content (Variable)</label>
                    <select value={element.qr_content} onChange={e => handleUpdate('qr_content', e.target.value)} className="w-full bg-gray-700 p-1 rounded">
                      {Object.entries(variables).map(([category, fields]) => (
                        <optgroup label={category} key={category}>
                          {fields.map(field => <option key={field} value={field}>{field}</option>)}
                        </optgroup>
                      ))}
                    </select>
                </div>
            </div>
        )}
      </div>
    );
};

const LabelTemplateBuilder = () => {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const canvasRef = useRef(null);
    const mainContentRef = useRef(null);
  
    // State
    const [templateName, setTemplateName] = useState('New Label Template');
    const [isAllowed, setIsAllowed] = useState(false);
    const [labelStocks, setLabelStocks] = useState([]);
    const [selectedStockId, setSelectedStockId] = useState('');
    const [elements, setElements] = useState([]);
    const [selectedElementId, setSelectedElementId] = useState(null);
    const [zoom, setZoom] = useState(1);
  
    const selectedStock = useMemo(() => {
      return labelStocks.find(stock => stock.id === selectedStockId);
    }, [labelStocks, selectedStockId]);
  
    const selectedElement = useMemo(() => {
        return elements.find(el => el.id === selectedElementId);
    }, [elements, selectedElementId]);

    const variableFields = {
        "Case": ["Case Number", "Contents", "Department", "Weight", "Truck Layer", "Show Name"],
        "Loom": ["Loom Name", "Source", "Destination", "Cable Count", "Length", "Color Code", "Show Name"],
        "Global": ["Current Date", "User Name"],
    };

    const { setNodeRef } = useDroppable({ id: 'canvas' });

      // --- Effects ---
  useEffect(() => {
    if (profile) {
      const hasAccess = profile.permitted_features?.includes('label_engine');
      if (hasAccess) setIsAllowed(true);
      else {
        toast.error("You don't have access to the Label Template Builder.");
        navigate('/library');
      }
    }
  }, [profile, navigate]);

  useEffect(() => {
    if (isAllowed) {
      api.getLabelStocks()
        .then(response => {
          setLabelStocks(response);
        })
        .catch(error => {
          console.error(error);
          toast.error('Failed to load label stock definitions.');
        });
    }
  }, [isAllowed]);

  // --- Handlers ---
  const handleElementUpdate = (id, newProps) => {
    setElements(prev => prev.map(el => (el.id === id ? { ...el, ...newProps } : el)));
  };

  const handleSelectElement = (id) => setSelectedElementId(id);

  const handleDragEnd = (event) => {
    const { over, active, activatorEvent } = event;
    if (over && over.id === 'canvas' && canvasRef.current && mainContentRef.current) {
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const mainRect = mainContentRef.current.getBoundingClientRect();
        const itemData = active.data.current;
  
        // Correctly calculate the drop position relative to the canvas, accounting for scroll
        const dropX = activatorEvent.clientX - canvasRect.left;
        const dropY = activatorEvent.clientY - canvasRect.top;
  
        const newElement = createNewElement(itemData, dropX, dropY);
        if (newElement) {
          setElements(prev => [...prev, newElement]);
        }
    }
  };
  
  const createNewElement = (itemData, xPx, yPx) => {
    const baseElement = {
      id: uuidv4(),
      x: pixelsToInches(xPx, zoom),
      y: pixelsToInches(yPx, zoom),
      z_index: elements.length + 1,
      width: 2, height: 0.5, // Default size in inches
    };

    switch (itemData.type) {
        case 'text':
        case 'variable':
            return {
                ...baseElement,
                type: 'text',
                content_mode: itemData.type,
                text_content: "Text",
                variable_field: "Case Number",
                font_family: "SpaceMono",
                font_size: 12,
                font_weight: "normal",
                text_align: "left",
                text_color: "#000000",
            };
        case 'image':
            return { ...baseElement, type: 'image', content: itemData.content };
        case 'shape':
            return {
                ...baseElement,
                width: 1, height: 1, // shapes default to 1x1 inch
                type: 'shape',
                shape: itemData.shape,
                fill_color: "#cccccc",
                stroke_color: "#000000",
                stroke_width: 1.5,
                corner_radius: 0,
            };
        case 'qrcode':
            return {
                ...baseElement,
                width: 1, height: 1, // QR codes default to 1x1 inch
                type: 'qrcode',
                qr_content: 'Case Number',
            };
        default:
            return { ...baseElement, type: itemData.type };
    }
  };

  const handleSave = async () => {
    if (!templateName) {
        toast.error("Please enter a name for the template.");
        return;
    }
    if (!selectedStockId) {
        toast.error("Please select a label stock.");
        return;
    }

    const payload = {
        name: templateName,
        stock_id: selectedStockId,
        category: 'case', 
        elements: elements,
        is_public: false,
    };

    const toastId = toast.loading("Saving template...");
    try {
        await api.createLabelTemplate(payload);
        toast.success("Template saved successfully!", { id: toastId });
        navigate('/library/label-templates');
    } catch (error) {
        toast.error(`Failed to save template: ${error.message}`, { id: toastId });
    }
  };

  if (!isAllowed) return null;

  return (
    <DndContext onDragEnd={handleDragEnd}>
        <div className="flex h-full flex-col bg-gray-900">
            <header className="bg-gray-800 p-4 shadow-md z-10 flex justify-between items-center">
                <input 
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="bg-gray-700 text-white text-xl font-bold rounded p-2"
                    placeholder="Template Name"
                />
                <div className="flex items-center">
                    <div className="flex items-center text-white mr-6">
                        <label htmlFor="zoom" className="mr-2">Zoom:</label>
                        <input
                            type="range" id="zoom" min="0.5" max="2" step="0.1"
                            value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="w-32"
                        />
                        <span className="ml-2 w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
                    </div>
                    <select
                        className="bg-gray-700 text-white rounded p-2 mr-4"
                        value={selectedStockId}
                        onChange={(e) => setSelectedStockId(e.target.value)}
                    >
                        <option value="">Select Label Stock</option>
                        {labelStocks.map(stock => (
                        <option key={stock.id} value={stock.id}>{stock.name} ({stock.width_in}" x {stock.height_in}")</option>
                        ))}
                    </select>
                    <button onClick={handleSave} className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
                        Save Template
                    </button>
                </div>
            </header>
            <div className="flex flex-grow overflow-hidden">
                <div className="w-64 flex-shrink-0">
                    <Toolbox />
                </div>
                <main ref={mainContentRef} className="flex-grow flex items-center justify-center overflow-auto p-8 bg-gray-900">
                    <Canvas
                        elements={elements}
                        stock={selectedStock}
                        zoom={zoom}
                        onElementUpdate={handleElementUpdate}
                        onSelectElement={handleSelectElement}
                        selectedElementId={selectedElementId}
                        setNodeRef={setNodeRef}
                        canvasRef={canvasRef}
                    />
                </main>
                <aside className="w-80 flex-shrink-0">
                    <PropertiesPanel 
                        element={selectedElement}
                        onUpdate={handleElementUpdate}
                        variables={variableFields}
                    />
                </aside>
            </div>
        </div>
    </DndContext>
  );
};

export default LabelTemplateBuilder;
