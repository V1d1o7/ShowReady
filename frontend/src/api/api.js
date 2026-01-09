import { createClient } from '@supabase/supabase-js';

// Access environment variables
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const api = {
    // --- Authentication ---
    signUp: async (data) => {
        const { email, password, options } = data;
        const { data: result, error } = await supabase.auth.signUp({
            email,
            password,
            options
        });
        if (error) throw error;
        return result;
    },

    signIn: async (data) => {
        const { email, password } = data;
        const { data: result, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
        return result;
    },

    signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    getUser: async () => {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return user;
    },

    getProfile: async (userId) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return data;
    },

    updateProfile: async (userId, updates) => {
        const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // --- User Settings ---
    getUserSettings: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // Fetch multiple settings in parallel if needed, for now just SMTP
        const { data: smtp, error: smtpError } = await supabase
            .from('user_smtp_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();
        
        // It's okay if SMTP settings don't exist yet
        if (smtpError && smtpError.code !== 'PGRST116') { 
            throw smtpError;
        }

        return {
            smtp: smtp || null
        };
    },

    saveSmtpSettings: async (settings) => {
        const { data: { user } } = await supabase.auth.getUser();
        
        // Check if exists
        const { data: existing } = await supabase
            .from('user_smtp_settings')
            .select('id')
            .eq('user_id', user.id)
            .single();

        let result;
        if (existing) {
            const { data, error } = await supabase
                .from('user_smtp_settings')
                .update(settings)
                .eq('user_id', user.id)
                .select()
                .single();
            if (error) throw error;
            result = data;
        } else {
            const { data, error } = await supabase
                .from('user_smtp_settings')
                .insert([{ ...settings, user_id: user.id }])
                .select()
                .single();
            if (error) throw error;
            result = data;
        }
        return result;
    },

    deleteSmtpSettings: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
            .from('user_smtp_settings')
            .delete()
            .eq('user_id', user.id);
        if (error) throw error;
    },

    // --- Library ---
    getLibrary: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data: folders, error: foldersError } = await supabase
            .from('folders')
            .select('*')
            .or(`is_default.eq.true,user_id.eq.${user.id}`);
        
        if (foldersError) throw foldersError;

        const { data: equipment, error: equipmentError } = await supabase
            .from('equipment_templates')
            .select('*')
            .or(`is_default.eq.true,user_id.eq.${user.id}`);

        if (equipmentError) throw equipmentError;

        return { folders, equipment };
    },

    createFolder: async (folderData) => {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('folders')
            .insert([{ ...folderData, user_id: user.id }])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    updateFolder: async (folderId, updates) => {
        const { data, error } = await supabase
            .from('folders')
            .update(updates)
            .eq('id', folderId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    deleteFolder: async (folderId) => {
        const { error } = await supabase
            .from('folders')
            .delete()
            .eq('id', folderId);
        if (error) throw error;
    },

    createUserEquipment: async (equipmentData) => {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('equipment_templates')
            .insert([{ ...equipmentData, user_id: user.id }])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    updateUserEquipment: async (equipmentId, updates) => {
        const { data, error } = await supabase
            .from('equipment_templates')
            .update(updates)
            .eq('id', equipmentId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    deleteUserEquipment: async (equipmentId) => {
        const { error } = await supabase
            .from('equipment_templates')
            .delete()
            .eq('id', equipmentId);
        if (error) throw error;
    },

    copyEquipmentToLibrary: async ({ template_id, folder_id }) => {
        const { data: { user } } = await supabase.auth.getUser();
        
        // 1. Fetch original
        const { data: original, error: fetchError } = await supabase
            .from('equipment_templates')
            .select('*')
            .eq('id', template_id)
            .single();
        
        if (fetchError) throw fetchError;

        // 2. Prepare copy (remove ID, system fields)
        const { id, created_at, is_default, user_id, ...rest } = original;
        const newTemplate = {
            ...rest,
            user_id: user.id,
            folder_id: folder_id || null,
            model_number: `${original.model_number} (Copy)`,
            is_default: false
        };

        // 3. Insert
        const { data, error } = await supabase
            .from('equipment_templates')
            .insert([newTemplate])
            .select()
            .single();
            
        if (error) throw error;
        return data;
    },

    // --- Shows ---
    getShows: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        // Fetch shows where user is owner OR a collaborator
        // We use the show_collaborators table for this logic
        // This query gets shows where I am a collaborator
        
        // Step 1: Get IDs of shows I collaborate on
        const { data: collaborations, error: collabError } = await supabase
            .from('show_collaborators')
            .select('show_id, role')
            .eq('user_id', user.id);
            
        if (collabError) throw collabError;
        
        const showIds = collaborations.map(c => c.show_id);
        
        if (showIds.length === 0) return [];

        // Step 2: Fetch the shows
        const { data: shows, error: showsError } = await supabase
            .from('shows')
            .select('*')
            .in('id', showIds)
            .order('created_at', { ascending: false });

        if (showsError) throw showsError;
        return shows;
    },

    createShow: async (showData) => {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('shows')
            .insert([{ ...showData, user_id: user.id }])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    updateShow: async (showId, updates) => {
        const { data, error } = await supabase
            .from('shows')
            .update(updates)
            .eq('id', showId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    deleteShow: async (showId) => {
        const { error } = await supabase
            .from('shows')
            .delete()
            .eq('id', showId);
        if (error) throw error;
    },

    getShowDetails: async (showId) => {
        const { data, error } = await supabase
            .from('shows')
            .select('*')
            .eq('id', showId)
            .single();
        if (error) throw error;
        return data;
    },

    // --- Racks ---
    getRacksForShow: async (showId) => {
        const { data, error } = await supabase
            .from('racks')
            .select('*')
            .eq('show_id', showId)
            .order('created_at', { ascending: true });
            
        if (error) throw error;
        return data;
    },

    getRackDetails: async (rackId) => {
        const { data: rack, error: rackError } = await supabase
            .from('racks')
            .select('*')
            .eq('id', rackId)
            .single();
        
        if (rackError) throw rackError;

        const { data: equipment, error: equipError } = await supabase
            .from('rack_equipment_instances')
            .select(`
                *,
                equipment_templates (*)
            `)
            .eq('rack_id', rackId);

        if (equipError) throw equipError;

        return { ...rack, equipment };
    },

    getDetailedRacksForShow: async (showId) => {
        // This fetches all racks and their equipment in one go
        // Supabase join syntax: equipment:rack_equipment_instances(...)
        const { data: racks, error: racksError } = await supabase
            .from('racks')
            .select(`
                *,
                equipment:rack_equipment_instances (
                    *,
                    equipment_templates (*)
                )
            `)
            .eq('show_id', showId)
            .order('created_at', { ascending: true });

        if (racksError) throw racksError;
        return racks;
    },

    createRack: async (rackData) => {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('racks')
            .insert([{ ...rackData, user_id: user.id }])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    updateRack: async (rackId, updates) => {
        const { data, error } = await supabase
            .from('racks')
            .update(updates)
            .eq('id', rackId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    deleteRack: async (rackId) => {
        const { error } = await supabase
            .from('racks')
            .delete()
            .eq('id', rackId);
        if (error) throw error;
    },

    copyRackFromLibrary: async (templateRackId, showId, newName) => {
        const { data: { user } } = await supabase.auth.getUser();

        // 1. Fetch the source rack
        const { data: sourceRack, error: fetchError } = await supabase
            .from('racks')
            .select('*')
            .eq('id', templateRackId)
            .single();
        
        if (fetchError) throw fetchError;

        // 2. Create new rack
        const { data: newRack, error: createError } = await supabase
            .from('racks')
            .insert([{
                rack_name: newName || `${sourceRack.rack_name} (Copy)`,
                ru_height: sourceRack.ru_height,
                show_id: showId,
                user_id: user.id,
                saved_to_library: false
            }])
            .select()
            .single();

        if (createError) throw createError;

        // 3. Fetch source equipment
        const { data: sourceEquip } = await supabase
            .from('rack_equipment_instances')
            .select('*')
            .eq('rack_id', templateRackId);

        if (sourceEquip && sourceEquip.length > 0) {
            // 4. Duplicate equipment
            const newEquip = sourceEquip.map(item => ({
                rack_id: newRack.id,
                template_id: item.template_id,
                ru_position: item.ru_position,
                rack_side: item.rack_side,
                instance_name: item.instance_name,
                ip_address: item.ip_address,
                module_assignments: item.module_assignments
            }));

            const { error: copyEquipError } = await supabase
                .from('rack_equipment_instances')
                .insert(newEquip);
            
            if (copyEquipError) throw copyEquipError;
        }

        // Return full details
        return await api.getRackDetails(newRack.id);
    },

    // --- Equipment Instances ---
    addEquipmentToRack: async (rackId, payload) => {
        // Supports parent_item_id and parent_slot_id for Panel Builder
        const { template_id, ru_position, rack_side, instance_name, parent_item_id, parent_slot_id } = payload;
        
        let finalInstanceName = instance_name;
        if (!finalInstanceName) {
             const { data: template } = await supabase
                .from('equipment_templates')
                .select('model_number')
                .eq('id', template_id)
                .single();
             finalInstanceName = template ? template.model_number : 'Equipment';
        }

        const { data, error } = await supabase
            .from('rack_equipment_instances')
            .insert([{
                rack_id: rackId,
                template_id,
                ru_position: ru_position || 0, // Default to 0 for children (panel components)
                rack_side: rack_side || 'front',
                instance_name: finalInstanceName,
                parent_item_id: parent_item_id || null, 
                parent_slot_id: parent_slot_id || null
            }])
            .select(`
                *,
                equipment_templates (*)
            `)
            .single();
            
        if (error) throw error;
        return data;
    },

    updateEquipmentInstance: async (instanceId, updates) => {
        const { data, error } = await supabase
            .from('rack_equipment_instances')
            .update(updates)
            .eq('id', instanceId)
            .select(`
                *,
                equipment_templates (*)
            `)
            .single();
        if (error) throw error;
        return data;
    },

    deleteEquipmentFromRack: async (instanceId) => {
        const { error } = await supabase
            .from('rack_equipment_instances')
            .delete()
            .eq('id', instanceId);
        if (error) throw error;
    },

    // --- Panel Builder Specific ---
    
    getEquipmentChildren: async (parentItemId) => {
        // Fetches all items that are plugged into a specific panel/frame
        const { data, error } = await supabase
            .from('rack_equipment_instances')
            .select(`
                *,
                equipment_templates (*)
            `)
            .eq('parent_item_id', parentItemId);
            
        if (error) throw error;
        return data;
    },

    // --- Roster ---
    getRoster: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('roster')
            .select('*')
            .eq('user_id', user.id)
            .order('first_name', { ascending: true });
        if (error) throw error;
        return data;
    },

    createRosterMember: async (memberData) => {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('roster')
            .insert([{ ...memberData, user_id: user.id }])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    updateRosterMember: async (memberId, updates) => {
        const { data, error } = await supabase
            .from('roster')
            .update(updates)
            .eq('id', memberId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    deleteRosterMember: async (memberId) => {
        const { error } = await supabase
            .from('roster')
            .delete()
            .eq('id', memberId);
        if (error) throw error;
    },

    // --- Show Crew ---
    getShowCrew: async (showId) => {
        const { data, error } = await supabase
            .from('show_crew')
            .select(`
                *,
                roster:roster_id (*)
            `)
            .eq('show_id', showId);
        if (error) throw error;
        return data;
    },

    addCrewToShow: async (crewData) => {
        const { data, error } = await supabase
            .from('show_crew')
            .insert([crewData])
            .select(`
                *,
                roster:roster_id (*)
            `)
            .single();
        if (error) throw error;
        return data;
    },

    updateShowCrewMember: async (crewId, updates) => {
        const { data, error } = await supabase
            .from('show_crew')
            .update(updates)
            .eq('id', crewId)
            .select(`
                *,
                roster:roster_id (*)
            `)
            .single();
        if (error) throw error;
        return data;
    },

    removeCrewFromShow: async (crewId) => {
        const { error } = await supabase
            .from('show_crew')
            .delete()
            .eq('id', crewId);
        if (error) throw error;
    },

    // --- Hours Tracking ---
    getTimesheetEntries: async (showId) => {
        // Fetch all crew for the show first
        const { data: crew, error: crewError } = await supabase
            .from('show_crew')
            .select('id')
            .eq('show_id', showId);
        
        if (crewError) throw crewError;
        
        const crewIds = crew.map(c => c.id);
        if (crewIds.length === 0) return [];

        const { data, error } = await supabase
            .from('timesheet_entries')
            .select('*')
            .in('show_crew_id', crewIds);
            
        if (error) throw error;
        return data;
    },

    saveTimesheetEntries: async (entries) => {
        const { data, error } = await supabase
            .from('timesheet_entries')
            .upsert(entries, { onConflict: 'show_crew_id,date' })
            .select();
        if (error) throw error;
        return data;
    },

    // --- VLANs ---
    getVlans: async (showId) => {
        const { data, error } = await supabase
            .from('vlans')
            .select('*')
            .eq('show_id', showId)
            .order('tag', { ascending: true });
        if (error) throw error;
        return data;
    },

    createVlan: async (vlanData) => {
        const { data, error } = await supabase
            .from('vlans')
            .insert([vlanData])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    updateVlan: async (vlanId, updates) => {
        const { data, error } = await supabase
            .from('vlans')
            .update(updates)
            .eq('id', vlanId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    deleteVlan: async (vlanId) => {
        const { error } = await supabase
            .from('vlans')
            .delete()
            .eq('id', vlanId);
        if (error) throw error;
    },

    // --- PDF Generation (Proxy to Backend) ---
    generateRacksPdf: async (payload) => {
        const response = await fetch('/api/pdf/racks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to generate PDF');
        }
        
        return await response.blob();
    },

    // --- Switch Configuration ---
    getSwitchModels: async () => {
        const { data, error } = await supabase
            .from('switch_models')
            .select('*')
            .order('manufacturer', { ascending: true });
        if (error) throw error;
        return data;
    },

    createSwitchModel: async (modelData) => {
        const { data, error } = await supabase
            .from('switch_models')
            .insert([modelData])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    updateSwitchModel: async (modelId, updates) => {
        const { data, error } = await supabase
            .from('switch_models')
            .update(updates)
            .eq('id', modelId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    deleteSwitchModel: async (modelId) => {
        const { error } = await supabase
            .from('switch_models')
            .delete()
            .eq('id', modelId);
        if (error) throw error;
    },

    // Fetch switches in a show that have a switch_model_id (are configurable)
    getConfigurableSwitches: async (showId) => {
        // Use RPC or complex query. For now, simple join logic or RPC
        const { data, error } = await supabase
            .rpc('get_configurable_switches_for_show', { p_show_id: showId });
        
        if (error) throw error;
        return data; // Returns grouped by rack
    },

    getSwitchConfig: async (rackItemId) => {
        const { data, error } = await supabase
            .from('switch_configs')
            .select('*')
            .eq('rack_item_id', rackItemId)
            .single();
        
        // Return null if not found (406/PGRST116)
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    saveSwitchConfig: async (rackItemId, showId, configData) => {
        const { data, error } = await supabase
            .from('switch_configs')
            .upsert({ 
                rack_item_id: rackItemId, 
                show_id: showId, 
                ...configData 
            }, { onConflict: 'rack_item_id' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // --- Notes ---
    getNotes: async (entityType, entityId) => {
        const { data, error } = await supabase
            .from('notes')
            .select(`
                *,
                user:user_id (first_name, last_name)
            `)
            .eq('parent_entity_type', entityType)
            .eq('parent_entity_id', entityId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    createNote: async (noteData) => {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('notes')
            .insert([{ ...noteData, user_id: user.id }])
            .select(`
                *,
                user:user_id (first_name, last_name)
            `)
            .single();
        if (error) throw error;
        return data;
    },

    resolveNote: async (noteId, isResolved) => {
        const { data, error } = await supabase
            .from('notes')
            .update({ is_resolved: isResolved })
            .eq('id', noteId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // --- Email Templates ---
    getEmailTemplates: async (category) => {
        const { data: { user } } = await supabase.auth.getUser();
        let query = supabase
            .from('email_templates')
            .select('*')
            .or(`is_default.eq.true,user_id.eq.${user.id}`);
        
        if (category) {
            query = query.eq('category', category);
        }
        
        const { data, error } = await query.order('name');
        if (error) throw error;
        return data;
    },

    createEmailTemplate: async (templateData) => {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('email_templates')
            .insert([{ ...templateData, user_id: user.id }])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    updateEmailTemplate: async (id, updates) => {
        const { data, error } = await supabase
            .from('email_templates')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    deleteEmailTemplate: async (id) => {
        const { error } = await supabase
            .from('email_templates')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // --- Collaboration ---
    getCollaborators: async (showId) => {
        // Fetch collaborators joined with profile data
        const { data, error } = await supabase
            .from('show_collaborators')
            .select(`
                *,
                user:user_id (email, first_name, last_name)
            `)
            .eq('show_id', showId);
        
        if (error) throw error;
        
        // Flatten structure for UI
        return data.map(c => ({
            id: c.id,
            user_id: c.user_id,
            role: c.role,
            email: c.user?.email,
            first_name: c.user?.first_name,
            last_name: c.user?.last_name
        }));
    },

    inviteCollaborator: async (showId, email, role) => {
        // This likely requires a backend function or a more complex flow 
        // to look up user by email -> if exists add to show_collaborators -> else send invite email
        // For now, assuming direct DB insert if user exists, or calling an edge function
        // We'll call the backend endpoint
        const response = await fetch(`/api/collaboration/shows/${showId}/invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, role })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to invite collaborator');
        }
        
        return await response.json();
    },

    removeCollaborator: async (showId, userId) => {
        const { error } = await supabase
            .from('show_collaborators')
            .delete()
            .eq('show_id', showId)
            .eq('user_id', userId);
        if (error) throw error;
    },

    updateCollaboratorRole: async (showId, userId, role) => {
        const { error } = await supabase
            .from('show_collaborators')
            .update({ role })
            .eq('show_id', showId)
            .eq('user_id', userId);
        if (error) throw error;
    }
};