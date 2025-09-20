/**
 * Calls the backend to export a wire diagram as a PDF and triggers a download.
 * @param {object} graph - The graph object containing nodes and edges.
 * @param {object} options - Optional parameters.
 * @param {string} options.filename - The desired filename for the downloaded PDF.
 * @param {string} options.baseUrl - The base URL of the backend API.
 */
export async function exportWirePdf(graph, { filename = 'wire-export.pdf', baseUrl = '' } = {}) {
  try {
    const response = await fetch(`${baseUrl}/export/wire.pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graph),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ detail: 'An unknown error occurred while parsing the error response.' }));
      throw new Error(`Failed to export PDF: ${response.status} ${response.statusText} - ${errorBody.detail}`);
    }

    const blob = await response.blob();

    // Check if the blob is of type application/pdf
    if (blob.type !== 'application/pdf') {
      // If not, try to read it as text to see the error message from the server
      const errorText = await blob.text();
      throw new Error(`Server returned an error: ${errorText}`);
    }

    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();

    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

  } catch (error) {
    console.error('Error exporting wire PDF:', error);
    throw error; // Re-throw to be caught by the calling component
  }
}
