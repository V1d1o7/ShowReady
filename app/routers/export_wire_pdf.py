import io
import base64
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import Response
from app.schemas.wire_export import PdfExportPayload, Edge, PortDef
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
        # --- Helper: Recursive ID Collection ---
        def collect_ids(assignments, id_set):
            if not assignments: return
            for val in assignments.values():
                if isinstance(val, dict):
                    if val.get('id'):
                        id_set.add(val['id'])
                    if val.get('assignments'):
                        collect_ids(val['assignments'], id_set)
                elif isinstance(val, str): # Raw UUID string
                    id_set.add(val)

        # --- Helper: Recursive Port Flattening ---
        def flatten_assignments(assignments, parent_template, node, templates_map):
            if not assignments or not parent_template:
                return

            # Create map of slot_id -> slot_name for the CURRENT parent
            slot_defs = parent_template.get('slot_definitions') or parent_template.get('slots') or []
            slot_names_by_id = {
                str(s.get('id', '')): s.get('name', 'Unknown Slot') 
                for s in slot_defs
            }

            for slot_id, assignment_data in assignments.items():
                # Normalize data (Handle raw UUID vs Dict)
                if isinstance(assignment_data, dict):
                    module_id = assignment_data.get('id')
                    sub_assignments = assignment_data.get('assignments')
                else:
                    module_id = assignment_data
                    sub_assignments = None
                
                if not module_id: 
                    continue

                module_template = templates_map.get(str(module_id))
                if not module_template: 
                    continue

                # Determine legible slot name
                # Fallback to name-based lookup if ID lookup failed (legacy data support)
                slot_name = slot_names_by_id.get(str(slot_id))
                if not slot_name:
                    # Try finding by matching slot name directly if slot_id matches a name
                    found = next((s['name'] for s in slot_defs if s.get('name') == slot_id), None)
                    slot_name = found if found else f"Slot {slot_id[:4]}"

                # Flatten Ports for THIS module
                if module_template.get('ports'):
                    for port in module_template['ports']:
                        # Generate a unique ID for this specific instance of the port
                        # We use a composite key of parent_slot + port_id to ensure uniqueness in recursion
                        new_port_id = f"mod_{slot_id}_{port['id']}"
                        
                        # Label: "Slot A: HDMI 1"
                        new_port_name = f"{slot_name}: {port.get('label', 'Port')}"
                        
                        # FIX: Create a proper PortDef object so attribute access (.name) works later
                        # Mapping DB 'label' to Pydantic 'name'
                        node.ports[new_port_id] = PortDef(name=new_port_name)

                # RECURSE: Process sub-modules using THIS module as the parent
                if sub_assignments:
                    flatten_assignments(sub_assignments, module_template, node, templates_map)


        # --- Step 1: Fetch Data ---

        # Get instance IDs
        instance_ids = [node.id for node in payload.graph.nodes]

        # Fetch RackEquipmentInstances
        instance_res = supabase.table('rack_equipment_instances').select('*').in_('id', instance_ids).execute()
        if not instance_res.data:
            raise HTTPException(status_code=404, detail="Equipment instances not found.")
        
        instances_by_id = {str(item['id']): item for item in instance_res.data}

        # Collect Template IDs (Recursively)
        template_ids_to_fetch = set()
        for instance in instance_res.data:
            template_ids_to_fetch.add(instance['template_id'])
            collect_ids(instance.get('module_assignments'), template_ids_to_fetch)

        # Fetch Templates
        if template_ids_to_fetch:
            template_res = supabase.table('equipment_templates').select('*').in_('id', list(template_ids_to_fetch)).execute()
            templates_by_id = {str(item['id']): item for item in template_res.data}
        else:
            templates_by_id = {}
        
        # --- Step 2: Flatten Module Ports ---

        for node in payload.graph.nodes:
            instance = instances_by_id.get(str(node.id))
            if not instance or not instance.get('module_assignments'):
                continue

            chassis_template = templates_by_id.get(str(instance['template_id']))
            if not chassis_template:
                continue

            # Start recursion from the Chassis
            flatten_assignments(
                instance['module_assignments'], 
                chassis_template, 
                node, 
                templates_by_id
            )

        # --- Step 3: Collapse Adapters ---
        
        adapter_node_ids = set()
        for node in payload.graph.nodes:
            instance = instances_by_id.get(str(node.id))
            if instance:
                template = templates_by_id.get(str(instance['template_id']))
                if template and template.get('is_adapter', False):
                    adapter_node_ids.add(node.id)

        if adapter_node_ids:
            nodes_by_id = {n.id: n for n in payload.graph.nodes}
            
            adapter_connections = {aid: {'source': None, 'target': None} for aid in adapter_node_ids}
            edges_to_remove = []
            new_edges = []

            for edge in payload.graph.edges:
                if edge.target in adapter_node_ids:
                    adapter_connections[edge.target]['source'] = (edge.source, edge.sourceHandle)
                    edges_to_remove.append(edge)
                elif edge.source in adapter_node_ids:
                    adapter_connections[edge.source]['target'] = (edge.target, edge.targetHandle)
                    edges_to_remove.append(edge)

            for adapter_id, conn in adapter_connections.items():
                adapter_node = nodes_by_id.get(adapter_id)
                if not adapter_node: continue

                source_info = conn['source']
                target_info = conn['target']

                if source_info:
                    src_node_id, src_handle = source_info
                    src_node = nodes_by_id.get(src_node_id)
                    if src_node and src_handle in src_node.ports:
                        # Set the adapter model on the port definition
                        # node.ports is now guaranteed to be a Dict of PortDef objects
                        src_node.ports[src_handle].adapter_model = adapter_node.modelNumber

                    if target_info:
                        tgt_node_id, tgt_handle = target_info
                        new_edge = Edge(
                            source=src_node_id,
                            sourceHandle=src_handle,
                            target=tgt_node_id,
                            targetHandle=tgt_handle
                        )
                        new_edges.append(new_edge)

            payload.graph.nodes = [n for n in payload.graph.nodes if n.id not in adapter_node_ids]
            
            edges_to_keep = [e for e in payload.graph.edges if e not in edges_to_remove]
            payload.graph.edges = edges_to_keep + new_edges

        # --- Step 4: Logos & Branding ---
        show_res = supabase.table('shows').select('data, name').eq('id', show_id).eq('user_id', str(user.id)).single().execute()
        if show_res.data:
            show_name = show_res.data.get('name', 'export')
            if 'data' in show_res.data and 'info' in show_res.data['data']:
                show_logo_path = show_res.data['data']['info'].get('logo_path')
            if show_logo_path:
                try:
                    show_logo_bytes = supabase.storage.from_('logos').download(show_logo_path)
                    payload.title_block.show_logo_base64 = base64.b64encode(show_logo_bytes).decode('utf-8')
                except Exception:
                    pass

        profile_res = supabase.table('profiles').select('company_logo_path').eq('id', str(user.id)).single().execute()
        if profile_res.data and profile_res.data.get('company_logo_path'):
            company_logo_path = profile_res.data['company_logo_path']
            try:
                company_logo_bytes = supabase.storage.from_('logos').download(company_logo_path)
                payload.title_block.company_logo_base64 = base64.b64encode(company_logo_bytes).decode('utf-8')
            except Exception:
                pass
        
        payload.title_block.show_branding = show_branding

        # --- Generate PDF ---
        pdf_bytes = build_pdf_bytes(payload.graph, payload.graph.page_size, payload.title_block)
        if not pdf_bytes:
            raise HTTPException(status_code=500, detail="Failed to generate PDF: result was empty.")

        filename = f"{show_name}-wire-export.pdf"
        return Response(content=pdf_bytes, media_type="application/pdf", headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\""
        })
    except Exception as e:
        # Log to server console for debugging, but don't crash
        print(f"Critical PDF Export Error: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during PDF generation: {e}")