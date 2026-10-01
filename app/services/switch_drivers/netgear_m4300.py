"""
Netgear M4300 / M4250 driver.

CLI syntax is confirmed against a real `show running-config` from a live M4250-26G4XF-PoE+
(firmware 13.0.5.26) -- this is Netgear's "FASTPATH"-derived CLI, not Cisco IOS-style,
and several early guesses here were simply wrong until that sample arrived:
  - VLANs are created in a separate top-level `vlan database` mode, *not* nested under
    `configure` -- one bulk `vlan <tag-list>` command, then one `vlan name <tag> "<name>"`
    line per VLAN. There's no `(config-vlan)#` sub-mode.
  - IGMP snooping is `set igmp-plus <tag>`, inside `vlan database` mode -- confirms it's
    VLAN-scoped, as corrected elsewhere in this codebase.
  - Interfaces are named `0/<n>`, not `1/0/<n>`.
  - There's no `switchport` command family at all. Access ports: `vlan pvid <tag>` +
    `vlan participation auto 1` + `vlan participation include <tag>`. Trunk ports:
    `vlan participation include <full list>` + `vlan tagging <tagged list>`, no mode
    command and no "native vlan" concept -- the untagged VLAN is just whichever one is
    in `participation include` but not in `tagging`.
  - Switch name is `snmp-server sysname "<name>"`, not `hostname`.
  - Switch location (`snmp-server location "<location>"`) was already a correct guess.
  - Login timeout is real: `line console` / `serial timeout <minutes>` / `exit`. Only
    console timeout is confirmed -- telnet/ssh timeout syntax wasn't present in the
    sample (those line stanzas were empty), so it's not applied there.
  - Multicast-flooding and Green Ethernet/EEE CLI syntax were NOT present in the
    sample -- still genuinely unconfirmed, `implemented=False`.
  - All FASTPATH prompts end in `#` regardless of mode (`Switch#`, `Switch(Config)#`,
    `Switch(Vlan)#`, `Switch(Interface 0/1)#`, ...) -- rather than guess each mode's
    exact parenthetical text, `expect_regex` below just matches `#\\s*$` everywhere.

A second real sample (M4250-10G2XF-PoE++, same firmware line) confirmed RADIUS
authentication syntax: `ip http authentication radius local` / `ip https authentication
radius local` set the web-UI auth order; `radius server host auth "<ip>" name "<name>"`
adds a server; `radius server primary "<ip>"` marks it primary; `radius server
retransmit <n>` / `radius server timeout <n>` are global tuning (both samples used 3/3,
so that's hardcoded here rather than exposed as a setting nobody asked to tune). One gap:
the sample's `radius server key auth "<ip>" encrypted <hash>` line is a *read-back* of an
already-stored secret, not an input form -- we always have a fresh plaintext secret
instead (never persisted in plaintext, see switch_config.py's device_settings handling),
so the `key auth "<ip>" <secret>` form below (no `encrypted` keyword) is inferred from
the confirmed command family, not directly confirmed.

That second sample also confirmed LAG (port-channel) syntax: a member port gets
`interface 0/<n>` / `addport lag <id>` / `exit` (and, once a LAG member, no per-port VLAN
config of its own), then the LAG's VLAN membership is set separately via
`interface lag <id>` using the exact same `vlan pvid` / `vlan participation` /
`vlan tagging` command family as a regular port. Ordering in the sample: all `addport lag`
blocks appear early (right after the RADIUS/line config, before `snmp-server`/`ntp`),
regular per-port VLAN blocks follow, and the `interface lag <id>` VLAN block comes last,
right before `interface vlan 1` -- replicated in that order below.

Still out of scope: the L3/routing state both samples carry (`interface vlan 1` /
`routing` / `ip address` / `router rip` / `ip default-gateway`) -- this driver only
generates L2 VLAN/port/LAG config, not switch management-interface routing.

A general caveat from whoever supplied these samples, worth taking seriously: they're
`show running-config` exports from the switch's own UI, and there's no guarantee every
line an export prints is 1:1 paste-able back into a live CLI session (stored-secret
read-back forms like the RADIUS key line above are the clearest example). ShowReady
never pastes an export back verbatim -- it always synthesizes fresh commands from
ShowReady's own data using the same verified verbs/patterns -- but real bench validation
via the Web Serial console executor against actual hardware is still the only way to
fully confirm any of this executes cleanly end to end.

REST is a different story: the same sample config explicitly sets custom HTTP/HTTPS
API ports (`ip http port 49151`, `ip http secure-port 49152`), which confirms the
assumed default of :8443 in the REST plan below cannot be hardcoded -- another data
point for why REST stays hidden in the UI (PushConfigModal.js) until it's genuinely
verified, independent of this CLI correction. REST payload shapes are still best-effort
per community projects (https://github.com/ready-1/netgear_m4300_ansible,
https://github.com/njrc88-div/m4300-site-report), unconfirmed against Netgear's official
spec (requested from ProAVDesign@netgear.com, response pending).

Settings with no confirmed syntax at all are emitted with `implemented=False` so the
frontend can flag them rather than silently sending a guess. Callers only depend on the
RestStep/CliCommand list shape, not these internals.
"""
from typing import Any, Dict, List

