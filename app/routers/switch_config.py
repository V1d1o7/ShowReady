from fastapi import APIRouter, Depends, HTTPException, status, Query
from supabase import Client
from app.api import get_supabase_client, get_user, feature_check
from app.models import (
    SwitchConfig, SwitchConfigCreate,
    SwitchSidebarGroup, PortConfig, LagConfig,
    SwitchDetails, SwitchDeviceSettings, SwitchManagementIpUpdate,
    RestStep, CliPlan, SwitchDriverInfo,
)
from app.services.switch_drivers import DRIVERS, get_driver
from app.encryption import encrypt_password, decrypt_password
import uuid
from typing import List, Dict


router = APIRouter(tags=["Switch Configuration"], dependencies=[Depends(feature_check("switch_config"))])


def _sanitize_device_settings_for_response(row: dict) -> dict:
    """Never echo the encrypted RADIUS key back to the client, even as ciphertext --
    mirrors UserSMTPSettingsResponse omitting the SMTP password entirely."""
    if row and row.get('device_settings'):
        row = dict(row)
        device_settings = dict(row['device_settings'])
        device_settings.pop('radius_server_key_encrypted', None)
        row['device_settings'] = device_settings
    return row


@router.get("/switch_drivers", response_model=List[SwitchDriverInfo])
def list_switch_drivers():
    """
    Lists every registered switch/router driver and which transports (REST/serial) it
    supports -- drives the admin model-form dropdown and the per-switch transport choice.
    """
    return [
        SwitchDriverInfo(
            key=d.key,
            label=d.label,
            manufacturer=d.manufacturer,
            device_type=d.device_type,
            supported_transports=sorted(d.supported_transports),
        )
        for d in DRIVERS.values()
    ]


