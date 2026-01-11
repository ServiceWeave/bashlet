"""MCP (Model Context Protocol) tool definitions.

Requires: pip install bashlet[mcp]
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable

from ..schemas.json_schema import (
    EXEC_JSON_SCHEMA,
    LIST_DIR_JSON_SCHEMA,
    READ_FILE_JSON_SCHEMA,
    WRITE_FILE_JSON_SCHEMA,
)
from .generic import (
    EXEC_DESCRIPTION,
    LIST_DIR_DESCRIPTION,
    READ_FILE_DESCRIPTION,
    WRITE_FILE_DESCRIPTION,
)

if TYPE_CHECKING:
    from mcp.types import Tool

    from ..async_client import AsyncBashlet
    from ..client import Bashlet


@dataclass
class MCPToolResult:
    """Result from MCP tool execution."""

    content: list[dict[str, Any]]
    """Content list with type and text."""

    is_error: bool = False
    """Whether this result represents an error."""


@dataclass
class MCPToolHandler:
    """Handler for MCP tools."""

    definitions: list[Tool]
    """Tool definitions for MCP."""

    _handlers: dict[str, Callable[..., Any]] = field(default_factory=dict, repr=False)
    """Internal handler mapping."""

    _async: bool = False
    """Whether handlers are async."""

    def handle(self, name: str, arguments: dict[str, Any]) -> MCPToolResult:
        """
        Handle a tool call synchronously.

        Args:
            name: Tool name
            arguments: Tool arguments

        Returns:
            MCPToolResult with content and error status

        Example:
            >>> result = handler.handle("bashlet_exec", {"command": "ls"})
            >>> print(result.content[0]["text"])
        """
        if self._async:
            raise RuntimeError("Use handle_async() for async handlers")

        if name not in self._handlers:
            return MCPToolResult(
                content=[{"type": "text", "text": f"Unknown tool: {name}"}],
                is_error=True,
            )

        try:
            result = self._handlers[name](**arguments)
            if isinstance(result, str):
                return MCPToolResult(content=[{"type": "text", "text": result}])
            return MCPToolResult(
                content=[{"type": "text", "text": json.dumps(result, indent=2)}]
            )
        except Exception as e:
            return MCPToolResult(
                content=[{"type": "text", "text": str(e)}],
                is_error=True,
            )

    async def handle_async(self, name: str, arguments: dict[str, Any]) -> MCPToolResult:
        """
        Handle a tool call asynchronously.

        Args:
            name: Tool name
            arguments: Tool arguments

        Returns:
            MCPToolResult with content and error status

        Example:
            >>> result = await handler.handle_async("bashlet_exec", {"command": "ls"})
            >>> print(result.content[0]["text"])
        """
        if not self._async:
            raise RuntimeError("Use handle() for sync handlers")

        if name not in self._handlers:
            return MCPToolResult(
                content=[{"type": "text", "text": f"Unknown tool: {name}"}],
                is_error=True,
            )

        try:
            result = await self._handlers[name](**arguments)
            if isinstance(result, str):
                return MCPToolResult(content=[{"type": "text", "text": result}])
            return MCPToolResult(
                content=[{"type": "text", "text": json.dumps(result, indent=2)}]
            )
        except Exception as e:
            return MCPToolResult(
                content=[{"type": "text", "text": str(e)}],
                is_error=True,
            )


def create_mcp_tools(client: Bashlet) -> MCPToolHandler:
    """
    Create MCP-compatible tools for sync client.

    Args:
        client: Sync Bashlet client instance

    Returns:
        MCPToolHandler with tool definitions and sync handler

    Example:
        >>> from mcp.server import Server
        >>> bashlet = Bashlet()
        >>> handler = create_mcp_tools(bashlet)
        >>>
        >>> @server.list_tools()
        >>> async def list_tools():
        ...     return handler.definitions
        >>>
        >>> @server.call_tool()
        >>> async def call_tool(name, arguments):
        ...     return handler.handle(name, arguments)
    """

    def exec_handler(command: str, workdir: str | None = None) -> dict[str, Any]:
        result = client.exec(command, workdir=workdir)
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
        }

    def read_file_handler(path: str) -> str:
        return client.read_file(path)

    def write_file_handler(path: str, content: str) -> str:
        client.write_file(path, content)
        return f"Successfully wrote to {path}"

    def list_dir_handler(path: str) -> str:
        return client.list_dir(path)

    definitions: list[Tool] = [
        {
            "name": "bashlet_exec",
            "description": EXEC_DESCRIPTION,
            "inputSchema": EXEC_JSON_SCHEMA,
        },
        {
            "name": "bashlet_read_file",
            "description": READ_FILE_DESCRIPTION,
            "inputSchema": READ_FILE_JSON_SCHEMA,
        },
        {
            "name": "bashlet_write_file",
            "description": WRITE_FILE_DESCRIPTION,
            "inputSchema": WRITE_FILE_JSON_SCHEMA,
        },
        {
            "name": "bashlet_list_dir",
            "description": LIST_DIR_DESCRIPTION,
            "inputSchema": LIST_DIR_JSON_SCHEMA,
        },
    ]

    return MCPToolHandler(
        definitions=definitions,
        _handlers={
            "bashlet_exec": exec_handler,
            "bashlet_read_file": read_file_handler,
            "bashlet_write_file": write_file_handler,
            "bashlet_list_dir": list_dir_handler,
        },
        _async=False,
    )


def create_async_mcp_tools(client: AsyncBashlet) -> MCPToolHandler:
    """
    Create MCP-compatible tools for async client.

    Args:
        client: Async Bashlet client instance

    Returns:
        MCPToolHandler with tool definitions and async handler

    Example:
        >>> from mcp.server import Server
        >>> bashlet = AsyncBashlet()
        >>> handler = create_async_mcp_tools(bashlet)
        >>>
        >>> @server.list_tools()
        >>> async def list_tools():
        ...     return handler.definitions
        >>>
        >>> @server.call_tool()
        >>> async def call_tool(name, arguments):
        ...     return await handler.handle_async(name, arguments)
    """

    async def exec_handler(command: str, workdir: str | None = None) -> dict[str, Any]:
        result = await client.exec(command, workdir=workdir)
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
        }

    async def read_file_handler(path: str) -> str:
        return await client.read_file(path)

    async def write_file_handler(path: str, content: str) -> str:
        await client.write_file(path, content)
        return f"Successfully wrote to {path}"

    async def list_dir_handler(path: str) -> str:
        return await client.list_dir(path)

    definitions: list[Tool] = [
        {
            "name": "bashlet_exec",
            "description": EXEC_DESCRIPTION,
            "inputSchema": EXEC_JSON_SCHEMA,
        },
        {
            "name": "bashlet_read_file",
            "description": READ_FILE_DESCRIPTION,
            "inputSchema": READ_FILE_JSON_SCHEMA,
        },
        {
            "name": "bashlet_write_file",
            "description": WRITE_FILE_DESCRIPTION,
            "inputSchema": WRITE_FILE_JSON_SCHEMA,
        },
        {
            "name": "bashlet_list_dir",
            "description": LIST_DIR_DESCRIPTION,
            "inputSchema": LIST_DIR_JSON_SCHEMA,
        },
    ]

    return MCPToolHandler(
        definitions=definitions,
        _handlers={
            "bashlet_exec": exec_handler,
            "bashlet_read_file": read_file_handler,
            "bashlet_write_file": write_file_handler,
            "bashlet_list_dir": list_dir_handler,
        },
        _async=True,
    )