from app.models import CliCommand, RestStep
from .base import SwitchDriver

BAUD_RATE = 9600
_PROMPT = r'#\s*$'


def _sorted_ports(port_configs: Dict[str, Any]):
    return sorted(
        ((port, cfg) for port, cfg in (port_configs or {}).items() if cfg),
        key=lambda kv: int(kv[0]),
    )


def _sorted_lags(lag_configs: Dict[str, Any]):
    return sorted(
        ((lag_id, cfg) for lag_id, cfg in (lag_configs or {}).items() if cfg and cfg.get('member_ports')),
        key=lambda kv: int(kv[0]),
    )


def _vlan_membership_commands(interface_label: str, pvid, tagged, description_label: str) -> List[CliCommand]:
    """
    The `vlan pvid` / `vlan participation` / `vlan tagging` family is confirmed
    identical whether the interface is a physical port (`0/N`) or a LAG (`lag N`) --
    shared here so the two call sites (regular ports, LAG interfaces) can't drift.
    """
    commands: List[CliCommand] = []
    tagged = tagged or []
    if tagged:
        all_vlans = sorted(set(([pvid] if pvid else [])) | set(tagged))
        vlan_list = ','.join(map(str, all_vlans))
        tagged_list = ','.join(map(str, sorted(tagged)))
        if pvid:
            commands.append(CliCommand(command=f'vlan pvid {pvid}', expect_regex=_PROMPT, description=f'Set {description_label} PVID to {pvid}'))
        commands.append(CliCommand(command=f'vlan participation include {vlan_list}', expect_regex=_PROMPT, description=f'Set {description_label} VLAN participation to {vlan_list}'))
        commands.append(CliCommand(command=f'vlan tagging {tagged_list}', expect_regex=_PROMPT, description=f'Tag {description_label} into VLAN(s) {tagged_list}'))
    elif pvid:
        commands.append(CliCommand(command=f'vlan pvid {pvid}', expect_regex=_PROMPT, description=f'Set {description_label} PVID to {pvid}'))
        commands.append(CliCommand(command='vlan participation auto 1', expect_regex=_PROMPT, description=f'Set {description_label} auto participation for VLAN 1'))
        commands.append(CliCommand(command=f'vlan participation include {pvid}', expect_regex=_PROMPT, description=f'Set {description_label} VLAN participation to {pvid}'))
    return commands


