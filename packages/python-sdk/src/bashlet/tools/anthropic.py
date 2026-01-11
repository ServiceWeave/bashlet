"""Anthropic tool use definitions.

Requires: pip install bashlet[anthropic]
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
    from anthropic.types import ToolParam

    from ..async_client import AsyncBashlet
    from ..client import Bashlet


@dataclass
class AnthropicToolHandler:
    """Handler for Anthropic tool use."""

    definitions: list[ToolParam]
    """Tool definitions to pass to Anthropic API."""

    _handlers: dict[str, Callable[..., Any]] = field(default_factory=dict, repr=False)
    """Internal handler mapping."""

    _async: bool = False
    """Whether handlers are async."""

    def handle(self, name: str, input_data: dict[str, Any]) -> Any:
        """
        Handle a tool use synchronously.

        Args:
            name: Tool name from the tool use block
            input_data: Input dict from the tool use block

        Returns:
            Tool execution result

        Example:
            >>> for block in response.content:
            ...     if block.type == "tool_use":
            ...         result = handler.handle(block.name, block.input)
        """
        if self._async:
            raise RuntimeError("Use handle_async() for async handlers")

        if name not in self._handlers:
            raise ValueError(f"Unknown tool: {name}")

        return self._handlers[name](**input_data)

    async def handle_async(self, name: str, input_data: dict[str, Any]) -> Any:
        """
        Handle a tool use asynchronously.

        Args:
            name: Tool name from the tool use block
            input_data: Input dict from the tool use block

        Returns:
            Tool execution result

        Example:
            >>> for block in response.content:
            ...     if block.type == "tool_use":
            ...         result = await handler.handle_async(block.name, block.input)
        """
        if not self._async:
            raise RuntimeError("Use handle() for sync handlers")

        if name not in self._handlers:
            raise ValueError(f"Unknown tool: {name}")

        return await self._handlers[name](**input_data)


def create_anthropic_tools(client: Bashlet) -> AnthropicToolHandler:
    """
    Create Anthropic tool use-compatible tools for sync client.

    Args:
        client: Sync Bashlet client instance

    Returns:
        AnthropicToolHandler with tool definitions and sync handler

    Example:
        >>> from anthropic import Anthropic
        >>> anthropic_client = Anthropic()
        >>> bashlet = Bashlet()
        >>> handler = create_anthropic_tools(bashlet)
        >>>
        >>> response = anthropic_client.messages.create(
        ...     model="claude-3-opus-20240229",
        ...     tools=handler.definitions,
        ...     messages=[{"role": "user", "content": "List files"}],
        ... )
        >>>
        >>> for block in response.content:
        ...     if block.type == "tool_use":
        ...         result = handler.handle(block.name, block.input)
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

    def write_file_handler(path: str, content: str) -> dict[str, Any]:
        client.write_file(path, content)
        return {"success": True, "path": path}

    def list_dir_handler(path: str) -> str:
        return client.list_dir(path)

    definitions: list[ToolParam] = [
        {
            "name": "bashlet_exec",
            "description": EXEC_DESCRIPTION,
            "input_schema": EXEC_JSON_SCHEMA,
        },
        {
            "name": "bashlet_read_file",
            "description": READ_FILE_DESCRIPTION,
            "input_schema": READ_FILE_JSON_SCHEMA,
        },
        {
            "name": "bashlet_write_file",
            "description": WRITE_FILE_DESCRIPTION,
            "input_schema": WRITE_FILE_JSON_SCHEMA,
        },
        {
            "name": "bashlet_list_dir",
            "description": LIST_DIR_DESCRIPTION,
            "input_schema": LIST_DIR_JSON_SCHEMA,
        },
    ]

    return AnthropicToolHandler(
        definitions=definitions,
        _handlers={
            "bashlet_exec": exec_handler,
            "bashlet_read_file": read_file_handler,
            "bashlet_write_file": write_file_handler,
            "bashlet_list_dir": list_dir_handler,
        },
        _async=False,
    )


def create_async_anthropic_tools(client: AsyncBashlet) -> AnthropicToolHandler:
    """
    Create Anthropic tool use-compatible tools for async client.

    Args:
        client: Async Bashlet client instance

    Returns:
        AnthropicToolHandler with tool definitions and async handler

    Example:
        >>> from anthropic import AsyncAnthropic
        >>> anthropic_client = AsyncAnthropic()
        >>> bashlet = AsyncBashlet()
        >>> handler = create_async_anthropic_tools(bashlet)
        >>>
        >>> response = await anthropic_client.messages.create(
        ...     model="claude-3-opus-20240229",
        ...     tools=handler.definitions,
        ...     messages=[{"role": "user", "content": "List files"}],
        ... )
        >>>
        >>> for block in response.content:
        ...     if block.type == "tool_use":
        ...         result = await handler.handle_async(block.name, block.input)
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

    async def write_file_handler(path: str, content: str) -> dict[str, Any]:
        await client.write_file(path, content)
        return {"success": True, "path": path}

    async def list_dir_handler(path: str) -> str:
        return await client.list_dir(path)

    definitions: list[ToolParam] = [
        {
            "name": "bashlet_exec",
            "description": EXEC_DESCRIPTION,
            "input_schema": EXEC_JSON_SCHEMA,
        },
        {
            "name": "bashlet_read_file",
            "description": READ_FILE_DESCRIPTION,
            "input_schema": READ_FILE_JSON_SCHEMA,
        },
        {
            "name": "bashlet_write_file",
            "description": WRITE_FILE_DESCRIPTION,
            "input_schema": WRITE_FILE_JSON_SCHEMA,
        },
        {
            "name": "bashlet_list_dir",
            "description": LIST_DIR_DESCRIPTION,
            "input_schema": LIST_DIR_JSON_SCHEMA,
        },
    ]

    return AnthropicToolHandler(
        definitions=definitions,
        _handlers={
            "bashlet_exec": exec_handler,
            "bashlet_read_file": read_file_handler,
            "bashlet_write_file": write_file_handler,
            "bashlet_list_dir": list_dir_handler,
        },
        _async=True,
    )
