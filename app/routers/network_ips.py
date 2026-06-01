from fastapi import APIRouter, Depends, HTTPException
from typing import List, Set
from uuid import UUID
import ipaddress
from supabase import Client

from app.schemas.network_ips import (
    NetworkIpEntryCreate, 
    NetworkIpEntryUpdate, 
    NetworkIpEntryResponse, 
    NetworkIpSyncEntity,
    NetworkIpStatus,
    NetworkEntityType
)
from ..api import get_supabase_client, get_user, feature_check, ensure_show_active

router = APIRouter(
    tags=["Network IPs"],
    dependencies=[Depends(feature_check("networking_ips"))]
)

async def recalculate_ip_conflicts(supabase: Client, show_id: int, ip_addresses: Set[str]):
    """
    Evaluates a set of IP addresses for a show and updates their status based on duplicates.
    Clears stale conflicts if an IP is no longer duplicated.
    """
    for ip in ip_addresses:
        if not ip:
            continue
        
        res = supabase.table("network_ip_entries").select("id, status, entity_type").eq("show_id", show_id).eq("ip_address", ip).execute()
        entries = res.data or []
        
        if len(entries) > 1:
            # Multiple devices share this IP -> Conflict
            conflict_ids = [e["id"] for e in entries if e["status"] != NetworkIpStatus.conflict.value]
            if conflict_ids:
                supabase.table("network_ip_entries").update({"status": NetworkIpStatus.conflict.value}).in_("id", conflict_ids).execute()
        elif len(entries) == 1:
            # Only one device has this IP -> Clear conflict if it exists
            entry = entries[0]
            if entry["status"] == NetworkIpStatus.conflict.value:
                # Revert to reserved if it's a reservation, else assigned
                new_status = NetworkIpStatus.reserved.value if entry["entity_type"] == NetworkEntityType.reservation.value else NetworkIpStatus.assigned.value
                supabase.table("network_ip_entries").update({"status": new_status}).eq("id", entry["id"]).execute()

