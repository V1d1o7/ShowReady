"""
Interface every switch/router driver module implements.

A driver knows *what* to configure and *how to phrase it* (REST payloads and/or CLI
syntax) for one vendor/model family. It never talks to the device itself: transport
(REST fetch vs. Web Serial) is generic and lives entirely in the frontend executors.
A driver just returns an ordered plan for whichever transport(s) it declares support
for, which the matching executor replays against the device.
"""
from dataclasses import dataclass
from typing import Any, Callable, Dict, FrozenSet, List, Optional

from app.models import CliCommand, RestStep

RestPlanFn = Callable[[Dict[str, Any], Dict[str, Any], List[Dict[str, Any]], Dict[str, Any]], List[RestStep]]
CliCommandsFn = Callable[[Dict[str, Any], Dict[str, Any], List[Dict[str, Any]], Dict[str, Any]], List[CliCommand]]


@dataclass(frozen=True)
class SwitchDriver:
    key: str
    label: str
    manufacturer: str
    device_type: str  # 'switch' | 'router'
    supported_transports: FrozenSet[str]  # subset of {'rest', 'serial'}
    baud_rate: Optional[int] = None  # required when 'serial' in supported_transports

    generate_rest_plan: Optional[RestPlanFn] = None
    generate_cli_commands: Optional[CliCommandsFn] = None
