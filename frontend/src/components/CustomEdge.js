import React from 'react';
import { getBezierPath } from 'reactflow';

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      <foreignObject
        width="1"
        height="1"
        x={sourceX + 5}
        y={sourceY - 15}
        style={{ overflow: 'visible' }}
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
    </>
  );
}