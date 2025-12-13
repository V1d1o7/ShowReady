from typing import List, Dict, Any

def generate_switch_config(switch_model: Dict[str, Any], equipment: Dict[str, Any], connections: List[Dict[str, Any]]) -> List[str]:
    """
    Acts as a dispatcher for generating switch configurations.
    It inspects the switch_model's driver type and calls the appropriate
    driver-specific generation function.

    Returns:
        A list of CLI command strings.
    """
    driver_type = switch_model.get("netmiko_driver_type", "")

    # This is a placeholder for a more complex system where you might have
    # different generators for different vendors (Cisco, Juniper, etc.)
    if "netgear" in driver_type:
        # The generate_netgear_cli function needs port_configs and vlans,
        # which we will derive from the connections.
        # This is a simplified derivation for demonstration.
        port_configs, vlans = _derive_configs_from_connections(equipment, connections)
        return generate_netgear_cli(port_configs, vlans, switch_model)
    else:
        # In a real-world scenario, you would raise a NotImplementedError
        # or handle other switch types.
        return [f"Error: Unknown or unsupported driver type '{driver_type}'"]

def _derive_configs_from_connections(equipment: Dict[str, Any], connections: List[Dict[str, Any]]) -> (List[Dict[str, Any]], List[Dict[str, Any]]):
    """
    A helper function to derive port configurations and VLAN lists from the raw
    connection data for a show. This is a simplified example.
    """
    # In a real implementation, you would have a much more sophisticated logic here
    # to determine VLANs, trunking vs. access ports, etc., based on connections.
    # For now, we return empty lists as the core logic is in the CLI generator.
    return [], []


def generate_netgear_cli(port_configs: List[Dict[str, Any]], vlans: List[Dict[str, Any]], switch_model: Dict[str, Any]) -> List[str]:
    """
    Generates a list of CLI commands for a Netgear switch based on the provided configuration.
    """
    commands = ["configure"]

    for vlan in vlans:
        commands.append(f"vlan {vlan['tag']}")
        commands.append(f"name \"{vlan['name']}\"")
        commands.append("exit")

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

        commands.append("switchport mode access")
        commands.append("switchport access vlan 1")

        if pvid and not tagged_vlans:
            commands.append(f"switchport access vlan {pvid}")
        elif pvid and tagged_vlans:
            commands.append("switchport mode trunk")
            all_vlans = sorted([pvid] + tagged_vlans)
            vlan_list_str = ",".join(map(str, all_vlans))
            commands.append(f"switchport trunk allowed vlan {vlan_list_str}")
            commands.append(f"switchport trunk native vlan {pvid}")
        
        commands.append("exit")

    commands.append("end")
    return commands
