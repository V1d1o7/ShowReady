from typing import List, Dict, Any

def generate_netgear_cli(port_configs: List[Dict[str, Any]], vlans: List[Dict[str, Any]], switch_model: Dict[str, Any]) -> List[str]:
    """
    Generates a list of CLI commands for a Netgear switch based on the provided configuration.

    Args:
        port_configs: A list of dictionaries, each representing a port's configuration.
        vlans: A list of all VLANs for the show.
        switch_model: A dictionary containing details about the switch model.

    Returns:
        A list of CLI command strings.
    """
    commands = ["configure"]

    # Generate VLAN creation commands
    # The generator should only configure VLANs that are explicitly defined in the show.
    # It does not discover or auto-create VLANs from port assignments.
    for vlan in vlans:
        commands.append(f"vlan {vlan['tag']}")
        commands.append(f"name \"{vlan['name']}\"")
        commands.append("exit")

    # Generate port configuration commands
    for port in sorted(port_configs, key=lambda x: x['port_number']):
        port_num = port['port_number']
        config = port.get('config')

        if not config:
            continue

        commands.append(f"interface 1/0/{port_num}")

        port_name = config.get('port_name')
        if port_name:
            commands.append(f"description \"{port_name}\"")

        pvid = config.get('pvid')
        tagged_vlans = config.get('tagged_vlans', [])

        # Reset interface to default before applying new config
        commands.append("switchport mode access")
        commands.append("switchport access vlan 1")


        if pvid and not tagged_vlans:
            # Access Mode
            commands.append(f"switchport access vlan {pvid}")
        elif pvid and tagged_vlans:
            # Trunk Mode
            commands.append("switchport mode trunk")
            all_vlans = sorted([pvid] + tagged_vlans)
            vlan_list_str = ",".join(map(str, all_vlans))
            commands.append(f"switchport trunk allowed vlan {vlan_list_str}")
            commands.append(f"switchport trunk native vlan {pvid}")
        
        commands.append("exit")

    commands.append("end")
    return commands
