from typing import List, Dict, Optional

def get_panel_children_recursive(parent_id, all_pe_instances):
    """
    Recursively builds a tree of mounted panel equipment instances.
    """
    children = [i for i in all_pe_instances if i.get('parent_instance_id') == parent_id]
    for child in children:
        child['children'] = get_panel_children_recursive(child['id'], all_pe_instances)
    return children
