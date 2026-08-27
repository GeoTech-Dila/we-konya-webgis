from app.agent.registry import ToolRegistry
from app.agent.tools.region import register_region_tools


def build_tool_registry() -> ToolRegistry:
    registry = ToolRegistry()
    register_region_tools(registry)
    return registry

