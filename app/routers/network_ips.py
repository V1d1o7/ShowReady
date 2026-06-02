from fastapi import APIRouter, Depends, HTTPException, Response
from typing import List, Optional, Set
from uuid import UUID
import ipaddress
from supabase import Client

from app.schemas.network_ips import (
    NetworkIpEntryCreate,
    NetworkIpEntryUpdate,
    NetworkIpEntryResponse,
    NetworkIpSyncEntity,
    NetworkIpStatus,
    NetworkEntityType,
    NetworkAssignmentType,
    NetworkTrunkMode,
)
from ..api import get_supabase_client, get_user, feature_check, ensure_show_active

router = APIRouter(
    tags=["Network IPs"],
    dependencies=[Depends(feature_check("networking_ips"))],
)


REAL_IP_ASSIGNMENTS = {NetworkAssignmentType.single.value, NetworkAssignmentType.range.value}


def _has_meaningful_network_value(data: dict) -> bool:
    """
    Prevent ghost linked rows.

    Metadata alone should not create a network row. A row is meaningful when it
    has a real IP/range value, explicit MAC/hostname data, or a trunk assignment.
    """
    assignment_type = data.get("assignment_type")
    if assignment_type == NetworkAssignmentType.trunk.value:
        return any(data.get(field) is not None and data.get(field) != "" for field in ("trunk_mode", "trunk_label", "host_octet", "mac_address", "hostname"))

    return any(data.get(field) for field in ("ip_address", "ip_end", "mac_address", "hostname"))


def _default_status_for_entity(entity_type: Optional[str]) -> str:
    if entity_type == NetworkEntityType.reservation.value:
        return NetworkIpStatus.reserved.value
    return NetworkIpStatus.assigned.value


def _coerce_assignment_defaults(data: dict) -> dict:
    """Set assignment defaults and clear fields that do not belong to the selected shape."""
    clean = dict(data)
    assignment_type = clean.get("assignment_type")

    if not assignment_type:
        assignment_type = NetworkAssignmentType.range.value if clean.get("ip_end") else NetworkAssignmentType.single.value
        clean["assignment_type"] = assignment_type

    if assignment_type == NetworkAssignmentType.single.value:
        clean["ip_end"] = None
        clean["trunk_mode"] = None
        clean["trunk_vlan_ids"] = []
        clean["trunk_label"] = None
        clean["host_octet"] = None
    elif assignment_type == NetworkAssignmentType.range.value:
        clean["trunk_mode"] = None
        clean["trunk_vlan_ids"] = []
        clean["trunk_label"] = None
        clean["host_octet"] = None
    elif assignment_type == NetworkAssignmentType.trunk.value:
        clean["ip_address"] = None
        clean["ip_end"] = None
        clean["trunk_mode"] = clean.get("trunk_mode") or NetworkTrunkMode.all.value
        clean["trunk_vlan_ids"] = clean.get("trunk_vlan_ids") or []

    return clean


def _validate_assignment_shape(data: dict):
    assignment_type = data.get("assignment_type") or NetworkAssignmentType.single.value

    if data.get("entity_type") == NetworkEntityType.reservation.value and assignment_type == NetworkAssignmentType.trunk.value:
        raise HTTPException(status_code=400, detail="Reservation blocks cannot use trunk assignment type")

    if assignment_type == NetworkAssignmentType.single.value:
        if not data.get("ip_address"):
            raise HTTPException(status_code=400, detail="ip_address is required for single IP assignments")
        if data.get("ip_end"):
            raise HTTPException(status_code=400, detail="ip_end is only valid for range assignments")

    elif assignment_type == NetworkAssignmentType.range.value:
        if not data.get("ip_address") or not data.get("ip_end"):
            raise HTTPException(status_code=400, detail="ip_address and ip_end are required for range assignments")
        try:
            ip_start = ipaddress.ip_address(data["ip_address"])
            ip_end = ipaddress.ip_address(data["ip_end"])
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid IPv4 address format provided")
        if ip_end < ip_start:
            raise HTTPException(status_code=400, detail="ip_end cannot be lower than ip_address")

    elif assignment_type == NetworkAssignmentType.trunk.value:
        if data.get("ip_address") or data.get("ip_end"):
            raise HTTPException(status_code=400, detail="Trunk assignments cannot store ip_address or ip_end")
        if data.get("trunk_mode") not in {NetworkTrunkMode.all.value, NetworkTrunkMode.selected.value}:
            raise HTTPException(status_code=400, detail="trunk_mode must be 'all' or 'selected'")
        host_octet = data.get("host_octet")
        if host_octet is not None and not (1 <= int(host_octet) <= 254):
            raise HTTPException(status_code=400, detail="host_octet must be between 1 and 254")

    else:
        raise HTTPException(status_code=400, detail="Invalid assignment_type")


