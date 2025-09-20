import React, { useState } from 'react';
import { useReactFlow } from 'reactflow';
import { exportWirePdf } from '../../api/exportWirePdf';

const ExportWirePdfButton = ({ backendBaseUrl }) => {
  const [isLoading, setIsLoading] = useState(false);
  const { getNodes, getEdges } = useReactFlow();

  const handleExport = async () => {
    setIsLoading(true);
    try {
      const nodes = getNodes();
      const edges = getEdges();

      // Transform React Flow data to the format required by the backend
      const apiGraph = {
        nodes: nodes.map(node => ({
          id: node.id,
          deviceNomenclature: node.data.deviceNomenclature || 'N/A',
          modelNumber: node.data.modelNumber || 'N/A',
          rackName: node.data.rackName || 'Unracked',
          deviceRu: node.data.deviceRu || 0,
          ipAddress: node.data.ipAddress || '',
          ports: node.data.ports || {},
        })),
        edges: edges.map(edge => ({
          source: edge.source,
          sourceHandle: edge.sourceHandle,
          target: edge.target,
          targetHandle: edge.targetHandle,
        })),
      };

      await exportWirePdf(apiGraph, { baseUrl: backendBaseUrl });

    } catch (error) {
      console.error('Failed to export wire PDF:', error);
      alert(`Error exporting PDF: ${error.message}`); // Simple feedback for now
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button onClick={handleExport} disabled={isLoading} style={{padding: '8px 12px', cursor: 'pointer'}}>
      {isLoading ? 'Exporting...' : 'Export as PDF'}
    </button>
  );
};

export default ExportWirePdfButton;
