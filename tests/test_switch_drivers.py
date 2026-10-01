from app.services.switch_drivers import get_driver
from app.services.switch_drivers.netgear_m4300 import generate_rest_plan, generate_cli_commands


SWITCH_MODEL = {"id": "model-1", "manufacturer": "Netgear", "model_name": "M4300-28G", "port_count": 28, "driver_type": "netgear_m4300"}

SWITCH_CONFIG = {
    "id": "switch-1",
    "show_id": 1,
    "device_settings": {"name": "FOH Switch"},
}

VLANS = [
    {"id": "vlan-1", "show_id": 1, "name": "Video", "tag": 100},
    {"id": "vlan-2", "show_id": 1, "name": "Control", "tag": 200},
]

PORT_CONFIGS = {
    "1": {"port_name": "Cam 1", "pvid": 100, "tagged_vlans": []},
    "2": {"port_name": "Uplink", "pvid": 100, "tagged_vlans": [200]},
}


def test_get_driver_returns_registered_netgear_driver():
    driver = get_driver("netgear_m4300")
    assert driver.key == "netgear_m4300"
    assert driver.supported_transports == frozenset({"rest", "serial"})
    assert driver.baud_rate == 9600


def test_generate_rest_plan_orders_name_vlans_then_ports():
    steps = generate_rest_plan(SWITCH_MODEL, SWITCH_CONFIG, VLANS, PORT_CONFIGS)

    assert steps[0].path == "/api/v1/device_name"
    assert steps[0].body == {"device_name": {"name": "FOH Switch"}}

    vlan_steps = [s for s in steps if s.path == "/api/v1/swcfg_vlan"]
    assert [s.body["swcfg_vlan"]["vlan_id"] for s in vlan_steps] == [100, 200]

    membership_steps = [s for s in steps if s.path == "/api/v1/swcfg_vlan_membership"]
    # port 1: untagged into 100. port 2: untagged into 100, tagged into 200.
    assert len(membership_steps) == 3
    port2_tagged = next(
        s for s in membership_steps
        if s.body["swcfg_vlan_membership"]["port_id"] == 2 and s.body["swcfg_vlan_membership"]["tagging"] == "tagged"
    )
    assert port2_tagged.body["swcfg_vlan_membership"]["vlan_id"] == 200

    description_steps = [s for s in steps if s.path == "/api/v1/swcfg_portdescription"]
    assert {s.body["swcfg_portdescription"]["description"] for s in description_steps} == {"Cam 1", "Uplink"}

    assert all(s.implemented for s in steps)


def test_generate_rest_plan_marks_unconfirmed_settings_as_not_implemented():
    switch_config = {
        "id": "switch-1", "show_id": 1,
        "device_settings": {"name": "FOH Switch", "login_timeout_minutes": 10, "green_ethernet_enabled": False},
    }
    steps = generate_rest_plan(SWITCH_MODEL, switch_config, [], {})

    todo_steps = [s for s in steps if not s.implemented]
    assert len(todo_steps) == 2
    assert {s.path for s in todo_steps} == {"/api/v1/session_timeout", "/api/v1/green_ethernet"}


def test_generate_rest_plan_emits_vlan_scoped_igmp_and_multicast_todos():
    vlans = [
        {"id": "vlan-1", "show_id": 1, "name": "Video", "tag": 100, "igmp_snooping_enabled": True, "multicast_flooding_enabled": True},
        {"id": "vlan-2", "show_id": 1, "name": "Control", "tag": 200, "igmp_snooping_enabled": False, "multicast_flooding_enabled": False},
    ]
    steps = generate_rest_plan(SWITCH_MODEL, {"id": "switch-1", "show_id": 1, "device_settings": {}}, vlans, {})

    igmp_steps = [s for s in steps if s.path == "/api/v1/igmp_snooping"]
    assert len(igmp_steps) == 1
    assert "VLAN 100" in igmp_steps[0].description
    assert not igmp_steps[0].implemented

    multicast_steps = [s for s in steps if s.path == "/api/v1/multicast"]
    assert len(multicast_steps) == 1
    assert "VLAN 200" in multicast_steps[0].description
    assert not multicast_steps[0].implemented


