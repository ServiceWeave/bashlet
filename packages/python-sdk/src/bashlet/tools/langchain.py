"""LangChain tool definitions.

Requires: pip install bashlet[langchain]
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from langchain_core.tools import BaseTool, ToolException

from .generic import (
    EXEC_DESCRIPTION,
    LIST_DIR_DESCRIPTION,
    READ_FILE_DESCRIPTION,
    WRITE_FILE_DESCRIPTION,
)

if TYPE_CHECKING:
    from ..async_client import AsyncBashlet
    from ..client import Bashlet


class BashletExecTool(BaseTool):
    """LangChain tool for executing shell commands in bashlet sandbox."""

    name: str = "bashlet_exec"
    description: str = EXEC_DESCRIPTION
    client: Any = None  # Bashlet client

    def _run(self, command: str, workdir: str | None = None) -> str:
        """Execute command synchronously."""
        try:
            result = self.client.exec(command, workdir=workdir)
            return f"Exit code: {result.exit_code}\nStdout:\n{result.stdout}\nStderr:\n{result.stderr}"
        except Exception as e:
            raise ToolException(str(e))

    async def _arun(self, command: str, workdir: str | None = None) -> str:
        """Execute command asynchronously."""
        try:
            result = await self.client.exec(command, workdir=workdir)
            return f"Exit code: {result.exit_code}\nStdout:\n{result.stdout}\nStderr:\n{result.stderr}"
        except Exception as e:
            raise ToolException(str(e))


class BashletReadFileTool(BaseTool):
    """LangChain tool for reading files from bashlet sandbox."""

    name: str = "bashlet_read_file"
    description: str = READ_FILE_DESCRIPTION
    client: Any = None

    def _run(self, path: str) -> str:
        """Read file synchronously."""
        try:
            return self.client.read_file(path)
        except Exception as e:
            raise ToolException(str(e))

    async def _arun(self, path: str) -> str:
        """Read file asynchronously."""
        try:
            return await self.client.read_file(path)
        except Exception as e:
            raise ToolException(str(e))


class BashletWriteFileTool(BaseTool):
    """LangChain tool for writing files to bashlet sandbox."""

    name: str = "bashlet_write_file"
    description: str = WRITE_FILE_DESCRIPTION
    client: Any = None

    def _run(self, path: str, content: str) -> str:
        """Write file synchronously."""
        try:
            self.client.write_file(path, content)
            return f"Successfully wrote to {path}"
        except Exception as e:
            raise ToolException(str(e))

    async def _arun(self, path: str, content: str) -> str:
        """Write file asynchronously."""
        try:
            await self.client.write_file(path, content)
            return f"Successfully wrote to {path}"
        except Exception as e:
            raise ToolException(str(e))


class BashletListDirTool(BaseTool):
    """LangChain tool for listing directories in bashlet sandbox."""

    name: str = "bashlet_list_dir"
    description: str = LIST_DIR_DESCRIPTION
    client: Any = None

    def _run(self, path: str) -> str:
        """List directory synchronously."""
        try:
            return self.client.list_dir(path)
        except Exception as e:
            raise ToolException(str(e))

    async def _arun(self, path: str) -> str:
        """List directory asynchronously."""
        try:
            return await self.client.list_dir(path)
        except Exception as e:
            raise ToolException(str(e))


@dataclass
class BashletLangChainTools:
    """Container for LangChain bashlet tools."""

    exec: BashletExecTool
    read_file: BashletReadFileTool
    write_file: BashletWriteFileTool
    list_dir: BashletListDirTool

    def all(self) -> list[BaseTool]:
        """Return all tools as a list."""
        return [self.exec, self.read_file, self.write_file, self.list_dir]


def create_langchain_tools(client: Bashlet) -> BashletLangChainTools:
    """
    Create LangChain-compatible tools for sync client.

    Args:
        client: Sync Bashlet client instance

    Returns:
        BashletLangChainTools container with all tools

    Example:
        >>> from langchain_openai import ChatOpenAI
        >>> bashlet = Bashlet()
        >>> tools = create_langchain_tools(bashlet)
        >>> llm = ChatOpenAI().bind_tools(tools.all())
    """
    return BashletLangChainTools(
        exec=BashletExecTool(client=client),
        read_file=BashletReadFileTool(client=client),
        write_file=BashletWriteFileTool(client=client),
        list_dir=BashletListDirTool(client=client),
    )


def create_async_langchain_tools(client: AsyncBashlet) -> BashletLangChainTools:
    """
    Create LangChain-compatible tools for async client.

    Args:
        client: Async Bashlet client instance

    Returns:
        BashletLangChainTools container with all tools (using async methods)

    Example:
        >>> bashlet = AsyncBashlet()
        >>> tools = create_async_langchain_tools(bashlet)
        >>> # Use with async LangChain operations
    """
    return BashletLangChainTools(
        exec=BashletExecTool(client=client),
        read_file=BashletReadFileTool(client=client),
        write_file=BashletWriteFileTool(client=client),
        list_dir=BashletListDirTool(client=client),
    )
