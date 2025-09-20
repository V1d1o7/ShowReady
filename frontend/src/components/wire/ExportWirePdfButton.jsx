import React, { useState } from 'react';
import { api } from '../../api/api';

const ExportWirePdfButton = ({ getNodes, getEdges }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async () => {
    setIsLoading(true);
    try {
      if (!getNodes || !getEdges) {
        console.error("ExportWirePdfButton is missing required props: getNodes or getEdges.");
        alert("Error: Export function is not configured correctly.");
        return;
      }

      const nodes = getNodes();
      const edges = getEdges();

      console.log("--- DEBUG: React Flow Nodes ---");
      console.log(JSON.stringify(nodes, null, 2));
      console.log("-------------------------------");

      const apiGraph = {
        nodes: nodes.map(node => {
          // FINAL FIX: Use the correct properties (port.type, port.label) from the node data
          const portsData = node.data?.equipment_templates?.ports || [];
          const portsDict = portsData.reduce((acc, port) => {
            if (port.type === 'input') {
              const handleId = `port-in-${port.id}`;
              acc[handleId] = { name: port.label };
            } else if (port.type === 'output') {
              const handleId = `port-out-${port.id}`;
              acc[handleId] = { name: port.label };
            } else if (port.type === 'io') {
              // IO ports have both an input and an output handle
              const inHandleId = `port-in-${port.id}`;
              const outHandleId = `port-out-${port.id}`;
              acc[inHandleId] = { name: port.label };
              acc[outHandleId] = { name: port.label };
            }
            return acc;
          }, {});

          return {
            id: node.id,
            deviceNomenclature: node.data.instance_name || 'N/A',
            modelNumber: node.data.equipment_templates?.model_number || 'N/A',
            rackName: node.data.rack_name || 'Unracked',
            deviceRu: node.data.ru_position || 0,
            ipAddress: node.data.ip_address || '',
            ports: portsDict,
          };
        }),
        edges: edges.map(edge => ({
          source: edge.source,
          sourceHandle: edge.sourceHandle,
          target: edge.target,
          targetHandle: edge.targetHandle,
        })),
      };

      const blob = await api.exportWirePdf(apiGraph);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'wire-export.pdf';

      document.body.appendChild(a);
      a.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

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