def generate_rest_plan(
    switch_model: Dict[str, Any],
    switch_config: Dict[str, Any],
    vlans: List[Dict[str, Any]],
    port_configs: Dict[str, Any],
) -> List[RestStep]:
    steps: List[RestStep] = []
    device_settings = switch_config.get('device_settings') or {}

    name = device_settings.get('name')
    if name:
        steps.append(RestStep(
            method='PUT', path='/api/v1/device_name',
            body={'device_name': {'name': name}},
            description=f'Set switch name to "{name}"',
        ))

    for vlan in vlans:
        steps.append(RestStep(
            method='POST', path='/api/v1/swcfg_vlan',
            body={'swcfg_vlan': {'vlan_id': vlan['tag'], 'vlan_name': vlan['name']}},
            description=f"Create VLAN {vlan['tag']} (\"{vlan['name']}\")",
        ))
        # IGMP snooping / multicast flooding are VLAN-scoped settings on real switches.
        # Endpoint paths/payloads aren't confirmed yet -- TODO until real firmware/docs
        # confirm them. Only emitted when the VLAN differs from the column default, so a
        # freshly-created VLAN with no opinion set doesn't generate noise steps.
        if vlan.get('igmp_snooping_enabled'):
            steps.append(RestStep(
                method='PUT', path='/api/v1/igmp_snooping', body=None,
                description=f"Enable IGMP snooping on VLAN {vlan['tag']} (endpoint unconfirmed)",
                implemented=False,
            ))
        if vlan.get('multicast_flooding_enabled') is False:
            steps.append(RestStep(
                method='PUT', path='/api/v1/multicast', body=None,
                description=f"Disable multicast flooding on VLAN {vlan['tag']} (endpoint unconfirmed)",
                implemented=False,
            ))

    for port_number, cfg in _sorted_ports(port_configs):
        pvid = cfg.get('pvid')
        tagged = cfg.get('tagged_vlans') or []

        if pvid:
            steps.append(RestStep(
                method='PUT', path='/api/v1/swcfg_vlan_membership',
                body={'swcfg_vlan_membership': {
                    'port_id': int(port_number), 'vlan_id': pvid, 'tagging': 'untagged',
                }},
                description=f'Set port {port_number} PVID to {pvid}',
            ))
        for tag in tagged:
            steps.append(RestStep(
                method='PUT', path='/api/v1/swcfg_vlan_membership',
                body={'swcfg_vlan_membership': {
                    'port_id': int(port_number), 'vlan_id': tag, 'tagging': 'tagged',
                }},
                description=f'Tag port {port_number} into VLAN {tag}',
            ))

        port_name = cfg.get('port_name')
        if port_name:
            steps.append(RestStep(
                method='PUT', path='/api/v1/swcfg_portdescription',
                body={'swcfg_portdescription': {'port_id': int(port_number), 'description': port_name}},
                description=f'Set port {port_number} description to "{port_name}"',
            ))

    for lag_id, lag_cfg in sorted(
        ((lid, c) for lid, c in (switch_config.get('lag_config') or {}).items() if c and c.get('member_ports')),
        key=lambda kv: int(kv[0]),
    ):
        steps.append(RestStep(
            method='POST', path='/api/v1/lag', body=None,
            description=f"Create LAG {lag_id} with member ports {lag_cfg['member_ports']} (endpoint unconfirmed)",
            implemented=False,
        ))

    # -- Not yet confirmed against real firmware / official spec --
    if device_settings.get('location'):
        steps.append(RestStep(
            method='PUT', path='/api/v1/device_info', body=None,
            description='Set switch location (endpoint unconfirmed)', implemented=False,
        ))
    if device_settings.get('login_timeout_minutes') is not None:
        steps.append(RestStep(
            method='PUT', path='/api/v1/session_timeout', body=None,
            description='Set login/session idle timeout (endpoint unconfirmed)', implemented=False,
        ))
    if device_settings.get('green_ethernet_enabled') is not None:
        steps.append(RestStep(
            method='PUT', path='/api/v1/green_ethernet', body=None,
            description='Toggle Green Ethernet / EEE (endpoint unconfirmed)', implemented=False,
        ))
    if device_settings.get('radius_server_host'):
        steps.append(RestStep(
            method='PUT', path='/api/v1/radius_server', body=None,
            description='Configure RADIUS authentication (endpoint unconfirmed)', implemented=False,
        ))

    return steps


