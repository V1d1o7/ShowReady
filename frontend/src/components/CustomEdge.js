import React from 'react';
import { StepEdge } from 'reactflow';

export default function CustomEdge(props) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    data,
  } = props;

  // Manually calculate the center for the label
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;

  return (
    <>
      <StepEdge {...props} borderRadius={10} />
      {data.label && (
        <foreignObject
          width="40"
          height="30"
          x={labelX - 20} // Offset by half width
          y={labelY - 15} // Offset by half height
          style={{ overflow: 'visible', textAlign: 'center' }}
          requiredExtensions="http://www.w3.org/1999/xhtml"
        >
            <div
              style={{
                padding: '2px 4px',
                borderRadius: '4px',
                fontSize: '8px',
                fontWeight: 'bold',
                color: '#fff',
                backgroundColor: '#27272a',
                display: 'inline-block',
              }}
            >
              {data.label}
            </div>
        </foreignObject>
      )}
    </>
  );
}