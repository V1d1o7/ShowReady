from fastapi import APIRouter, HTTPException, Depends, Request, Response
from supabase import Client
from typing import List, Optional
import uuid
from ..api import get_supabase_client, get_user, get_service_client, get_branding_visibility
from ..models import (
    PanelFolder, PanelFolderCreate,
    PanelEquipmentTemplate, PanelEquipmentTemplateCreate, PanelEquipmentTemplateUpdate,
    PanelEquipmentInstance, PanelEquipmentInstanceCreate, PanelEquipmentInstanceUpdate
)
from ..pdf_utils import generate_panel_export_pdf
from ..utils.panel_utils import get_panel_children_recursive

router = APIRouter(prefix="/api/panels", tags=["Panel Builder"])

# --- Panel Folders ---

@router.get("/folders", response_model=List[PanelFolder])
async def list_panel_folders(user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    res = supabase.table('panel_folders').select('*').or_(f'user_id.eq.{user.id},is_default.eq.true').execute()
    return res.data

@router.post("/folders", response_model=PanelFolder)
async def create_panel_folder(folder_data: PanelFolderCreate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    insert_data = {
        "name": folder_data.name,
        "user_id": str(user.id),
        "parent_id": str(folder_data.parent_id) if folder_data.parent_id else None,
        "is_default": False
    }
    res = supabase.table('panel_folders').insert(insert_data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create folder")
    return res.data[0]

@router.delete("/folders/{folder_id}", status_code=204)
async def delete_panel_folder(folder_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    # Check if folder belongs to user
    folder_res = supabase.table('panel_folders').select('id').eq('id', str(folder_id)).eq('user_id', str(user.id)).single().execute()
    if not folder_res.data:
        raise HTTPException(status_code=404, detail="Folder not found or access denied")
    
    # Check for contents (templates)
    temp_res = supabase.table('panel_equipment_templates').select('id', count='exact').eq('folder_id', str(folder_id)).execute()
    if temp_res.count and temp_res.count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete folder that contains templates")
        
    supabase.table('panel_folders').delete().eq('id', str(folder_id)).execute()
    return

# --- Panel Equipment Templates ---

@router.get("/templates", response_model=List[PanelEquipmentTemplate])
async def list_panel_templates(user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    res = supabase.table('panel_equipment_templates').select('*').or_(f'user_id.eq.{user.id},is_default.eq.true').execute()
    return res.data

@router.post("/templates", response_model=PanelEquipmentTemplate)
async def create_panel_template(template_data: PanelEquipmentTemplateCreate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Creates a new panel equipment template, including port/circuit definitions."""
    insert_data = template_data.model_dump(mode='json')
    insert_data['user_id'] = str(user.id)
    insert_data['is_default'] = False
    
    res = supabase.table('panel_equipment_templates').insert(insert_data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create template")
    return res.data[0]

@router.put("/templates/{template_id}", response_model=PanelEquipmentTemplate)
async def update_panel_template(template_id: uuid.UUID, template_data: PanelEquipmentTemplateUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Updates a panel equipment template, allowing modification of ports/circuits."""
    update_data = template_data.model_dump(mode='json', exclude_unset=True)
    
    # Backend Validation: Prevent Orphaning Instances
    if 'panel_slots' in update_data:
        current_res = supabase.table('panel_equipment_templates').select('panel_slots').eq('id', str(template_id)).eq('user_id', str(user.id)).single().execute()
        if not current_res.data:
            raise HTTPException(status_code=404, detail="Template not found or access denied")
            
        current_slots = current_res.data.get('panel_slots') or []
        current_slot_ids = {str(slot.get('id')) for slot in current_slots if slot.get('id')}
        
        new_slots = update_data.get('panel_slots') or []
        new_slot_ids = {str(slot.get('id')) for slot in new_slots if slot.get('id')}
        
        deleted_slot_ids = current_slot_ids - new_slot_ids
        
        if deleted_slot_ids:
            # Check if any deleted slots have instances mounted in them
            in_use_res = supabase.table('panel_equipment_instances').select('id', count='exact').in_('slot_id', list(deleted_slot_ids)).execute()
            if in_use_res.count and in_use_res.count > 0:
                raise HTTPException(
                    status_code=400, 
                    detail="Cannot delete one or more slots because they are currently in use by mounted equipment. Please remove the equipment first or create a new template."
                )

    res = supabase.table('panel_equipment_templates').update(update_data).eq('id', str(template_id)).eq('user_id', str(user.id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Template not found or access denied")
    return res.data[0]

@router.delete("/templates/{template_id}", status_code=204)
async def delete_panel_template(template_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    res = supabase.table('panel_equipment_templates').delete().eq('id', str(template_id)).eq('user_id', str(user.id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Template not found or access denied")
    return

# --- Admin Endpoints for PE Library ---

@router.post("/admin/folders", response_model=PanelFolder, tags=["Admin"])
async def admin_create_panel_folder(folder_data: PanelFolderCreate, user = Depends(get_user)):
    admin_client = get_service_client()
    insert_data = {
        "name": folder_data.name,
        "user_id": None,
        "parent_id": str(folder_data.parent_id) if folder_data.parent_id else None,
        "is_default": True
    }
    res = admin_client.table('panel_folders').insert(insert_data).execute()
    return res.data[0]

@router.put("/admin/folders/{folder_id}", response_model=PanelFolder, tags=["Admin"])
async def admin_update_panel_folder(folder_id: uuid.UUID, folder_data: dict, user = Depends(get_user)):
    admin_client = get_service_client()
    update_data = {}
    if 'name' in folder_data:
        update_data['name'] = folder_data['name']
    if 'parent_id' in folder_data:
        update_data['parent_id'] = folder_data['parent_id']

    res = admin_client.table('panel_folders').update(update_data).eq('id', str(folder_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Folder not found")
    return res.data[0]

@router.delete("/admin/folders/{folder_id}", status_code=204, tags=["Admin"])
async def admin_delete_panel_folder(folder_id: uuid.UUID, user = Depends(get_user)):
    admin_client = get_service_client()
    temp_res = admin_client.table('panel_equipment_templates').select('id', count='exact').eq('folder_id', str(folder_id)).execute()
    if temp_res.count and temp_res.count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete folder that contains templates")
    admin_client.table('panel_folders').delete().eq('id', str(folder_id)).execute()
    return

@router.post("/admin/templates", response_model=PanelEquipmentTemplate, tags=["Admin"])
async def admin_create_panel_template(template_data: PanelEquipmentTemplateCreate, user = Depends(get_user)):
    admin_client = get_service_client()
    insert_data = template_data.model_dump(mode='json')
    insert_data['is_default'] = True
    insert_data['user_id'] = None
    
    res = admin_client.table('panel_equipment_templates').insert(insert_data).execute()
    return res.data[0]

@router.put("/admin/templates/{template_id}", response_model=PanelEquipmentTemplate, tags=["Admin"])
async def admin_update_panel_template(template_id: uuid.UUID, template_data: PanelEquipmentTemplateUpdate, user = Depends(get_user)):
    admin_client = get_service_client()
    update_data = template_data.model_dump(mode='json', exclude_unset=True)
    
    # Backend Validation: Prevent Orphaning Instances (Admin)
    if 'panel_slots' in update_data:
        current_res = admin_client.table('panel_equipment_templates').select('panel_slots').eq('id', str(template_id)).single().execute()
        if not current_res.data:
            raise HTTPException(status_code=404, detail="Template not found")
            
        current_slots = current_res.data.get('panel_slots') or []
        current_slot_ids = {str(slot.get('id')) for slot in current_slots if slot.get('id')}
        
        new_slots = update_data.get('panel_slots') or []
        new_slot_ids = {str(slot.get('id')) for slot in new_slots if slot.get('id')}
        
        deleted_slot_ids = current_slot_ids - new_slot_ids
        
        if deleted_slot_ids:
            in_use_res = admin_client.table('panel_equipment_instances').select('id', count='exact').in_('slot_id', list(deleted_slot_ids)).execute()
            if in_use_res.count and in_use_res.count > 0:
                raise HTTPException(
                    status_code=400, 
                    detail="Cannot delete one or more slots because they are currently in use by mounted equipment across active shows. Please remove the equipment first or create a new template."
                )

    res = admin_client.table('panel_equipment_templates').update(update_data).eq('id', str(template_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Template not found")
    return res.data[0]

@router.delete("/admin/templates/{template_id}", status_code=204, tags=["Admin"])
async def admin_delete_panel_template(template_id: uuid.UUID, user = Depends(get_user)):
    admin_client = get_service_client()
    admin_client.table('panel_equipment_templates').delete().eq('id', str(template_id)).execute()
    return

# --- Panel Equipment Instances ---

@router.get("/instances/{panel_instance_id}", response_model=List[PanelEquipmentInstance])
async def get_panel_instances(panel_instance_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves all instances mounted in a specific panel, organized hierarchically."""
    # 1. Get all instances for this panel
    res = supabase.table('panel_equipment_instances').select('*, template:panel_equipment_templates(*)').eq('panel_instance_id', str(panel_instance_id)).execute()
    all_instances = res.data or []
    
    if not all_instances:
        return []
    
    # 2. Build hierarchy
    instance_map = {item['id']: {**item, 'children': []} for item in all_instances}
    top_level = []
    
    for item in all_instances:
        parent_id = item.get('parent_instance_id')
        if parent_id and str(parent_id) in instance_map:
            instance_map[str(parent_id)]['children'].append(instance_map[item['id']])
        else:
            top_level.append(instance_map[item['id']])
            
    return top_level

@router.post("/instances", response_model=PanelEquipmentInstance)
async def create_panel_instance(instance_data: PanelEquipmentInstanceCreate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    insert_data = instance_data.model_dump(mode='json')
    res = supabase.table('panel_equipment_instances').insert(insert_data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create instance")
    
    # Re-fetch with template
    final_res = supabase.table('panel_equipment_instances').select('*, template:panel_equipment_templates(*)').eq('id', res.data[0]['id']).single().execute()
    return final_res.data

@router.put("/instances/{instance_id}", response_model=PanelEquipmentInstance)
async def update_panel_instance(instance_id: uuid.UUID, instance_data: PanelEquipmentInstanceUpdate, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    update_data = instance_data.model_dump(mode='json', exclude_unset=True)
    res = supabase.table('panel_equipment_instances').update(update_data).eq('id', str(instance_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Instance not found or access denied")
    
    final_res = supabase.table('panel_equipment_instances').select('*, template:panel_equipment_templates(*)').eq('id', str(instance_id)).single().execute()
    return final_res.data

@router.delete("/instances/{instance_id}", status_code=204)
async def delete_panel_instance(instance_id: uuid.UUID, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    # Deleting an instance will trigger CASCADE delete for children in the DB
    supabase.table('panel_equipment_instances').delete().eq('id', str(instance_id)).execute()
    return

@router.get("/shows/{show_id}/panel-instances", response_model=List[PanelEquipmentInstance])
async def get_all_panel_instances_for_show(show_id: int, user = Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """Retrieves ALL panel equipment instances for a given show, primarily for depth rendering and export."""
    # 1. Get all racks for the show
    racks_res = supabase.table('racks').select('id').eq('show_id', show_id).execute()
    rack_ids = [r['id'] for r in racks_res.data]
    
    if not rack_ids:
        return []

    # 2. Get all equipment in those racks
    equip_res = supabase.table('rack_equipment_instances').select('id').in_('rack_id', rack_ids).execute()
    panel_ids = [e['id'] for e in equip_res.data]

    if not panel_ids:
        return []

    # 3. Get all panel equipment instances
    res = supabase.table('panel_equipment_instances').select('*, template:panel_equipment_templates(*)').in_('panel_instance_id', panel_ids).execute()
    return res.data or []

@router.get("/shows/{show_id}/export", tags=["Panel Builder"])
async def export_panels_for_show(
    show_id: int, 
    user = Depends(get_user), 
    show_branding: bool = Depends(get_branding_visibility),
    supabase: Client = Depends(get_supabase_client)
):
    """Exports all panels in a show to a PDF build sheet."""
    # 1. Get Show Info
    show_res = supabase.table('shows').select('name').eq('id', show_id).single().execute()
    show_name = show_res.data['name']

    # 2. Get all racks for the show
    racks_res = supabase.table('racks').select('id').eq('show_id', show_id).execute()
    rack_ids = [r['id'] for r in racks_res.data]
    if not rack_ids:
        raise HTTPException(status_code=404, detail="No racks found for this show.")

    # 3. Get ALL equipment instances in those racks
    equip_res = supabase.table('rack_equipment_instances').select('*, equipment_templates(*)').in_('rack_id', rack_ids).execute()
    all_equip = equip_res.data or []
    
    # 4. FILTER specifically for patch panels in Python (Fixes the 39-page Outer Join Bug)
    panels = [e for e in all_equip if e.get('equipment_templates') and e['equipment_templates'].get('is_patch_panel') is True]
    
    if not panels:
        raise HTTPException(status_code=404, detail="No patch panels found in this show's racks.")

    # 5. For each panel, fetch its mounted components (recursive)
    export_payload = []
    
    for panel in panels:
        pe_res = supabase.table('panel_equipment_instances').select('*, template:panel_equipment_templates(*)').eq('panel_instance_id', panel['id']).execute()
        all_pe = pe_res.data or []
        
        mounted_top_level = [i for i in all_pe if not i.get('parent_instance_id')]
        for item in mounted_top_level:
            item['children'] = get_panel_children_recursive(item['id'], all_pe)
            
        export_payload.append({
            "panel": panel,
            "mounted_instances": mounted_top_level
        })

    # 6. Generate PDF
    pdf_buffer = generate_panel_export_pdf(show_name, export_payload, show_branding)
    
    filename = f"{show_name.replace(' ', '_')}_Panels.pdf"
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )