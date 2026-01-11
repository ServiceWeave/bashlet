"""Tests for generic tool definitions."""

from unittest.mock import MagicMock, AsyncMock, patch

import pytest

from bashlet.client import Bashlet
from bashlet.async_client import AsyncBashlet
from bashlet.tools.generic import (
    GenericTool,
    create_generic_tools,
    create_async_generic_tools,
    create_tool_registry,
    EXEC_DESCRIPTION,
    READ_FILE_DESCRIPTION,
    WRITE_FILE_DESCRIPTION,
    LIST_DIR_DESCRIPTION,
)
from bashlet.types import CommandResult


class TestGenericToolDataclass:
    """Tests for GenericTool dataclass."""

    def test_create(self) -> None:
        tool = GenericTool(
            name="test_tool",
            description="A test tool",
            parameters={"type": "object"},
            execute=lambda: None,
        )
        assert tool.name == "test_tool"
        assert tool.description == "A test tool"
        assert tool.parameters == {"type": "object"}
        assert callable(tool.execute)


class TestCreateGenericTools:
    """Tests for create_generic_tools function."""

    def test_creates_four_tools(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        tools = create_generic_tools(mock_client)
        assert len(tools) == 4

    def test_tool_names(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        tools = create_generic_tools(mock_client)
        names = [t.name for t in tools]
        assert "bashlet_exec" in names
        assert "bashlet_read_file" in names
        assert "bashlet_write_file" in names
        assert "bashlet_list_dir" in names

    def test_tools_have_descriptions(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        tools = create_generic_tools(mock_client)
        for tool in tools:
            assert tool.description
            assert len(tool.description) > 0

    def test_tools_have_parameters(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        tools = create_generic_tools(mock_client)
        for tool in tools:
            assert tool.parameters
            assert tool.parameters["type"] == "object"

    def test_exec_tool_executes(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        mock_client.exec.return_value = CommandResult(
            stdout="hello\n",
            stderr="",
            exit_code=0,
        )

        tools = create_generic_tools(mock_client)
        exec_tool = next(t for t in tools if t.name == "bashlet_exec")
        result = exec_tool.execute(command="echo hello")

        mock_client.exec.assert_called_once_with("echo hello", workdir=None)
        assert result["stdout"] == "hello\n"
        assert result["exit_code"] == 0

    def test_exec_tool_with_workdir(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        mock_client.exec.return_value = CommandResult(stdout="", stderr="", exit_code=0)

        tools = create_generic_tools(mock_client)
        exec_tool = next(t for t in tools if t.name == "bashlet_exec")
        exec_tool.execute(command="ls", workdir="/workspace")

        mock_client.exec.assert_called_once_with("ls", workdir="/workspace")

    def test_read_file_tool_executes(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        mock_client.read_file.return_value = "file content"

        tools = create_generic_tools(mock_client)
        tool = next(t for t in tools if t.name == "bashlet_read_file")
        result = tool.execute(path="/file.txt")

        mock_client.read_file.assert_called_once_with("/file.txt")
        assert result == "file content"

    def test_write_file_tool_executes(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        mock_client.write_file.return_value = None

        tools = create_generic_tools(mock_client)
        tool = next(t for t in tools if t.name == "bashlet_write_file")
        result = tool.execute(path="/file.txt", content="new content")

        mock_client.write_file.assert_called_once_with("/file.txt", "new content")
        assert result["success"] is True
        assert result["path"] == "/file.txt"

    def test_list_dir_tool_executes(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        mock_client.list_dir.return_value = "file1\nfile2"

        tools = create_generic_tools(mock_client)
        tool = next(t for t in tools if t.name == "bashlet_list_dir")
        result = tool.execute(path="/workspace")

        mock_client.list_dir.assert_called_once_with("/workspace")
        assert result == "file1\nfile2"


class TestCreateAsyncGenericTools:
    """Tests for create_async_generic_tools function."""

    def test_creates_four_tools(self) -> None:
        mock_client = MagicMock(spec=AsyncBashlet)
        tools = create_async_generic_tools(mock_client)
        assert len(tools) == 4

    def test_tool_names(self) -> None:
        mock_client = MagicMock(spec=AsyncBashlet)
        tools = create_async_generic_tools(mock_client)
        names = [t.name for t in tools]
        assert "bashlet_exec" in names
        assert "bashlet_read_file" in names
        assert "bashlet_write_file" in names
        assert "bashlet_list_dir" in names

    @pytest.mark.asyncio
    async def test_exec_tool_executes_async(self) -> None:
        mock_client = MagicMock(spec=AsyncBashlet)
        mock_client.exec = AsyncMock(return_value=CommandResult(
            stdout="hello\n",
            stderr="",
            exit_code=0,
        ))

        tools = create_async_generic_tools(mock_client)
        exec_tool = next(t for t in tools if t.name == "bashlet_exec")
        result = await exec_tool.execute(command="echo hello")

        mock_client.exec.assert_called_once_with("echo hello", workdir=None)
        assert result["stdout"] == "hello\n"

    @pytest.mark.asyncio
    async def test_read_file_tool_executes_async(self) -> None:
        mock_client = MagicMock(spec=AsyncBashlet)
        mock_client.read_file = AsyncMock(return_value="file content")

        tools = create_async_generic_tools(mock_client)
        tool = next(t for t in tools if t.name == "bashlet_read_file")
        result = await tool.execute(path="/file.txt")

        assert result == "file content"

    @pytest.mark.asyncio
    async def test_write_file_tool_executes_async(self) -> None:
        mock_client = MagicMock(spec=AsyncBashlet)
        mock_client.write_file = AsyncMock(return_value=None)

        tools = create_async_generic_tools(mock_client)
        tool = next(t for t in tools if t.name == "bashlet_write_file")
        result = await tool.execute(path="/file.txt", content="content")

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_list_dir_tool_executes_async(self) -> None:
        mock_client = MagicMock(spec=AsyncBashlet)
        mock_client.list_dir = AsyncMock(return_value="files")

        tools = create_async_generic_tools(mock_client)
        tool = next(t for t in tools if t.name == "bashlet_list_dir")
        result = await tool.execute(path="/")

        assert result == "files"


class TestCreateToolRegistry:
    """Tests for create_tool_registry function."""

    def test_creates_registry(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        registry = create_tool_registry(mock_client)
        assert isinstance(registry, dict)
        assert len(registry) == 4

    def test_registry_keys(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        registry = create_tool_registry(mock_client)
        assert "bashlet_exec" in registry
        assert "bashlet_read_file" in registry
        assert "bashlet_write_file" in registry
        assert "bashlet_list_dir" in registry

    def test_registry_values_are_tools(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        registry = create_tool_registry(mock_client)
        for name, tool in registry.items():
            assert isinstance(tool, GenericTool)
            assert tool.name == name

    def test_can_execute_from_registry(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        mock_client.exec.return_value = CommandResult(stdout="", stderr="", exit_code=0)

        registry = create_tool_registry(mock_client)
        registry["bashlet_exec"].execute(command="ls")

        mock_client.exec.assert_called_once()


class TestToolDescriptions:
    """Tests for tool description constants."""

    def test_exec_description(self) -> None:
        assert "shell" in EXEC_DESCRIPTION.lower()
        assert "sandbox" in EXEC_DESCRIPTION.lower()

    def test_read_file_description(self) -> None:
        assert "read" in READ_FILE_DESCRIPTION.lower()
        assert "file" in READ_FILE_DESCRIPTION.lower()

    def test_write_file_description(self) -> None:
        assert "write" in WRITE_FILE_DESCRIPTION.lower()
        assert "file" in WRITE_FILE_DESCRIPTION.lower()

    def test_list_dir_description(self) -> None:
        assert "list" in LIST_DIR_DESCRIPTION.lower()
        assert "directory" in LIST_DIR_DESCRIPTION.lower()