def test_generate_cli_commands_matches_real_fastpath_syntax():
    # Confirmed against a real M4250-26G4XF-PoE+ running-config: VLANs live in a
    # separate `vlan database` mode (not nested under `configure`), bulk-created in one
    # line, then named individually; interfaces are `0/N`; there's no `switchport`
    # command family at all.
    commands = generate_cli_commands(SWITCH_MODEL, SWITCH_CONFIG, VLANS, PORT_CONFIGS)
    cmds = [c.command for c in commands]

    assert commands[0].command == "vlan database"
    assert "vlan 100,200" in cmds
    assert 'vlan name 100 "Video"' in cmds
    assert 'vlan name 200 "Control"' in cmds

    # vlan database mode is exited before entering `configure` -- they're siblings.
    vlan_db_start = cmds.index("vlan database")
    vlan_db_end = cmds.index("exit", vlan_db_start)
    assert cmds[vlan_db_end + 1] == "configure"

    assert 'snmp-server sysname "FOH Switch"' in cmds

    assert "interface 0/1" in cmds
    assert "interface 0/2" in cmds
    assert not any("1/0/" in c for c in cmds)
    assert not any("switchport" in c for c in cmds)

    assert commands[-1].command == "write memory"
    assert cmds[-2] == "exit"  # exits `configure`

    assert all(c.implemented for c in commands)


def test_generate_cli_commands_access_vs_hybrid_port_vlan_syntax():
    # port 1 (access: pvid only) and port 2 (hybrid: pvid + a tagged VLAN) should
    # follow the two distinct real command patterns, not a single "trunk mode" branch.
    commands = generate_cli_commands(SWITCH_MODEL, SWITCH_CONFIG, VLANS, PORT_CONFIGS)
    cmds = [c.command for c in commands]

    port1_start = cmds.index("interface 0/1")
    port1_end = cmds.index("exit", port1_start)
    port1_cmds = cmds[port1_start:port1_end]
    assert "vlan pvid 100" in port1_cmds
    assert "vlan participation auto 1" in port1_cmds
    assert "vlan participation include 100" in port1_cmds

    port2_start = cmds.index("interface 0/2")
    port2_end = cmds.index("exit", port2_start)
    port2_cmds = cmds[port2_start:port2_end]
    assert "vlan pvid 100" in port2_cmds
    assert "vlan participation include 100,200" in port2_cmds
    assert "vlan tagging 200" in port2_cmds
    assert "vlan participation auto 1" not in port2_cmds  # access-only line, not for hybrid/trunk ports


def test_generate_cli_commands_emits_confirmed_igmp_plus_and_login_timeout():
    vlans = [{"id": "vlan-1", "show_id": 1, "name": "Video", "tag": 100, "igmp_snooping_enabled": True, "multicast_flooding_enabled": True}]
    switch_config = {"id": "switch-1", "show_id": 1, "device_settings": {"login_timeout_minutes": 160}}
    commands = generate_cli_commands(SWITCH_MODEL, switch_config, vlans, {})
    cmds = [c.command for c in commands]

    igmp_cmd = next(c for c in commands if c.command == "set igmp-plus 100")
    assert igmp_cmd.implemented

    assert "line console" in cmds
    assert "serial timeout 160" in cmds
    console_idx = cmds.index("line console")
    assert cmds[console_idx + 1] == "serial timeout 160"
    assert cmds[console_idx + 2] == "exit"


