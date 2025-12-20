import io
import base64
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import Response
from app.schemas.wire_export import PdfExportPayload
from app.services.wire_export_svg import build_pdf_bytes
from app.api import get_user, get_supabase_client, get_branding_visibility
from supabase import Client

router = APIRouter(
    prefix="/api",
    tags=["export"],
)

@router.post("/export/wire.pdf")
async def export_wire_pdf(
    payload: PdfExportPayload, 
    show_id: int = Query(...),
    user = Depends(get_user),
    supabase: Client = Depends(get_supabase_client),
    show_branding: bool = Depends(get_branding_visibility)
):
    """
    Exports the wire diagram as a vector PDF.
    """
    if not payload.graph.nodes:
        raise HTTPException(status_code=400, detail="Cannot export an empty graph.")

    try:
        # --- Start Modular Equipment Data Fetching ---

        # 1. Get all instance IDs from the incoming payload
        instance_ids = [node.id for node in payload.graph.nodes]

        # 2. Fetch all RackEquipmentInstance objects in one query
        instance_res = supabase.table('rack_equipment_instances').select('*').in_('id', instance_ids).execute()
        if not instance_res.data:
            raise HTTPException(status_code=404, detail="Equipment instances not found.")
        
        instances_by_id = {str(item['id']): item for item in instance_res.data}

        # 3. Collect all unique template IDs for both chassis and modules
        template_ids_to_fetch = set()
        for instance in instance_res.data:
            template_ids_to_fetch.add(instance['template_id'])
            if instance.get('module_assignments'):
                for module_template_id in instance['module_assignments'].values():
                    template_ids_to_fetch.add(module_template_id)

        # 4. Fetch all required EquipmentTemplates in a single batch
        if template_ids_to_fetch:
            template_res = supabase.table('equipment_templates').select('*').in_('id', list(template_ids_to_fetch)).execute()
            templates_by_id = {str(item['id']): item for item in template_res.data}
        else:
            templates_by_id = {}
        
        # --- Start Port Flattening Logic ---

        for node in payload.graph.nodes:
            instance = instances_by_id.get(str(node.id))
            if not instance or not instance.get('module_assignments'):
                continue # Skip if not a chassis or no module assignments

            chassis_template = templates_by_id.get(str(instance['template_id']))
            if not chassis_template or not chassis_template.get('slot_definitions'):
                continue # Skip if chassis template is invalid

            # Create a map of slot_id -> slot_name for easy lookup
            slot_names_by_id = {
                str(slot['id']): slot['name'] 
                for slot in chassis_template['slot_definitions']
            }

            for slot_id, module_template_id in instance['module_assignments'].items():
                module_template = templates_by_id.get(str(module_template_id))
                if not module_template or not module_template.get('ports'):
                    continue # Skip if module template is invalid

                slot_name = slot_names_by_id.get(str(slot_id), f"Slot {slot_id[:4]}")

                for port in module_template['ports']:
                    # Clone the original port object to preserve all its properties
                    cloned_port = port.copy()
                    
                    # Use a unique port ID and a descriptive name
                    new_port_id = f"mod_{slot_id}_{port['id']}"
                    new_port_name = f"{slot_name}: {port.get('label', 'Port')}"
                    
                    # CRITICAL: Update the internal ID as well to ensure uniqueness
                    cloned_port['id'] = new_port_id

                    # Update the label on the cloned port
                    cloned_port['label'] = new_port_name
                    
                    # Add the "virtual" port to the node's port dictionary
                    node.ports[new_port_id] = cloned_port

        # --- End Port Flattening Logic ---


        # Fetch logos
        show_res = supabase.table('shows').select('data, name').eq('id', show_id).eq('user_id', str(user.id)).single().execute()
        if show_res.data:
            show_name = show_res.data.get('name', 'export')
            if 'data' in show_res.data and 'info' in show_res.data['data']:
                show_logo_path = show_res.data['data']['info'].get('logo_path')
            if show_logo_path:
                try:
                    show_logo_bytes = supabase.storage.from_('logos').download(show_logo_path)
                    payload.title_block.show_logo_base64 = base64.b64encode(show_logo_bytes).decode('utf-8')
                except Exception as e:
                    print(f"Could not download show logo: {e}")

        profile_res = supabase.table('profiles').select('company_logo_path').eq('id', str(user.id)).single().execute()
        if profile_res.data and profile_res.data.get('company_logo_path'):
            company_logo_path = profile_res.data['company_logo_path']
            try:
                company_logo_bytes = supabase.storage.from_('logos').download(company_logo_path)
                payload.title_block.company_logo_base64 = base64.b64encode(company_logo_bytes).decode('utf-8')
            except Exception as e:
                print(f"Could not download company logo: {e}")
        
        payload.title_block.show_branding = show_branding

        pdf_bytes = build_pdf_bytes(payload.graph, payload.graph.page_size, payload.title_block)
        if not pdf_bytes:
            raise HTTPException(status_code=500, detail="Failed to generate PDF: result was empty.")

        filename = f"{show_name}-wire-export.pdf"
        return Response(content=pdf_bytes, media_type="application/pdf", headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\""
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during PDF generation: {e}")