@router.get("/shows/{show_id}/network/ips", response_model=List[NetworkIpEntryResponse])
async def get_network_ips(show_id: int, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    # Verify access matching VLAN router pattern
    show_res = supabase.table('shows').select('id').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")

    res = supabase.table("network_ip_entries").select("*").eq("show_id", show_id).order("ip_address").execute()
    return res.data

@router.post("/shows/{show_id}/network/ips", response_model=NetworkIpEntryResponse)
async def create_network_ip(show_id: int, entry: NetworkIpEntryCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    # Verify access
    show_res = supabase.table('shows').select('id').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")
        
    await ensure_show_active(show_id, supabase)

    # Using mode='json' to ensure UUIDs and Enums serialize cleanly for Supabase
    data = entry.model_dump(mode="json", exclude_unset=True)
    data["show_id"] = show_id
    
    # Validate ranges natively
    if data.get("ip_end") and data.get("ip_address"):
        try:
            ip_start = ipaddress.ip_address(data["ip_address"])
            ip_end = ipaddress.ip_address(data["ip_end"])
            if ip_end < ip_start:
                raise HTTPException(status_code=400, detail="ip_end cannot be lower than ip_address")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid IPv4 address format provided")
        
    res = supabase.table("network_ip_entries").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to create IP entry")
    
    new_entry = res.data[0]
    
    if new_entry.get("ip_address"):
        await recalculate_ip_conflicts(supabase, show_id, {new_entry["ip_address"]})
        updated_res = supabase.table("network_ip_entries").select("*").eq("id", new_entry["id"]).single().execute()
        return updated_res.data
            
    return new_entry

@router.put("/shows/{show_id}/network/ips/{ip_id}", response_model=NetworkIpEntryResponse)
async def update_network_ip(show_id: int, ip_id: UUID, entry: NetworkIpEntryUpdate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    # Verify access
    show_res = supabase.table('shows').select('id').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")

    await ensure_show_active(show_id, supabase)

    # Fetch old entry to track what IPs need conflict recalculation
    old_res = supabase.table("network_ip_entries").select("ip_address").eq("id", str(ip_id)).eq("show_id", show_id).single().execute()
    if not old_res.data:
        raise HTTPException(status_code=404, detail="IP entry not found")
    old_ip = old_res.data.get("ip_address")

    data = entry.model_dump(mode="json", exclude_unset=True)
    
    # Validate ranges natively
    if data.get("ip_end") and data.get("ip_address"):
        try:
            ip_start = ipaddress.ip_address(data["ip_address"])
            ip_end = ipaddress.ip_address(data["ip_end"])
            if ip_end < ip_start:
                raise HTTPException(status_code=400, detail="ip_end cannot be lower than ip_address")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid IPv4 address format provided")

    res = supabase.table("network_ip_entries").update(data).eq("id", str(ip_id)).eq("show_id", show_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="IP entry update failed")
        
    updated_entry = res.data[0]

    # Recalculate conflicts for both the old IP (if changed) and the new IP
    ips_to_check = set()
    if old_ip: ips_to_check.add(old_ip)
    if updated_entry.get("ip_address"): ips_to_check.add(updated_entry["ip_address"])
    
    if ips_to_check:
        await recalculate_ip_conflicts(supabase, show_id, ips_to_check)
        updated_res = supabase.table("network_ip_entries").select("*").eq("id", str(ip_id)).single().execute()
        return updated_res.data

    return updated_entry

@router.delete("/shows/{show_id}/network/ips/{ip_id}", status_code=204)
async def delete_network_ip(show_id: int, ip_id: UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    # Verify access
    show_res = supabase.table('shows').select('id').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")

    await ensure_show_active(show_id, supabase)

    # Fetch old entry to track what IP needs conflict recalculation
    old_res = supabase.table("network_ip_entries").select("ip_address").eq("id", str(ip_id)).eq("show_id", show_id).single().execute()
    if not old_res.data:
        raise HTTPException(status_code=404, detail="IP entry not found")

    old_ip = old_res.data.get("ip_address")

    res = supabase.table("network_ip_entries").delete().eq("id", str(ip_id)).eq("show_id", show_id).execute()
    
    # Recalculate conflicts for the deleted IP (so remaining single devices clear their conflict status)
    if old_ip:
        await recalculate_ip_conflicts(supabase, show_id, {old_ip})

    return

@router.post("/shows/{show_id}/network/ips/sync-entity", response_model=NetworkIpEntryResponse)
async def sync_entity_ip(show_id: int, sync_data: NetworkIpSyncEntity, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Upserts an IP entry linked to a specific entity (like Rack Equipment).
    Used directly by the Rack Builder/Wire Diagram to save IPs without duplicating records.
    """
    # Verify access
    show_res = supabase.table('shows').select('id').eq('id', show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")

    await ensure_show_active(show_id, supabase)

    existing = supabase.table("network_ip_entries")\
        .select("*")\
        .eq("show_id", show_id)\
        .eq("entity_type", sync_data.entity_type.value)\
        .eq("entity_id", str(sync_data.entity_id))\
        .execute()
        
    upsert_data = sync_data.model_dump(mode="json", exclude_unset=True)
    upsert_data["show_id"] = show_id
    
    # Strip Nones to avoid overwriting existing valid DB metadata with blanks
    upsert_data = {k: v for k, v in upsert_data.items() if v is not None}

    old_ip = None
    if existing.data:
        old_ip = existing.data[0].get("ip_address")
        res = supabase.table("network_ip_entries").update(upsert_data).eq("id", existing.data[0]["id"]).execute()
    else:
        res = supabase.table("network_ip_entries").insert(upsert_data).execute()
        
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to sync IP entry")
        
    result = res.data[0]
    
    ips_to_check = set()
    if old_ip: ips_to_check.add(old_ip)
    if result.get("ip_address"): ips_to_check.add(result["ip_address"])

    if ips_to_check:
        await recalculate_ip_conflicts(supabase, show_id, ips_to_check)
        final_res = supabase.table("network_ip_entries").select("*").eq("id", result["id"]).single().execute()
        return final_res.data
        
    return result