@router.get("/switches", response_model=List[SwitchSidebarGroup])
def get_switches_for_sidebar(show_id: int = Query(...), supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Gets all configurable switches for a given show, structured for the sidebar.
    """
    response = supabase.rpc('get_configurable_switches_for_show', {'p_show_id': show_id}).execute()

    # The underlying SQL function's json_agg(...) returns NULL, not [], when the show
    # has no switch-linked equipment yet.
    return response.data or []

@router.post("/switches", response_model=SwitchConfig, status_code=status.HTTP_201_CREATED)
def create_switch_config(
    payload: SwitchConfigCreate,
    supabase: Client = Depends(get_supabase_client),
    user=Depends(get_user)
):
    """
    Creates a new, empty switch configuration for a given rack equipment item.
    """
    rack_item_id_str = str(payload.rack_item_id)

    # 1. Fetch rack item to get show_id
    rack_item_res = supabase.table("rack_equipment_instances").select("racks(show_id)").eq("id", rack_item_id_str).single().execute()

    if not rack_item_res.data or not rack_item_res.data.get('racks'):
        raise HTTPException(status_code=404, detail="Rack equipment or associated rack not found.")

    show_id = rack_item_res.data['racks']['show_id']

    # 2. Seed device_settings from the caller's switch defaults, if they've set any.
    # There's no create-time form for a switch config (the sidebar creates it with one
    # click), so this has to happen server-side rather than as a form pre-fill.
    device_settings = {}
    defaults_res = supabase.table('user_switch_defaults').select('default_login_timeout_minutes').eq('user_id', str(user.id)).maybe_single().execute()
    if defaults_res and defaults_res.data and defaults_res.data.get('default_login_timeout_minutes') is not None:
        device_settings['login_timeout_minutes'] = defaults_res.data['default_login_timeout_minutes']

    # 3. Insert new switch_config
    new_uuid = uuid.uuid4()
    insert_payload = {
        "id": str(new_uuid),
        "rack_item_id": rack_item_id_str,
        "show_id": show_id,
        "port_config": {},
        "device_settings": device_settings,
    }

    # Supabase-py does not support .select() after .insert()
    supabase.table("switch_configs").insert(insert_payload).execute()

    # 4. Fetch the newly created record
    select_res = supabase.table("switch_configs").select("*").eq("id", str(new_uuid)).single().execute()

    if not select_res.data:
        raise HTTPException(status_code=500, detail="Failed to create or retrieve switch configuration.")

    return _sanitize_device_settings_for_response(select_res.data)

@router.get("/switches/{switch_id}/details", response_model=SwitchDetails)
def get_switch_details(switch_id: uuid.UUID, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Gets detailed information for a specific switch, including model details.
    """
    switch_id_str = str(switch_id)

    # RLS ensures the user can only query switches in their shows.
    response = supabase.table("switch_configs").select("*, rack_equipment_instances(*, equipment_templates(*, switch_models(*)))").eq("id", switch_id_str).single().execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Switch configuration not found.")

    # Flatten the complex nested response into the SwitchDetails model
    switch_config = response.data
    rack_item = switch_config.get('rack_equipment_instances', {})
    template = rack_item.get('equipment_templates', {})
    model = template.get('switch_models', {})

    return SwitchDetails(
        id=switch_config['id'],
        rack_item_id=switch_config['rack_item_id'],
        show_id=switch_config['show_id'],
        name=rack_item.get('instance_name', 'Unnamed Switch'),
        model_name=model.get('model_name', 'Unknown Model'),
        port_count=model.get('port_count', 0),
        copper_port_count=model.get('copper_port_count', 0),
        sfp_port_count=model.get('sfp_port_count', 0),
        driver_type=model.get('driver_type', ''),
        management_ip=switch_config.get('management_ip'),
        created_at=switch_config['created_at']
    )

@router.put("/switches/{switch_id}/config", response_model=SwitchConfig)
def save_switch_port_config(switch_id: uuid.UUID, port_configs: Dict[str, PortConfig], supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Saves the entire port configuration blob for a switch.
    """
    # Convert Pydantic models to dict for JSONB storage
    config_dict = {port: config.model_dump() for port, config in port_configs.items()}

    supabase.table("switch_configs").update({"port_config": config_dict}).eq("id", str(switch_id)).execute()

    # Fetch the updated record
    response = supabase.table("switch_configs").select("*").eq("id", str(switch_id)).single().execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Switch configuration not found or update failed.")

    return _sanitize_device_settings_for_response(response.data)


@router.put("/switches/{switch_id}/lag_config", response_model=SwitchConfig)
def save_switch_lag_config(switch_id: uuid.UUID, lag_configs: Dict[str, LagConfig], supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Saves the switch's Link Aggregation Group (LAG/port-channel) configuration -- which
    physical ports are bonded into each LAG, plus that LAG's own VLAN membership.
    """
    config_dict = {lag_id: config.model_dump() for lag_id, config in lag_configs.items()}

    supabase.table("switch_configs").update({"lag_config": config_dict}).eq("id", str(switch_id)).execute()

    response = supabase.table("switch_configs").select("*").eq("id", str(switch_id)).single().execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Switch configuration not found or update failed.")

    return _sanitize_device_settings_for_response(response.data)


@router.put("/switches/{switch_id}/device_settings", response_model=SwitchConfig)
def save_switch_device_settings(switch_id: uuid.UUID, settings: SwitchDeviceSettings, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Saves switch-wide settings (name, location, login timeout, RADIUS, Green Ethernet)
    as a JSON blob. Merged onto whatever's already stored rather than overwritten
    wholesale -- device_settings is a single jsonb column, not one column per field, so
    a plain overwrite would silently wipe anything this particular save didn't touch
    (most importantly an already-set RADIUS key, which this endpoint never receives
    back from the client once saved).
    """
    existing_res = supabase.table("switch_configs").select("device_settings").eq("id", str(switch_id)).single().execute()
    if not existing_res.data:
        raise HTTPException(status_code=404, detail="Switch configuration not found.")
    existing = existing_res.data.get("device_settings") or {}

    incoming = settings.model_dump(exclude_none=True)
    radius_key = incoming.pop('radius_server_key', None)
    # Defensively drop anything a client might echo back from a prior GET (extra='allow'
    # on SwitchDeviceSettings passes unknown fields through) -- the stored encrypted
    # value is only ever derived here from a freshly-submitted plaintext key, never
    # trusted from the request body directly.
    incoming.pop('radius_server_key_encrypted', None)

    merged = {**existing, **incoming}
    if radius_key:
        merged['radius_server_key_encrypted'] = encrypt_password(radius_key)

    supabase.table("switch_configs").update({"device_settings": merged}).eq("id", str(switch_id)).execute()

    response = supabase.table("switch_configs").select("*").eq("id", str(switch_id)).single().execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Switch configuration not found or update failed.")

    return _sanitize_device_settings_for_response(response.data)


@router.put("/switches/{switch_id}/management_ip", response_model=SwitchConfig)
def save_switch_management_ip(switch_id: uuid.UUID, payload: SwitchManagementIpUpdate, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Saves the switch's OOB/management IP so the UI can remember it between sessions.
    Not a secret -- credentials themselves are never sent to or stored by the backend.
    """
    supabase.table("switch_configs").update({"management_ip": payload.management_ip}).eq("id", str(switch_id)).execute()

    response = supabase.table("switch_configs").select("*").eq("id", str(switch_id)).single().execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Switch configuration not found or update failed.")

    return _sanitize_device_settings_for_response(response.data)


def _load_plan_inputs(switch_id: uuid.UUID, supabase: Client):
    """
    Shared fetch for the two plan-generation endpoints: the switch config (with its
    linked model/driver), plus the show's VLANs.
    """
    switch_id_str = str(switch_id)
    response = supabase.table("switch_configs").select(
        "*, rack_equipment_instances(*, equipment_templates(*, switch_models(*)))"
    ).eq("id", switch_id_str).single().execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Switch configuration not found.")

    switch_config = response.data
    # Decrypt the RADIUS key here, server-side, right before it's handed to a driver --
    # this is the one place the plaintext is reconstituted. It then flows out in the
    # generated plan (REST body / CLI command text) same as any other config value the
    # device needs, e.g. VLAN tags -- unlike switch login credentials, which are never
    # persisted or touched by the backend at all, a RADIUS secret is config *data* the
    # switch should end up holding, so it has to round-trip through here to be applied.
    device_settings = dict(switch_config.get('device_settings') or {})
    encrypted_radius_key = device_settings.pop('radius_server_key_encrypted', None)
    if encrypted_radius_key:
        try:
            device_settings['radius_server_key'] = decrypt_password(encrypted_radius_key)
        except ValueError:
            pass  # corrupted/foreign ciphertext -- the RADIUS key step just won't be generated
    switch_config = {**switch_config, 'device_settings': device_settings}

    rack_item = switch_config.get('rack_equipment_instances', {}) or {}
    template = rack_item.get('equipment_templates', {}) or {}
    model = template.get('switch_models', {}) or {}

    driver_type = model.get('driver_type')
    if not driver_type:
        raise HTTPException(status_code=400, detail="This switch's model has no driver configured.")

    try:
        driver = get_driver(driver_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"No driver registered for '{driver_type}'.")

    vlans_res = supabase.table("vlans").select("*").eq("show_id", switch_config['show_id']).execute()
    vlans = vlans_res.data or []
    port_configs = switch_config.get('port_config') or {}

    return driver, model, switch_config, vlans, port_configs


@router.get("/switches/{switch_id}/rest_plan", response_model=List[RestStep])
def get_switch_rest_plan(switch_id: uuid.UUID, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Generates the ordered REST step plan for this switch's driver. The browser executes
    these directly against the device over the local network -- ShowReady's backend
    never contacts the switch itself or sees its credentials.
    """
    driver, model, switch_config, vlans, port_configs = _load_plan_inputs(switch_id, supabase)

    if not driver.generate_rest_plan or 'rest' not in driver.supported_transports:
        raise HTTPException(status_code=400, detail=f"Driver '{driver.key}' does not support network (REST) configuration.")

    return driver.generate_rest_plan(model, switch_config, vlans, port_configs)


@router.get("/switches/{switch_id}/cli_commands", response_model=CliPlan)
def get_switch_cli_commands(switch_id: uuid.UUID, supabase: Client = Depends(get_supabase_client), user=Depends(get_user)):
    """
    Generates the ordered CLI command list (plus the driver's console baud rate) for
    this switch's driver, for the Web Serial console-cable executor.
    """
    driver, model, switch_config, vlans, port_configs = _load_plan_inputs(switch_id, supabase)

    if not driver.generate_cli_commands or 'serial' not in driver.supported_transports:
        raise HTTPException(status_code=400, detail=f"Driver '{driver.key}' does not support console (serial) configuration.")

    commands = driver.generate_cli_commands(model, switch_config, vlans, port_configs)
    return CliPlan(baud_rate=driver.baud_rate or 9600, commands=commands)