async def recalculate_ip_conflicts(supabase: Client, show_id: int, ip_addresses: Set[str]):
    """
    Evaluates real IP assignments for duplicates.

    Trunk/multi-VLAN entries intentionally do not participate because they do not
    represent a concrete IP address in ip_address.
    """
    for ip in ip_addresses:
        if not ip:
            continue

        res = (
            supabase.table("network_ip_entries")
            .select("id, status, entity_type, assignment_type")
            .eq("show_id", show_id)
            .eq("ip_address", ip)
            .in_("assignment_type", list(REAL_IP_ASSIGNMENTS))
            .execute()
        )
        entries = res.data or []

        if len(entries) > 1:
            conflict_ids = [e["id"] for e in entries if e["status"] != NetworkIpStatus.conflict.value]
            if conflict_ids:
                supabase.table("network_ip_entries").update({"status": NetworkIpStatus.conflict.value}).in_("id", conflict_ids).execute()
        elif len(entries) == 1:
            entry = entries[0]
            if entry["status"] == NetworkIpStatus.conflict.value:
                new_status = _default_status_for_entity(entry.get("entity_type"))
                supabase.table("network_ip_entries").update({"status": new_status}).eq("id", entry["id"]).execute()


async def _ensure_show_access(show_id: int, supabase: Client):
    show_res = supabase.table("shows").select("id").eq("id", show_id).single().execute()
    if not show_res.data:
        raise HTTPException(status_code=404, detail="Show not found or access denied.")


