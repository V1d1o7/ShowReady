from typing import Dict

from .base import SwitchDriver
from .netgear_m4300 import DRIVER as NETGEAR_M4300

DRIVERS: Dict[str, SwitchDriver] = {
    NETGEAR_M4300.key: NETGEAR_M4300,
}


def get_driver(driver_type: str) -> SwitchDriver:
    driver = DRIVERS.get(driver_type)
    if not driver:
        raise ValueError(f"Unknown switch driver_type: {driver_type!r}")
    return driver
