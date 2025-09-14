import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase URL or Anon Key is missing. Please check your .env file.");
}
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const getAuthHeader = async (isFormData = false) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {};
    if (session) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    if (!isFormData) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
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
    // For DELETE requests with no content
    if (res.status === 204) {
        return;
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
        headers: await getAuthHeader(),
        body: JSON.stringify(data),
    }).then(handleResponse),
    deleteShow: async (showName) => fetch(`/api/shows/${showName}`, { method: 'DELETE', headers: await getAuthHeader() }).then(res => { if (!res.ok) throw new Error("Delete failed") }),
    uploadLogo: async (formData) => fetch('/api/upload/logo', {
        method: 'POST',
        headers: await getAuthHeader(true),
        body: formData,
    }).then(handleResponse),
    generatePdf: async (type, body) => fetch(`/api/pdf/${type}-labels`, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(body),
    }).then(handleResponse),
    getProfile: async () => fetch('/api/profile', { headers: await getAuthHeader() }).then(handleResponse),
    updateProfile: async (profileData) => fetch('/api/profile', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(profileData),
    }).then(handleResponse),
    getSsoConfig: async () => fetch('/api/sso_config', { headers: await getAuthHeader() }).then(handleResponse),
    updateSsoConfig: async (ssoData) => fetch('/api/sso_config', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(ssoData),
    }).then(handleResponse),
    deleteAccount: async () => fetch('/api/profile', { method: 'DELETE', headers: await getAuthHeader() }),
    createRack: async (rackData) => fetch('/api/racks', { method: 'POST', headers: await getAuthHeader(), body: JSON.stringify(rackData) }).then(handleResponse),
    getRacksForShow: async (showName) => fetch(`/api/racks?show_name=${showName}`, { headers: await getAuthHeader() }).then(handleResponse),
    getDetailedRacksForShow: async (showName) => fetch(`/api/shows/${showName}/detailed_racks`, { headers: await getAuthHeader() }).then(handleResponse),
    getRackDetails: async (rackId) => fetch(`/api/racks/${rackId}`, { headers: await getAuthHeader() }).then(handleResponse),
    updateRack: async (rackId, rackData) => fetch(`/api/racks/${rackId}`, { method: 'PUT', headers: await getAuthHeader(), body: JSON.stringify(rackData) }).then(handleResponse),
    deleteRack: async (rackId) => fetch(`/api/racks/${rackId}`, { method: 'DELETE', headers: await getAuthHeader() }),
    addEquipmentToRack: async (rackId, equipmentData) => fetch(`/api/racks/${rackId}/equipment`, { method: 'POST', headers: await getAuthHeader(), body: JSON.stringify(equipmentData) }).then(handleResponse),
    getEquipmentTemplates: async () => fetch('/api/equipment', { headers: await getAuthHeader() }).then(handleResponse),
    getLibrary: async () => fetch('/api/library', { headers: await getAuthHeader() }).then(handleResponse),
    moveEquipmentInRack: async (instanceId, newPositionData) => fetch(`/api/racks/equipment/${instanceId}`, { method: 'PUT', headers: await getAuthHeader(), body: JSON.stringify(newPositionData) }).then(handleResponse),
    deleteEquipmentFromRack: async (instanceId) => fetch(`/api/racks/equipment/${instanceId}`, { method: 'DELETE', headers: await getAuthHeader() }),
    getEquipmentInstance: async (instanceId) => fetch(`/api/racks/equipment/${instanceId}`, { headers: await getAuthHeader() }).then(handleResponse),
    getAdminLibrary: async () => fetch('/api/admin/library', { headers: await getAuthHeader() }).then(handleResponse),
    createAdminFolder: async (folderData) => fetch('/api/admin/folders', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(folderData),
    }).then(handleResponse),
    createAdminEquipment: async (equipmentData) => fetch('/api/admin/equipment', {
        method: 'POST',
        headers: await getAuthHeader(),
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
    getConnectionsForDevice: async (instanceId) => fetch(`/api/equipment/${instanceId}/connections`, { headers: await getAuthHeader() }).then(handleResponse),
    createConnection: async (connectionData) => fetch('/api/connections', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(connectionData),
    }).then(handleResponse),
    updateConnection: async (connectionId, updateData) => fetch(`/api/connections/${connectionId}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(updateData),
    }).then(handleResponse),
    deleteConnection: async (connectionId) => fetch(`/api/connections/${connectionId}`, {
        method: 'DELETE',
        headers: await getAuthHeader()
    }),
    
    updateEquipmentInstance: async (instanceId, updateData) => fetch(`/api/racks/equipment/${instanceId}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(updateData),
    }).then(handleResponse),

    updateAdminFolder: async (folderId, folderData) => fetch(`/api/admin/folders/${folderId}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(folderData),
    }).then(handleResponse),
    updateAdminEquipment: async (equipmentId, equipmentData) => fetch(`/api/admin/equipment/${equipmentId}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(equipmentData),
    }).then(handleResponse),
    createUserFolder: async (folderData) => fetch('/api/library/folders', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(folderData),
    }).then(handleResponse),
    updateUserFolder: async (folderId, folderData) => fetch(`/api/library/folders/${folderId}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(folderData),
    }).then(handleResponse),
    deleteUserFolder: async (folderId) => fetch(`/api/library/folders/${folderId}`, {
        method: 'DELETE',
        headers: await getAuthHeader()
    }),
    createUserEquipment: async (equipmentData) => fetch('/api/library/equipment', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(equipmentData),
    }).then(handleResponse),
    updateUserEquipment: async (equipmentId, equipmentData) => fetch(`/api/library/equipment/${equipmentId}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(equipmentData),
    }).then(handleResponse),
    deleteUserEquipment: async (equipmentId) => fetch(`/api/library/equipment/${equipmentId}`, {
        method: 'DELETE',
        headers: await getAuthHeader()
    }),
    copyEquipmentToLibrary: async (copyData) => fetch('/api/library/copy_equipment', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(copyData),
    }).then(handleResponse),
    getLibraryRacks: async () => fetch(`/api/racks?from_library=true`, { headers: await getAuthHeader() }).then(handleResponse),
    copyRackFromLibrary: async (rackId, showName, newRackName) => fetch('/api/racks/load_from_library', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({ template_rack_id: rackId, show_name: showName, new_rack_name: newRackName }),
    }).then(handleResponse),
    getUnassignedEquipment: async (showName) => fetch(`/api/shows/${showName}/unassigned_equipment`, { headers: await getAuthHeader() }).then(handleResponse),
    generateWireDiagramPdf: async (payload) => fetch('/api/pdf/wire-diagram', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(payload),
    }).then(handleResponse),
    generateRacksPdf: async (payload) => fetch('/api/pdf/racks', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(payload),
    }).then(handleResponse),

    // --- Loom Builder Endpoints ---
    // Loom (Container) Endpoints
    getLoomsForShow: async (showName) => fetch(`/api/shows/${showName}/looms`, { headers: await getAuthHeader() }).then(handleResponse),
    createLoom: async (loomData) => fetch('/api/looms', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(loomData),
    }).then(handleResponse),
    updateLoom: async (loomId, loomData) => fetch(`/api/looms/${loomId}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(loomData),
    }).then(handleResponse),
    deleteLoom: async (loomId) => fetch(`/api/looms/${loomId}`, {
        method: 'DELETE',
        headers: await getAuthHeader(),
    }),

    // Cable (Item) Endpoints
    getCablesForLoom: async (loomId) => fetch(`/api/looms/${loomId}/cables`, { headers: await getAuthHeader() }).then(handleResponse),
    createCable: async (cableData) => fetch('/api/cables', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(cableData),
    }).then(handleResponse),
    updateCable: async (cableId, cableData) => fetch(`/api/cables/${cableId}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(cableData),
    }).then(handleResponse),
    deleteCable: async (cableId) => fetch(`/api/cables/${cableId}`, {
        method: 'DELETE',
        headers: await getAuthHeader(),
    }),

    sendNewUserListEmail: async (payload) => fetch('/api/admin/send-new-user-list-email', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(payload),
    }).then(handleResponse),

    // --- Admin Metrics Endpoints ---
    getMetrics: async () => fetch('/api/admin/metrics', { headers: await getAuthHeader() }).then(handleResponse),
    
    // --- Admin User Management Endpoints ---
    getAllUsers: async (searchTerm) => {
        const url = searchTerm ? `/api/admin/users?search=${encodeURIComponent(searchTerm)}` : '/api/admin/users';
        return fetch(url, { headers: await getAuthHeader() }).then(handleResponse);
    },
    getAllRoles: async () => fetch('/api/admin/user-roles', { headers: await getAuthHeader() }).then(handleResponse),
    updateUserRoles: async (userId, roles) => fetch(`/api/admin/users/${userId}/roles`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify({ roles }),
    }).then(handleResponse),
    suspendUser: async (userId, payload) => fetch(`/api/admin/users/${userId}/suspend`, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(payload),
    }).then(handleResponse),
    unsuspendUser: async (userId) => fetch(`/api/admin/users/${userId}/unsuspend`, {
        method: 'POST',
        headers: await getAuthHeader(),
    }).then(handleResponse),
    
    // --- Admin Email Endpoints ---
    getAdminUserRoles: async () => fetch('/api/admin/user-roles', { headers: await getAuthHeader() }).then(handleResponse),
    adminSendEmail: async (payload) => fetch('/api/admin/send-email', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(payload),
    }).then(handleResponse),

    // --- Admin Sender Identity Endpoints ---
    getSenderIdentities: async () => fetch('/api/admin/senders', { headers: await getAuthHeader() }).then(handleResponse),
    createSenderIdentity: async (data) => fetch('/api/admin/senders', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(data),
    }).then(handleResponse),
    deleteSenderIdentity: async (id) => fetch(`/api/admin/senders/${id}`, {
        method: 'DELETE',
        headers: await getAuthHeader()
    }).then(handleResponse),

    // --- Admin RBAC Endpoints ---
    getAllFeatureRestrictions: async () => fetch('/api/admin/feature_restrictions', { headers: await getAuthHeader() }).then(handleResponse),
    updateFeatureRestriction: async (featureName, restrictionData) => fetch(`/api/admin/feature_restrictions/${featureName}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(restrictionData),
    }).then(handleResponse),

    // --- Permissions Versioning ---
    getPermissionsVersion: async () => fetch('/api/permissions/version', { headers: await getAuthHeader() }).then(handleResponse),
};
