"""OpenAI function calling tool definitions.

Requires: pip install bashlet[openai]
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable, Coroutine

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
    from openai.types.chat import ChatCompletionToolParam

    from ..async_client import AsyncBashlet
    from ..client import Bashlet


@dataclass
class OpenAIToolHandler:
    """Handler for OpenAI function calling tools."""

    definitions: list[ChatCompletionToolParam]
    """Tool definitions to pass to OpenAI API."""

    _handlers: dict[str, Callable[..., Any]] = field(default_factory=dict, repr=False)
    """Internal handler mapping."""

    _async: bool = False
    """Whether handlers are async."""

    def handle(self, name: str, arguments: dict[str, Any] | str) -> Any:
        """
        Handle a tool call synchronously.

        Args:
            name: Tool name from the function call
            arguments: Arguments dict or JSON string

        Returns:
            Tool execution result as string

        Example:
            >>> result = handler.handle(
            ...     tool_call.function.name,
            ...     json.loads(tool_call.function.arguments)
            ... )
        """
        if self._async:
            raise RuntimeError("Use handle_async() for async handlers")

        if name not in self._handlers:
            raise ValueError(f"Unknown tool: {name}")

        if isinstance(arguments, str):
            arguments = json.loads(arguments)

        return self._handlers[name](**arguments)

    async def handle_async(self, name: str, arguments: dict[str, Any] | str) -> Any:
        """
        Handle a tool call asynchronously.

        Args:
            name: Tool name from the function call
            arguments: Arguments dict or JSON string

        Returns:
            Tool execution result as string

        Example:
            >>> result = await handler.handle_async(
            ...     tool_call.function.name,
            ...     json.loads(tool_call.function.arguments)
            ... )
        """
        if not self._async:
            raise RuntimeError("Use handle() for sync handlers")

        if name not in self._handlers:
            raise ValueError(f"Unknown tool: {name}")

        if isinstance(arguments, str):
            arguments = json.loads(arguments)

        return await self._handlers[name](**arguments)


def create_openai_tools(client: Bashlet) -> OpenAIToolHandler:
    """
    Create OpenAI function calling-compatible tools for sync client.

    Args:
        client: Sync Bashlet client instance

    Returns:
        OpenAIToolHandler with tool definitions and sync handler

    Example:
        >>> from openai import OpenAI
        >>> openai_client = OpenAI()
        >>> bashlet = Bashlet()
        >>> handler = create_openai_tools(bashlet)
        >>>
        >>> response = openai_client.chat.completions.create(
        ...     model="gpt-4-turbo",
        ...     tools=handler.definitions,
        ...     messages=[{"role": "user", "content": "List files"}],
        ... )
        >>>
        >>> for tool_call in response.choices[0].message.tool_calls or []:
        ...     result = handler.handle(
        ...         tool_call.function.name,
        ...         tool_call.function.arguments
        ...     )
    """

    def exec_handler(command: str, workdir: str | None = None) -> str:
        result = client.exec(command, workdir=workdir)
        return json.dumps({
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
        })

    def read_file_handler(path: str) -> str:
        return client.read_file(path)

    def write_file_handler(path: str, content: str) -> str:
        client.write_file(path, content)
        return json.dumps({"success": True, "path": path})

    def list_dir_handler(path: str) -> str:
        return client.list_dir(path)

    definitions: list[ChatCompletionToolParam] = [
        {
            "type": "function",
            "function": {
                "name": "bashlet_exec",
                "description": EXEC_DESCRIPTION,
                "parameters": EXEC_JSON_SCHEMA,
            },
        },
        {
            "type": "function",
            "function": {
                "name": "bashlet_read_file",
                "description": READ_FILE_DESCRIPTION,
                "parameters": READ_FILE_JSON_SCHEMA,
            },
        },
        {
            "type": "function",
            "function": {
                "name": "bashlet_write_file",
                "description": WRITE_FILE_DESCRIPTION,
                "parameters": WRITE_FILE_JSON_SCHEMA,
            },
        },
        {
            "type": "function",
            "function": {
                "name": "bashlet_list_dir",
                "description": LIST_DIR_DESCRIPTION,
                "parameters": LIST_DIR_JSON_SCHEMA,
            },
        },
    ]

    return OpenAIToolHandler(
        definitions=definitions,
        _handlers={
            "bashlet_exec": exec_handler,
            "bashlet_read_file": read_file_handler,
            "bashlet_write_file": write_file_handler,
            "bashlet_list_dir": list_dir_handler,
        },
        _async=False,
    )


def create_async_openai_tools(client: AsyncBashlet) -> OpenAIToolHandler:
    """
    Create OpenAI function calling-compatible tools for async client.

    Args:
        client: Async Bashlet client instance

    Returns:
        OpenAIToolHandler with tool definitions and async handler

    Example:
        >>> from openai import AsyncOpenAI
        >>> openai_client = AsyncOpenAI()
        >>> bashlet = AsyncBashlet()
        >>> handler = create_async_openai_tools(bashlet)
        >>>
        >>> response = await openai_client.chat.completions.create(
        ...     model="gpt-4-turbo",
        ...     tools=handler.definitions,
        ...     messages=[{"role": "user", "content": "List files"}],
        ... )
        >>>
        >>> for tool_call in response.choices[0].message.tool_calls or []:
        ...     result = await handler.handle_async(
        ...         tool_call.function.name,
        ...         tool_call.function.arguments
        ...     )
    """

    async def exec_handler(command: str, workdir: str | None = None) -> str:
        result = await client.exec(command, workdir=workdir)
        return json.dumps({
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
        })

    async def read_file_handler(path: str) -> str:
        return await client.read_file(path)

    async def write_file_handler(path: str, content: str) -> str:
        await client.write_file(path, content)
        return json.dumps({"success": True, "path": path})

    async def list_dir_handler(path: str) -> str:
        return await client.list_dir(path)

    definitions: list[ChatCompletionToolParam] = [
        {
            "type": "function",
            "function": {
                "name": "bashlet_exec",
                "description": EXEC_DESCRIPTION,
                "parameters": EXEC_JSON_SCHEMA,
            },
        },
        {
            "type": "function",
            "function": {
                "name": "bashlet_read_file",
                "description": READ_FILE_DESCRIPTION,
                "parameters": READ_FILE_JSON_SCHEMA,
            },
        },
        {
            "type": "function",
            "function": {
                "name": "bashlet_write_file",
                "description": WRITE_FILE_DESCRIPTION,
                "parameters": WRITE_FILE_JSON_SCHEMA,
            },
        },
        {
            "type": "function",
            "function": {
                "name": "bashlet_list_dir",
                "description": LIST_DIR_DESCRIPTION,
                "parameters": LIST_DIR_JSON_SCHEMA,
            },
        },
    ]

    return OpenAIToolHandler(
        definitions=definitions,
        _handlers={
            "bashlet_exec": exec_handler,
            "bashlet_read_file": read_file_handler,
            "bashlet_write_file": write_file_handler,
            "bashlet_list_dir": list_dir_handler,
        },
        _async=True,
    )
