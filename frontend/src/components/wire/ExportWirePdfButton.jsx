import React, { useState } from 'react';
import { exportWirePdf } from '../../api/exportWirePdf';

// The component now receives getNodes and getEdges as props instead of using the useReactFlow hook.
const ExportWirePdfButton = ({ backendBaseUrl, getNodes, getEdges }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async () => {
    setIsLoading(true);
    try {
      if (!getNodes || !getEdges) {
        console.error("ExportWirePdfButton is missing required props: getNodes or getEdges.");
        alert("Error: Export function is not configured correctly.");
        setIsLoading(false); // Stop loading on error
        return;
      }

      const nodes = getNodes();
      const edges = getEdges();

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
      alert(`Error exporting PDF: ${error.message}`);
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
