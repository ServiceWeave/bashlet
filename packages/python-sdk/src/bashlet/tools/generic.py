"""Framework-agnostic tool definitions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Callable, Coroutine

from ..schemas.json_schema import (
    EXEC_JSON_SCHEMA,
    LIST_DIR_JSON_SCHEMA,
    READ_FILE_JSON_SCHEMA,
    WRITE_FILE_JSON_SCHEMA,
    JsonSchema,
)

if TYPE_CHECKING:
    from ..async_client import AsyncBashlet
    from ..client import Bashlet


@dataclass
class GenericTool:
    """Framework-agnostic tool definition."""

    name: str
    """Tool name."""

    description: str
    """Human-readable description."""

    parameters: JsonSchema
    """JSON Schema for input parameters."""

    execute: Callable[..., Any]
    """Execute function (sync or async depending on client)."""


# Tool descriptions
EXEC_DESCRIPTION = (
    "Execute a shell command in a sandboxed bash environment. "
    "Returns stdout, stderr, and exit code. "
    "Use this for running shell commands, scripts, and system operations safely."
)

READ_FILE_DESCRIPTION = (
    "Read the contents of a file from the sandboxed environment. "
    "Returns the file content as a string."
)

WRITE_FILE_DESCRIPTION = (
    "Write content to a file in the sandboxed environment. "
    "Creates the file if it doesn't exist, overwrites if it does."
)

LIST_DIR_DESCRIPTION = (
    "List the contents of a directory in the sandboxed environment. "
    "Returns a detailed listing with file permissions, sizes, and names."
)


def create_generic_tools(client: Bashlet) -> list[GenericTool]:
    """
    Create framework-agnostic tool definitions for sync client.

    Args:
        client: Sync Bashlet client instance

    Returns:
        List of GenericTool objects

    Example:
        >>> bashlet = Bashlet()
        >>> tools = create_generic_tools(bashlet)
        >>> for tool in tools:
        ...     print(tool.name, tool.description)
    """

    def exec_tool(command: str, workdir: str | None = None) -> dict[str, Any]:
        result = client.exec(command, workdir=workdir)
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
        }

    def read_file_tool(path: str) -> str:
        return client.read_file(path)

    def write_file_tool(path: str, content: str) -> dict[str, Any]:
        client.write_file(path, content)
        return {"success": True, "path": path}

    def list_dir_tool(path: str) -> str:
        return client.list_dir(path)

    return [
        GenericTool(
            name="bashlet_exec",
            description=EXEC_DESCRIPTION,
            parameters=EXEC_JSON_SCHEMA,
            execute=exec_tool,
        ),
        GenericTool(
            name="bashlet_read_file",
            description=READ_FILE_DESCRIPTION,
            parameters=READ_FILE_JSON_SCHEMA,
            execute=read_file_tool,
        ),
        GenericTool(
            name="bashlet_write_file",
            description=WRITE_FILE_DESCRIPTION,
            parameters=WRITE_FILE_JSON_SCHEMA,
            execute=write_file_tool,
        ),
        GenericTool(
            name="bashlet_list_dir",
            description=LIST_DIR_DESCRIPTION,
            parameters=LIST_DIR_JSON_SCHEMA,
            execute=list_dir_tool,
        ),
    ]


def create_async_generic_tools(client: AsyncBashlet) -> list[GenericTool]:
    """
    Create framework-agnostic tool definitions for async client.

    Args:
        client: Async Bashlet client instance

    Returns:
        List of GenericTool objects with async execute methods

    Example:
        >>> bashlet = AsyncBashlet()
        >>> tools = create_async_generic_tools(bashlet)
        >>> result = await tools[0].execute(command="ls")
    """

    async def exec_tool(command: str, workdir: str | None = None) -> dict[str, Any]:
        result = await client.exec(command, workdir=workdir)
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
        }

    async def read_file_tool(path: str) -> str:
        return await client.read_file(path)

    async def write_file_tool(path: str, content: str) -> dict[str, Any]:
        await client.write_file(path, content)
        return {"success": True, "path": path}

    async def list_dir_tool(path: str) -> str:
        return await client.list_dir(path)

    return [
        GenericTool(
            name="bashlet_exec",
            description=EXEC_DESCRIPTION,
            parameters=EXEC_JSON_SCHEMA,
            execute=exec_tool,
        ),
        GenericTool(
            name="bashlet_read_file",
            description=READ_FILE_DESCRIPTION,
            parameters=READ_FILE_JSON_SCHEMA,
            execute=read_file_tool,
        ),
        GenericTool(
            name="bashlet_write_file",
            description=WRITE_FILE_DESCRIPTION,
            parameters=WRITE_FILE_JSON_SCHEMA,
            execute=write_file_tool,
        ),
        GenericTool(
            name="bashlet_list_dir",
            description=LIST_DIR_DESCRIPTION,
            parameters=LIST_DIR_JSON_SCHEMA,
            execute=list_dir_tool,
        ),
    ]


def create_tool_registry(
    client: Bashlet,
) -> dict[str, GenericTool]:
    """
    Create a tool registry for looking up tools by name.

    Args:
        client: Bashlet client instance

    Returns:
        Dictionary mapping tool names to GenericTool objects

    Example:
        >>> registry = create_tool_registry(bashlet)
        >>> exec_tool = registry["bashlet_exec"]
        >>> result = exec_tool.execute(command="ls")
    """
    tools = create_generic_tools(client)
    return {tool.name: tool for tool in tools}