def test_generate_cli_commands_radius_with_key():
    switch_config = {
        "id": "switch-1", "show_id": 1,
        "device_settings": {
            "radius_server_host": "10.0.40.115",
            "radius_server_name": "KP-RADIUS",
            "radius_server_key": "supersecret",  # decrypted server-side before this call
        },
    }
    commands = generate_cli_commands(SWITCH_MODEL, switch_config, [], {})
    cmds = [c.command for c in commands]

    assert "ip http authentication radius local" in cmds
    assert "ip https authentication radius local" in cmds
    assert "radius server retransmit 3" in cmds
    assert "radius server timeout 3" in cmds
    assert 'radius server host auth "10.0.40.115" name "KP-RADIUS"' in cmds
    assert 'radius server key auth "10.0.40.115" supersecret' in cmds
    assert 'radius server primary "10.0.40.115"' in cmds

    key_cmd = next(c for c in commands if c.command.startswith('radius server key auth'))
    assert key_cmd.implemented
    # The plaintext secret must never leak into a *description* either, just the command.
    assert not any('supersecret' in c.description for c in commands)


def test_generate_cli_commands_radius_without_key_flags_todo():
    switch_config = {
        "id": "switch-1", "show_id": 1,
        "device_settings": {"radius_server_host": "10.0.40.115"},
    }
    commands = generate_cli_commands(SWITCH_MODEL, switch_config, [], {})

    todo = [c for c in commands if not c.implemented]
    assert len(todo) == 1
    assert "10.0.40.115" in todo[0].description

    assert not any(c.command.startswith('radius server key auth') for c in commands)


LAG_SWITCH_CONFIG = {
    "id": "switch-1", "show_id": 1,
    "device_settings": {},
    "lag_config": {
        "1": {"lag_name": "Uplink", "member_ports": [11, 12], "pvid": None, "tagged_vlans": [10, 20, 40, 60, 70]},
    },
}


def test_generate_cli_commands_lag_members_get_addport_not_their_own_vlan_config():
    # Ports 11/12 are LAG members and also happen to have a (now-ignored) port_config --
    # confirms the LAG wins and the port doesn't also get its own VLAN block.
    port_configs = {"11": {"port_name": "should be ignored", "pvid": 999, "tagged_vlans": []}, "5": {"port_name": "Cam 5", "pvid": 100, "tagged_vlans": []}}
    commands = generate_cli_commands(SWITCH_MODEL, LAG_SWITCH_CONFIG, [], port_configs)
    cmds = [c.command for c in commands]

    # addport blocks for both members, in port order.
    p11 = cmds.index("interface 0/11")
    assert cmds[p11 + 1] == "addport lag 1"
    assert cmds[p11 + 2] == "exit"
    p12 = cmds.index("interface 0/12")
    assert cmds[p12 + 1] == "addport lag 1"

    # Port 11 never gets its own VLAN commands (no "vlan pvid 999" anywhere).
    assert not any("999" in c for c in cmds)

    # Port 5 (not a LAG member) is configured normally.
    assert "interface 0/5" in cmds

    # addport blocks come before the regular port loop.
    assert p11 < cmds.index("interface 0/5")


def test_generate_cli_commands_lag_vlan_membership_after_regular_ports():
    commands = generate_cli_commands(SWITCH_MODEL, LAG_SWITCH_CONFIG, [], {"5": {"port_name": "Cam 5", "pvid": 100, "tagged_vlans": []}})
    cmds = [c.command for c in commands]

    assert "interface lag 1" in cmds
    lag_idx = cmds.index("interface lag 1")
    assert cmds.index("interface 0/5") < lag_idx  # regular ports configured before LAG VLAN membership

    lag_end = cmds.index("exit", lag_idx)
    lag_cmds = cmds[lag_idx:lag_end]
    assert "vlan participation include 10,20,40,60,70" in lag_cmds
    assert "vlan tagging 10,20,40,60,70" in lag_cmds
    assert 'description "Uplink"' in lag_cmds


def test_generate_rest_plan_flags_lag_as_unconfirmed():
    steps = generate_rest_plan(SWITCH_MODEL, LAG_SWITCH_CONFIG, [], {})
    lag_steps = [s for s in steps if s.path == "/api/v1/lag"]
    assert len(lag_steps) == 1
    assert not lag_steps[0].implemented
    assert "11" in lag_steps[0].description and "12" in lag_steps[0].description
