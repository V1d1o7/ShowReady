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

      const apiGraph = {
        nodes: nodes.map(node => {
          // FIX: Correctly transform the ports array into a dictionary
          const portsData = node.data?.equipment_templates?.ports || [];
          const portsDict = portsData.reduce((acc, port) => {
            // The handle ID is constructed based on the convention used in WireDiagramView and DeviceNode
            const handleId = `port-${port.port_type}-${port.id}`;
            acc[handleId] = { name: port.port_name };
            return acc;
          }, {});

          return {
            id: node.id,
            // Use instance_name as a fallback for deviceNomenclature
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