@router.get("/shows/{show_id}/network/ips", response_model=List[NetworkIpEntryResponse])
async def get_network_ips(show_id: int, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    await _ensure_show_access(show_id, supabase)

    res = (
        supabase.table("network_ip_entries")
        .select("*")
        .eq("show_id", show_id)
        .order("assignment_type")
        .order("ip_address")
        .execute()
    )
    return res.data or []


@router.post("/shows/{show_id}/network/ips", response_model=NetworkIpEntryResponse)
async def create_network_ip(show_id: int, entry: NetworkIpEntryCreate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    await _ensure_show_access(show_id, supabase)
    await ensure_show_active(show_id, supabase)

    data = entry.model_dump(mode="json", exclude_unset=True)
    data["show_id"] = show_id
    data = _coerce_assignment_defaults(data)

    if data.get("entity_type") and not data.get("status"):
        data["status"] = _default_status_for_entity(data.get("entity_type"))

    _validate_assignment_shape(data)

    res = supabase.table("network_ip_entries").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to create IP entry")

    new_entry = res.data[0]

    if new_entry.get("ip_address") and new_entry.get("assignment_type") in REAL_IP_ASSIGNMENTS:
        await recalculate_ip_conflicts(supabase, show_id, {new_entry["ip_address"]})
        updated_res = supabase.table("network_ip_entries").select("*").eq("id", new_entry["id"]).single().execute()
        return updated_res.data

    return new_entry


@router.put("/shows/{show_id}/network/ips/{ip_id}", response_model=NetworkIpEntryResponse)
async def update_network_ip(show_id: int, ip_id: UUID, entry: NetworkIpEntryUpdate, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    await _ensure_show_access(show_id, supabase)
    await ensure_show_active(show_id, supabase)

    old_res = supabase.table("network_ip_entries").select("*").eq("id", str(ip_id)).eq("show_id", show_id).single().execute()
    if not old_res.data:
        raise HTTPException(status_code=404, detail="IP entry not found")

    old_row = old_res.data
    old_ip = old_row.get("ip_address")

    incoming = entry.model_dump(mode="json", exclude_unset=True)
    merged = {**old_row, **incoming}
    merged = _coerce_assignment_defaults(merged)
    _validate_assignment_shape(merged)

    # Only update explicitly submitted fields, plus shape-cleanup fields when assignment changes.
    data = incoming
    if "assignment_type" in incoming:
        data = {k: merged.get(k) for k in (
            "assignment_type", "ip_address", "ip_end", "trunk_mode", "trunk_vlan_ids", "trunk_label", "host_octet"
        )}
        for passthrough in ("vlan_id", "entity_type", "entity_id", "mac_address", "hostname", "department", "location", "status", "notes"):
            if passthrough in incoming:
                data[passthrough] = incoming[passthrough]

    if data.get("entity_type") and not data.get("status"):
        data["status"] = _default_status_for_entity(data.get("entity_type"))

    res = supabase.table("network_ip_entries").update(data).eq("id", str(ip_id)).eq("show_id", show_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="IP entry update failed")

    updated_entry = res.data[0]

    ips_to_check = set()
    if old_ip:
        ips_to_check.add(old_ip)
    if updated_entry.get("ip_address") and updated_entry.get("assignment_type") in REAL_IP_ASSIGNMENTS:
        ips_to_check.add(updated_entry["ip_address"])

    if ips_to_check:
        await recalculate_ip_conflicts(supabase, show_id, ips_to_check)
        updated_res = supabase.table("network_ip_entries").select("*").eq("id", str(ip_id)).single().execute()
        return updated_res.data

    return updated_entry


@router.delete("/shows/{show_id}/network/ips/{ip_id}", status_code=204)
async def delete_network_ip(show_id: int, ip_id: UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    await _ensure_show_access(show_id, supabase)
    await ensure_show_active(show_id, supabase)

    old_res = supabase.table("network_ip_entries").select("ip_address, assignment_type").eq("id", str(ip_id)).eq("show_id", show_id).single().execute()
    if not old_res.data:
        raise HTTPException(status_code=404, detail="IP entry not found")

    old_ip = old_res.data.get("ip_address")
    old_assignment = old_res.data.get("assignment_type")

    supabase.table("network_ip_entries").delete().eq("id", str(ip_id)).eq("show_id", show_id).execute()

    if old_ip and old_assignment in REAL_IP_ASSIGNMENTS:
        await recalculate_ip_conflicts(supabase, show_id, {old_ip})

    return


@router.post(
    "/shows/{show_id}/network/ips/sync-entity",
    response_model=NetworkIpEntryResponse,
    responses={204: {"description": "No network entry needed, or existing linked entry was cleared."}},
)
async def sync_entity_ip(show_id: int, sync_data: NetworkIpSyncEntity, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Upserts a network assignment linked to a specific entity.

    Semantics:
    - Omitted fields are left alone.
    - Explicit nulls clear existing values.
    - No new row is created for linked equipment unless there is an actual network value.
    - Existing linked rows with no remaining network value are deleted to avoid ghost rows.
    """
    await _ensure_show_access(show_id, supabase)
    await ensure_show_active(show_id, supabase)

    existing = (
        supabase.table("network_ip_entries")
        .select("*")
        .eq("show_id", show_id)
        .eq("entity_type", sync_data.entity_type.value)
        .eq("entity_id", str(sync_data.entity_id))
        .execute()
    )

    incoming = sync_data.model_dump(mode="json", exclude_unset=True)
    incoming["show_id"] = show_id
    incoming["entity_type"] = sync_data.entity_type.value
    incoming["entity_id"] = str(sync_data.entity_id)

    if "assignment_type" not in incoming:
        incoming["assignment_type"] = NetworkAssignmentType.range.value if incoming.get("ip_end") else NetworkAssignmentType.single.value

    if "status" not in incoming:
        incoming["status"] = _default_status_for_entity(sync_data.entity_type.value)

    old_row = existing.data[0] if existing.data else None
    old_ip = old_row.get("ip_address") if old_row else None
    old_assignment = old_row.get("assignment_type") if old_row else None

    if old_row:
        merged = {**old_row, **incoming}
        merged = _coerce_assignment_defaults(merged)

        if not _has_meaningful_network_value(merged):
            supabase.table("network_ip_entries").delete().eq("id", old_row["id"]).execute()
            if old_ip and old_assignment in REAL_IP_ASSIGNMENTS:
                await recalculate_ip_conflicts(supabase, show_id, {old_ip})
            return Response(status_code=204)

        _validate_assignment_shape(merged)

        # When the assignment type is explicitly changing, include cleanup fields so stale IP/trunk data is removed.
        update_data = incoming
        if "assignment_type" in sync_data.model_fields_set:
            update_data = {k: merged.get(k) for k in (
                "assignment_type", "ip_address", "ip_end", "trunk_mode", "trunk_vlan_ids", "trunk_label", "host_octet",
                "mac_address", "hostname", "department", "location", "status"
            ) if k in merged}

        res = supabase.table("network_ip_entries").update(update_data).eq("id", old_row["id"]).execute()
    else:
        incoming = _coerce_assignment_defaults(incoming)
        if not _has_meaningful_network_value(incoming):
            return Response(status_code=204)
        _validate_assignment_shape(incoming)
        res = supabase.table("network_ip_entries").insert(incoming).execute()

    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to sync IP entry")

    result = res.data[0]

    ips_to_check = set()
    if old_ip and old_assignment in REAL_IP_ASSIGNMENTS:
        ips_to_check.add(old_ip)
    if result.get("ip_address") and result.get("assignment_type") in REAL_IP_ASSIGNMENTS:
        ips_to_check.add(result["ip_address"])

    if ips_to_check:
        await recalculate_ip_conflicts(supabase, show_id, ips_to_check)
        final_res = supabase.table("network_ip_entries").select("*").eq("id", result["id"]).single().execute()
        return final_res.data

    return result


@router.delete("/shows/{show_id}/network/ips/entity/{entity_type}/{entity_id}", status_code=204)
async def delete_entity_ip(show_id: int, entity_type: NetworkEntityType, entity_id: UUID, user=Depends(get_user), supabase: Client = Depends(get_supabase_client)):
    """
    Deletes the network IP entry linked to a specific entity.
    """
    await _ensure_show_access(show_id, supabase)
    await ensure_show_active(show_id, supabase)

    existing = (
        supabase.table("network_ip_entries")
        .select("id, ip_address, assignment_type")
        .eq("show_id", show_id)
        .eq("entity_type", entity_type.value)
        .eq("entity_id", str(entity_id))
        .maybe_single()
        .execute()
    )

    if existing and existing.data:
        old_ip = existing.data.get("ip_address")
        old_assignment = existing.data.get("assignment_type")
        supabase.table("network_ip_entries").delete().eq("id", existing.data["id"]).execute()
        if old_ip and old_assignment in REAL_IP_ASSIGNMENTS:
            await recalculate_ip_conflicts(supabase, show_id, {old_ip})

    return Response(status_code=204)