def generate_cli_commands(
    switch_model: Dict[str, Any],
    switch_config: Dict[str, Any],
    vlans: List[Dict[str, Any]],
    port_configs: Dict[str, Any],
) -> List[CliCommand]:
    commands: List[CliCommand] = []
    device_settings = switch_config.get('device_settings') or {}
    sorted_vlans = sorted(vlans, key=lambda v: v['tag'])

    # -- VLAN database mode: a sibling of `configure`, not nested under it --
    if sorted_vlans:
        commands.append(CliCommand(command='vlan database', expect_regex=_PROMPT, description='Enter VLAN database mode'))

        tag_list = ','.join(str(v['tag']) for v in sorted_vlans)
        commands.append(CliCommand(command=f'vlan {tag_list}', expect_regex=_PROMPT, description=f'Create VLANs {tag_list}'))

        for vlan in sorted_vlans:
            commands.append(CliCommand(command=f"vlan name {vlan['tag']} \"{vlan['name']}\"", expect_regex=_PROMPT, description=f"Name VLAN {vlan['tag']}"))
            if vlan.get('igmp_snooping_enabled'):
                commands.append(CliCommand(command=f"set igmp-plus {vlan['tag']}", expect_regex=_PROMPT, description=f"Enable IGMP snooping on VLAN {vlan['tag']}"))
            if vlan.get('multicast_flooding_enabled') is False:
                commands.append(CliCommand(command='', expect_regex=_PROMPT, description=f"Disable multicast flooding on VLAN {vlan['tag']} (CLI syntax unconfirmed)", implemented=False))

        commands.append(CliCommand(command='exit', expect_regex=_PROMPT, description='Exit VLAN database mode'))

    # -- Global config mode: switch identity, login timeout, per-port VLAN membership --
    commands.append(CliCommand(command='configure', expect_regex=_PROMPT, description='Enter configuration mode'))

    name = device_settings.get('name')
    if name:
        commands.append(CliCommand(command=f'snmp-server sysname "{name}"', expect_regex=_PROMPT, description=f'Set switch name to "{name}"'))

    location = device_settings.get('location')
    if location:
        commands.append(CliCommand(command=f'snmp-server location "{location}"', expect_regex=_PROMPT, description=f'Set switch location to "{location}"'))

    radius_host = device_settings.get('radius_server_host')
    if radius_host:
        radius_name = device_settings.get('radius_server_name')
        radius_key = device_settings.get('radius_server_key')  # decrypted server-side just before this call

        commands.append(CliCommand(command='ip http authentication radius local', expect_regex=_PROMPT, description='Use RADIUS (falling back to local) for web UI authentication'))
        commands.append(CliCommand(command='ip https authentication radius local', expect_regex=_PROMPT, description='Use RADIUS (falling back to local) for secure web UI authentication'))
        commands.append(CliCommand(command='radius server retransmit 3', expect_regex=_PROMPT, description='Set RADIUS retransmit attempts'))
        commands.append(CliCommand(command='radius server timeout 3', expect_regex=_PROMPT, description='Set RADIUS timeout'))

        name_clause = f' name "{radius_name}"' if radius_name else ''
        commands.append(CliCommand(command=f'radius server host auth "{radius_host}"{name_clause}', expect_regex=_PROMPT, description=f'Add RADIUS server {radius_host}'))

        if radius_key:
            commands.append(CliCommand(
                command=f'radius server key auth "{radius_host}" {radius_key}', expect_regex=_PROMPT,
                description=f'Set RADIUS shared secret for {radius_host} (plaintext entry form inferred from the confirmed command family -- unverified)',
            ))
        else:
            commands.append(CliCommand(command='', expect_regex=_PROMPT, description=f'RADIUS shared secret for {radius_host} not set -- add it in the switch\'s device settings', implemented=False))

        commands.append(CliCommand(command=f'radius server primary "{radius_host}"', expect_regex=_PROMPT, description=f'Mark {radius_host} as the primary RADIUS server'))

    login_timeout = device_settings.get('login_timeout_minutes')
    if login_timeout is not None:
        commands.append(CliCommand(command='line console', expect_regex=_PROMPT, description='Enter console line configuration'))
        commands.append(CliCommand(command=f'serial timeout {login_timeout}', expect_regex=_PROMPT, description=f'Set console login timeout to {login_timeout} minutes'))
        commands.append(CliCommand(command='exit', expect_regex=_PROMPT, description='Exit console line configuration'))

    lag_configs = switch_config.get('lag_config') or {}
    sorted_lags = _sorted_lags(lag_configs)
    # Real ordering: addport-to-lag assignments happen early, before the regular
    # per-port VLAN blocks -- replicated here rather than interleaved with them.
    lag_member_ports = set()
    for lag_id, lag_cfg in sorted_lags:
        for member in sorted(lag_cfg['member_ports']):
            lag_member_ports.add(member)
            commands.append(CliCommand(command=f'interface 0/{member}', expect_regex=_PROMPT, description=f'Configure port {member}'))
            commands.append(CliCommand(command=f'addport lag {lag_id}', expect_regex=_PROMPT, description=f'Add port {member} to LAG {lag_id}'))
            commands.append(CliCommand(command='exit', expect_regex=_PROMPT, description=f'Exit port {member} configuration'))

    for port_number, cfg in _sorted_ports(port_configs):
        # A LAG member's VLAN config lives on the LAG interface, not the port itself --
        # confirmed by the sample, where member ports carry no VLAN commands at all.
        if int(port_number) in lag_member_ports:
            continue

        commands.append(CliCommand(command=f'interface 0/{port_number}', expect_regex=_PROMPT, description=f'Configure port {port_number}'))

        port_name = cfg.get('port_name')
        if port_name:
            commands.append(CliCommand(command=f'description "{port_name}"', expect_regex=_PROMPT, description=f'Set port {port_number} description (not in the sample config -- standard FASTPATH command, but unverified)'))

        commands.extend(_vlan_membership_commands(f'0/{port_number}', cfg.get('pvid'), cfg.get('tagged_vlans'), f'port {port_number}'))

        commands.append(CliCommand(command='exit', expect_regex=_PROMPT, description=f'Exit port {port_number} configuration'))

    # LAG VLAN membership comes after the regular ports, matching the sample's ordering.
    for lag_id, lag_cfg in sorted_lags:
        commands.append(CliCommand(command=f'interface lag {lag_id}', expect_regex=_PROMPT, description=f'Configure LAG {lag_id}'))

        lag_name = lag_cfg.get('port_name') or lag_cfg.get('lag_name')
        if lag_name:
            commands.append(CliCommand(command=f'description "{lag_name}"', expect_regex=_PROMPT, description=f'Set LAG {lag_id} description (unverified, same caveat as port descriptions)'))

        commands.extend(_vlan_membership_commands(f'lag {lag_id}', lag_cfg.get('pvid'), lag_cfg.get('tagged_vlans'), f'LAG {lag_id}'))

        commands.append(CliCommand(command='exit', expect_regex=_PROMPT, description=f'Exit LAG {lag_id} configuration'))

    commands.append(CliCommand(command='exit', expect_regex=_PROMPT, description='Exit configuration mode'))

    # -- Not present in the sample config -- still genuinely unconfirmed --
    if device_settings.get('green_ethernet_enabled') is not None:
        commands.append(CliCommand(command='', expect_regex=_PROMPT, description='Toggle Green Ethernet / EEE (CLI syntax unconfirmed)', implemented=False))

    commands.append(CliCommand(command='write memory', expect_regex=_PROMPT, description='Save configuration'))

    return commands


DRIVER = SwitchDriver(
    key='netgear_m4300',
    label='Netgear M4300 / M4250',
    manufacturer='Netgear',
    device_type='switch',
    supported_transports=frozenset({'rest', 'serial'}),
    baud_rate=BAUD_RATE,
    generate_rest_plan=generate_rest_plan,
    generate_cli_commands=generate_cli_commands,
)
