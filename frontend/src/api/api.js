import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase URL or Anon Key is missing. Please check your .env file.");
}
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
};

const handleResponse = async (res) => {
    if (!res.ok) {
        const errorText = await res.text();
        try {
            const errorJson = JSON.parse(errorText);
            throw new Error(errorJson.detail || 'An unknown error occurred');
        } catch {
            throw new Error(errorText || res.statusText);
        }
    }
    if (res.headers.get('Content-Type')?.includes('application/json')) {
        return res.json();
    }
    if (res.headers.get('Content-Type')?.includes('application/pdf')) {
        return res.blob();
    }
    return res;
};

export const api = {
    getShows: async () => fetch('/api/shows', { headers: await getAuthHeader() }).then(handleResponse),
    getShow: async (showName) => fetch(`/api/shows/${showName}`, { headers: await getAuthHeader() }).then(handleResponse),
    saveShow: async (showName, data) => fetch(`/api/shows/${showName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(data),
    }).then(handleResponse),
    deleteShow: async (showName) => fetch(`/api/shows/${showName}`, { method: 'DELETE', headers: await getAuthHeader() }).then(res => { if (!res.ok) throw new Error("Delete failed") }),
    uploadLogo: async (formData) => fetch('/api/upload/logo', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: formData,
    }).then(handleResponse),
    generatePdf: async (type, body) => fetch(`/api/pdf/${type}-labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(body),
    }).then(handleResponse),
    getProfile: async () => fetch('/api/profile', { headers: await getAuthHeader() }).then(handleResponse),
    updateProfile: async (profileData) => fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(profileData),
    }).then(handleResponse),
    getSsoConfig: async () => fetch('/api/sso_config', { headers: await getAuthHeader() }).then(handleResponse),
    updateSsoConfig: async (ssoData) => fetch('/api/sso_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(ssoData),
    }).then(handleResponse),
    deleteAccount: async () => fetch('/api/profile', { method: 'DELETE', headers: await getAuthHeader() }),
    createRack: async (rackData) => fetch('/api/racks', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(rackData) }).then(handleResponse),
    getRacksForShow: async (showName) => fetch(`/api/racks?show_name=${showName}`, { headers: await getAuthHeader() }).then(handleResponse),
    getRackDetails: async (rackId) => fetch(`/api/racks/${rackId}`, { headers: await getAuthHeader() }).then(handleResponse),
    updateRack: async (rackId, rackData) => fetch(`/api/racks/${rackId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(rackData) }).then(handleResponse),
    deleteRack: async (rackId) => fetch(`/api/racks/${rackId}`, { method: 'DELETE', headers: await getAuthHeader() }).then(res => { if (!res.ok) throw new Error("Delete failed") }),    addEquipmentToRack: async (rackId, equipmentData) => fetch(`/api/racks/${rackId}/equipment`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(equipmentData) }).then(handleResponse),
    getEquipmentTemplates: async () => fetch('/api/equipment', { headers: await getAuthHeader() }).then(handleResponse),
    getLibrary: async () => fetch('/api/library', { headers: await getAuthHeader() }).then(handleResponse),
    moveEquipmentInRack: async (instanceId, newPositionData) => fetch(`/api/racks/equipment/${instanceId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(newPositionData) }).then(handleResponse),
    deleteEquipmentFromRack: async (instanceId) => fetch(`/api/racks/equipment/${instanceId}`, { method: 'DELETE', headers: await getAuthHeader() }),
    getAdminLibrary: async () => fetch('/api/admin/library', { headers: await getAuthHeader() }).then(handleResponse),
    createAdminFolder: async (folderData) => fetch('/api/admin/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(folderData),
    }).then(handleResponse),
    createAdminEquipment: async (equipmentData) => fetch('/api/admin/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(equipmentData),
    }).then(handleResponse),
    deleteAdminFolder: async (folderId) => fetch(`/api/admin/folders/${folderId}`, {
        method: 'DELETE',
        headers: await getAuthHeader()
    }),
    deleteAdminEquipment: async (equipmentId) => fetch(`/api/admin/equipment/${equipmentId}`, {
        method: 'DELETE',
        headers: await getAuthHeader()
    }),
    
    getConnectionsForShow: async (showName) => fetch(`/api/connections/${showName}`, { headers: await getAuthHeader() }).then(handleResponse),
    createConnection: async (connectionData) => fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(connectionData),
    }).then(handleResponse),
    updateConnection: async (connectionId, updateData) => fetch(`/api/connections/${connectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(updateData),
    }).then(handleResponse),
    deleteConnection: async (connectionId) => fetch(`/api/connections/${connectionId}`, {
        method: 'DELETE',
        headers: await getAuthHeader()
    }),
    
    updateEquipmentInstance: async (instanceId, updateData) => fetch(`/api/racks/equipment/${instanceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(updateData),
    }).then(handleResponse),

    updateAdminFolder: async (folderId, folderData) => fetch(`/api/admin/folders/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(folderData),
    }).then(handleResponse),
    updateAdminEquipment: async (equipmentId, equipmentData) => fetch(`/api/admin/equipment/${equipmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(equipmentData),
    }).then(handleResponse),
    createUserFolder: async (folderData) => fetch('/api/library/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(folderData),
    }).then(handleResponse),
    updateUserFolder: async (folderId, folderData) => fetch(`/api/library/folders/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(folderData),
    }).then(handleResponse),
    deleteUserFolder: async (folderId) => fetch(`/api/library/folders/${folderId}`, {
        method: 'DELETE',
        headers: await getAuthHeader()
    }),
    createUserEquipment: async (equipmentData) => fetch('/api/library/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(equipmentData),
    }).then(handleResponse),
    updateUserEquipment: async (equipmentId, equipmentData) => fetch(`/api/library/equipment/${equipmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(equipmentData),
    }).then(handleResponse),
    deleteUserEquipment: async (equipmentId) => fetch(`/api/library/equipment/${equipmentId}`, {
        method: 'DELETE',
        headers: await getAuthHeader()
    }),
    copyEquipmentToLibrary: async (copyData) => fetch('/api/library/copy_equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(copyData),
    }).then(handleResponse),
    getLibraryRacks: async () => fetch(`/api/racks?from_library=true`, { headers: await getAuthHeader() }).then(handleResponse),
    copyRackFromLibrary: async (rackId, showName) => fetch('/api/racks/load_from_library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ template_rack_id: rackId, show_name: showName }),
    }).then(handleResponse),
    generateWireDiagramPdf: async (payload) => fetch('/api/pdf/wire-diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(payload),
    }).then(handleResponse),
};