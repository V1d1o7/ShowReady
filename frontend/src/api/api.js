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
    if (res.headers.get('Content-Type')?.includes('application/pdf') || res.headers.get('Content-Type')?.includes('text/plain')) {
        return res.blob();
    }
    return res;
};

export const api = {
    getShows: async () => fetch('/api/shows', { headers: await getAuthHeader() }).then(handleResponse),
    getShow: async (showId) => fetch(`/api/shows/${showId}`, { headers: await getAuthHeader() }).then(handleResponse),
    getShowByName: async (showName) => fetch(`/api/shows/by-name/${showName}`, { headers: await getAuthHeader() }).then(handleResponse),
    saveShow: async (showId, data) => fetch(`/api/shows/${showId}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(data),
    }).then(handleResponse),
    createShow: async (data) => fetch('/api/shows', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(data),
    }).then(handleResponse),
    deleteShow: async (showId) => fetch(`/api/shows/${showId}`, { method: 'DELETE', headers: await getAuthHeader() }).then(res => { if (!res.ok) throw new Error("Delete failed") }),
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

    generateHoursPdf: async (body) => fetch('/api/pdf/hours-labels', {
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
    getRacksForShow: async (showId) => fetch(`/api/shows/${showId}/racks`, { headers: await getAuthHeader() }).then(handleResponse),
    getDetailedRacksForShow: async (showId) => fetch(`/api/shows/${showId}/detailed_racks`, { headers: await getAuthHeader() }).then(handleResponse),
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

    // --- Admin Switch Config ---
    getSwitchModels: async () => fetch('/api/v1/admin/switch_models', { headers: await getAuthHeader() }).then(handleResponse),
    createSwitchModel: async (modelData) => fetch('/api/v1/admin/switch_models', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(modelData),
    }).then(handleResponse),
    updateSwitchModel: async (modelId, modelData) => fetch(`/api/v1/admin/switch_models/${modelId}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(modelData),
    }).then(handleResponse),
    deleteSwitchModel: async (modelId) => fetch(`/api/v1/admin/switch_models/${modelId}`, {
        method: 'DELETE',
        headers: await getAuthHeader(),
    }),
    linkEquipmentToModel: async (equipmentId, modelId) => fetch(`/api/v1/admin/equipment/${equipmentId}/link_model`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify({ switch_model_id: modelId }),
    }).then(handleResponse),
    deleteAdminEquipment: async (equipmentId) => fetch(`/api/admin/equipment/${equipmentId}`, {
        method: 'DELETE',
        headers: await getAuthHeader()
    }),

    // --- User Switch Config ---
    getConfigurableSwitches: async (showId) => fetch(`/api/v1/switches?show_id=${showId}`, { headers: await getAuthHeader() }).then(handleResponse),
    createSwitchConfig: async (rackItemId) => fetch('/api/v1/switches', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({ rack_item_id: rackItemId }),
    }).then(handleResponse),
    getSwitchDetails: async (switchId) => fetch(`/api/v1/switches/${switchId}/details`, { headers: await getAuthHeader() }).then(handleResponse),
    getSwitchPortConfig: async (switchId) => fetch(`/api/v1/switches/${switchId}/config`, { headers: await getAuthHeader() }).then(handleResponse),
    saveSwitchPortConfig: async (switchId, portConfigData) => fetch(`/api/v1/switches/${switchId}/config`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(portConfigData),
    }).then(handleResponse),
    pushSwitchConfig: async (switchId, pushData) => fetch(`/api/v1/switches/${switchId}/push_config`, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(pushData),
    }).then(handleResponse),
    getPushJobStatus: async (jobId) => fetch(`/api/v1/switches/push_jobs/${jobId}`, { headers: await getAuthHeader() }).then(handleResponse),
    
    // --- Agent API Keys ---
    generateAgentApiKey: async (name) => fetch('/api/v1/agent/api-keys', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({ name }),
    }).then(handleResponse),
    
    getConnectionsForShow: async (showId) => fetch(`/api/shows/${showId}/connections`, { headers: await getAuthHeader() }).then(handleResponse),
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

    createEquipmentInstance: async (instanceData) => fetch('/api/equipment_instances', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(instanceData),
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
    copyRackFromLibrary: async (rackId, showId, newRackName) => fetch('/api/racks/load_from_library', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({ template_rack_id: rackId, show_id: showId, new_rack_name: newRackName }),
    }).then(handleResponse),
    getUnassignedEquipment: async (showId) => fetch(`/api/shows/${showId}/unassigned_equipment`, { headers: await getAuthHeader() }).then(handleResponse),
    generateRacksPdf: async (payload) => fetch('/api/pdf/racks', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(payload),
    }).then(handleResponse),
    exportRacksListPdf: async (showId) => 
        fetch(`/api/shows/${showId}/racks/export-list`, { headers: await getAuthHeader() }).then(handleResponse),

    exportWirePdf: async (graphData, showId, titleBlockData) => fetch(`/api/export/wire.pdf?show_id=${encodeURIComponent(showId)}`, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({graph: graphData, title_block: titleBlockData}),
    }).then(handleResponse),

    // --- Loom Builder Endpoints ---
    // Loom (Container) Endpoints
    getLoomsForShow: async (showId) => fetch(`/api/shows/${showId}/looms`, { headers: await getAuthHeader() }).then(handleResponse),
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
    copyLoom: async (loomId, newName) => fetch(`/api/looms/${loomId}/copy`, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({ new_name: newName }),
    }).then(handleResponse),

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
    bulkUpdateCables: async (updateData) => fetch('/api/cables/bulk-update', {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(updateData),
    }).then(handleResponse),

    // --- VLAN Endpoints ---
    getVlans: async (showId) => fetch(`/api/vlans/${showId}`, { headers: await getAuthHeader() }).then(handleResponse),
    createVlan: async (showId, vlanData) => fetch(`/api/vlans/${showId}`, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(vlanData),
    }).then(handleResponse),
    updateVlan: async (vlanId, vlanData) => fetch(`/api/vlans/${vlanId}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(vlanData),
    }).then(handleResponse),
    deleteVlan: async (vlanId) => fetch(`/api/vlans/${vlanId}`, {
        method: 'DELETE',
        headers: await getAuthHeader(),
    }),
    generateVlanScript: async (showId, payload) => fetch(`/api/vlans/${showId}/generate-script`, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(payload),
    }).then(handleResponse),

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

    startImpersonation: async (userId) => fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({ user_id: userId }),
    }).then(handleResponse),

    stopImpersonation: async () => fetch('/api/admin/impersonate/stop', {
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

    // --- Roster Endpoints ---
    getRoster: async () => fetch('/api/roster', { headers: await getAuthHeader() }).then(handleResponse),
    createRosterMember: async (rosterData) => fetch('/api/roster', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(rosterData),
    }).then(handleResponse),
    updateRosterMember: async (rosterId, rosterData) => fetch(`/api/roster/${rosterId}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(rosterData),
    }).then(handleResponse),
    deleteRosterMember: async (rosterId) => fetch(`/api/roster/${rosterId}`, {
        method: 'DELETE',
        headers: await getAuthHeader(),
    }),

    // --- Show Crew Endpoints ---
    getShowCrew: async (showId) => fetch(`/api/shows/${showId}/crew`, { headers: await getAuthHeader() }).then(handleResponse),
    updateShowSettings: async (showId, settings) => fetch(`/api/shows/${showId}/settings`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(settings),
    }).then(handleResponse),
    addCrewToShow: async (showId, rosterId) => fetch(`/api/shows/${showId}/crew?roster_id=${rosterId}`, {
        method: 'POST',
        headers: await getAuthHeader(),
    }).then(handleResponse),
    removeCrewFromShow: async (showId, rosterId) => fetch(`/api/shows/${showId}/crew/${rosterId}`, {
        method: 'DELETE',
        headers: await getAuthHeader(),
    }),
    createRosterMemberAndAddToShow: async (data) => fetch('/api/roster_and_show_crew', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify(data),
    }).then(handleResponse),
    updateShowCrewMember: async (showCrewId, data) => fetch(`/api/show_crew/${showCrewId}`, {
        method: 'PUT',
        headers: await getAuthHeader(),
        body: JSON.stringify(data),
    }).then(handleResponse),

    // --- User SMTP ---
    getUserSmtpSettings: async () => fetch('/api/user/smtp-settings', { headers: await getAuthHeader() }).then(handleResponse),
    createUserSmtpSettings: async (settings) => fetch('/api/user/smtp-settings', { method: 'POST', headers: await getAuthHeader(), body: JSON.stringify(settings) }).then(handleResponse),
    testUserSmtpSettings: async (settings) => fetch('/api/user/smtp-settings/test', { method: 'POST', headers: await getAuthHeader(), body: JSON.stringify(settings) }).then(handleResponse),
    
    // --- Timesheets ---
    getWeeklyTimesheet: async (showId, weekStartDate) => 
        fetch(`/api/shows/${showId}/timesheet?week_start_date=${weekStartDate}`, { headers: await getAuthHeader() }).then(handleResponse),
    
    updateWeeklyTimesheet: async (showId, timesheetData) =>
        fetch(`/api/shows/${showId}/timesheet`, { method: 'PUT', headers: await getAuthHeader(), body: JSON.stringify(timesheetData) }).then(handleResponse),
        
    getTimesheetPdf: async (showId, weekStartDate) =>
        fetch(`/api/shows/${showId}/timesheet/pdf?week_start_date=${weekStartDate}`, { headers: await getAuthHeader() }).then(handleResponse),

    emailTimesheet: async (showId, weekStartDate, emailPayload) =>
        fetch(`/api/shows/${showId}/timesheet/email?week_start_date=${weekStartDate}`, { method: 'POST', headers: await getAuthHeader(), body: JSON.stringify(emailPayload) }).then(handleResponse),
        
    // --- Old Hours (can be deprecated) ---
    getDailyHours: async (showId) => fetch(`/api/shows/${showId}/daily_hours`, { headers: await getAuthHeader() }).then(handleResponse),
    bulkUpdateDailyHours: async (entries) => fetch('/api/daily_hours/bulk-update', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({ entries }),
    }).then(handleResponse),
};
