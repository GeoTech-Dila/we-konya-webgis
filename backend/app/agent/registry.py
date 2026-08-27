from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class RegisteredTool:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: Callable[..., Any]

    def function_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
            "strict": True,
        }


class ToolRegistry:
    """Keeps LLM schemas separate from the GIS implementation."""

    def __init__(self) -> None:
        self._tools: dict[str, RegisteredTool] = {}

    def register(self, tool: RegisteredTool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Tool already registered: {tool.name}")
        self._tools[tool.name] = tool

    def schemas(self) -> list[dict[str, Any]]:
        return [tool.function_schema() for tool in self._tools.values()]

    def execute(self, name: str, arguments: dict[str, Any], context: Any) -> Any:
        try:
            tool = self._tools[name]
        except KeyError as exc:
            raise ValueError(f"Unknown tool: {name}") from exc
        return tool.handler(context=context, **arguments)

    @property
    def names(self) -> list[str]:
        return list(self._tools)
