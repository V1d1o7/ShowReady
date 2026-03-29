import React from 'react';
import { StepEdge } from 'reactflow';

export default function CustomEdge(props) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    data,
    selected,
    style,
  } = props;

  // Manually calculate the center for the label
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;

  // Highlight style when selected
  const customStyle = {
    ...style,
    stroke: selected ? '#3b82f6' : style?.stroke, // Bright blue when selected, default otherwise
    strokeWidth: selected ? 4 : style?.strokeWidth || 2, // Thicker when selected
    zIndex: selected ? 1000 : 0, // Bring to front when selected
  };

  return (
    <>
      <StepEdge 
        {...props} 
        style={customStyle} 
        borderRadius={10} 
      />
      {data.label && (
        <foreignObject
          width="40"
          height="30"
          x={labelX - 20} // Offset by half width
          y={labelY - 15} // Offset by half height
          style={{ overflow: 'visible', textAlign: 'center', zIndex: selected ? 1000 : 0 }}
          requiredExtensions="http://www.w3.org/1999/xhtml"
        >
            <div
              style={{
                padding: '2px 4px',
                borderRadius: '4px',
                fontSize: '8px',
                fontWeight: 'bold',
                color: '#fff',
                backgroundColor: selected ? '#3b82f6' : '#27272a', // Change label background if selected
                display: 'inline-block',
                transition: 'background-color 0.2s ease',
              }}
            >
              {data.label}
            </div>
        </foreignObject>
      )}
    </>
  );
}