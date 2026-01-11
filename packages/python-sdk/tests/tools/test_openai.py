"""Tests for OpenAI function calling tool definitions."""

import json
from unittest.mock import MagicMock, AsyncMock

import pytest

from bashlet.client import Bashlet
from bashlet.async_client import AsyncBashlet
from bashlet.tools.openai import (
    OpenAIToolHandler,
    create_openai_tools,
    create_async_openai_tools,
)
from bashlet.types import CommandResult


class TestOpenAIToolHandler:
    """Tests for OpenAIToolHandler dataclass."""

    def test_create(self) -> None:
        handler = OpenAIToolHandler(
            definitions=[],
            _handlers={},
            _async=False,
        )
        assert handler.definitions == []
        assert handler._handlers == {}
        assert handler._async is False

    def test_handle_with_dict_arguments(self) -> None:
        handler = OpenAIToolHandler(
            definitions=[],
            _handlers={"test": lambda x: x * 2},
            _async=False,
        )
        result = handler.handle("test", {"x": 5})
        assert result == 10

    def test_handle_with_json_string_arguments(self) -> None:
        handler = OpenAIToolHandler(
            definitions=[],
            _handlers={"test": lambda x: x * 2},
            _async=False,
        )
        result = handler.handle("test", '{"x": 5}')
        assert result == 10

    def test_handle_unknown_tool(self) -> None:
        handler = OpenAIToolHandler(
            definitions=[],
            _handlers={},
            _async=False,
        )
        with pytest.raises(ValueError) as exc_info:
            handler.handle("unknown", {})
        assert "Unknown tool" in str(exc_info.value)

    def test_handle_raises_for_async_handler(self) -> None:
        handler = OpenAIToolHandler(
            definitions=[],
            _handlers={},
            _async=True,
        )
        with pytest.raises(RuntimeError) as exc_info:
            handler.handle("test", {})
        assert "handle_async" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_handle_async(self) -> None:
        async def async_handler(x: int) -> int:
            return x * 2

        handler = OpenAIToolHandler(
            definitions=[],
            _handlers={"test": async_handler},
            _async=True,
        )
        result = await handler.handle_async("test", {"x": 5})
        assert result == 10

    @pytest.mark.asyncio
    async def test_handle_async_with_json_string(self) -> None:
        async def async_handler(x: int) -> int:
            return x * 2

        handler = OpenAIToolHandler(
            definitions=[],
            _handlers={"test": async_handler},
            _async=True,
        )
        result = await handler.handle_async("test", '{"x": 5}')
        assert result == 10

    @pytest.mark.asyncio
    async def test_handle_async_unknown_tool(self) -> None:
        handler = OpenAIToolHandler(
            definitions=[],
            _handlers={},
            _async=True,
        )
        with pytest.raises(ValueError):
            await handler.handle_async("unknown", {})

    @pytest.mark.asyncio
    async def test_handle_async_raises_for_sync_handler(self) -> None:
        handler = OpenAIToolHandler(
            definitions=[],
            _handlers={},
            _async=False,
        )
        with pytest.raises(RuntimeError) as exc_info:
            await handler.handle_async("test", {})
        assert "handle()" in str(exc_info.value)


class TestCreateOpenAITools:
    """Tests for create_openai_tools function."""

    def test_returns_handler(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        handler = create_openai_tools(mock_client)
        assert isinstance(handler, OpenAIToolHandler)

    def test_has_four_definitions(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        handler = create_openai_tools(mock_client)
        assert len(handler.definitions) == 4

    def test_definitions_have_correct_structure(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        handler = create_openai_tools(mock_client)

        for definition in handler.definitions:
            assert definition["type"] == "function"
            assert "function" in definition
            assert "name" in definition["function"]
            assert "description" in definition["function"]
            assert "parameters" in definition["function"]

    def test_definitions_have_correct_names(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        handler = create_openai_tools(mock_client)

        names = [d["function"]["name"] for d in handler.definitions]
        assert "bashlet_exec" in names
        assert "bashlet_read_file" in names
        assert "bashlet_write_file" in names
        assert "bashlet_list_dir" in names

    def test_is_not_async(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        handler = create_openai_tools(mock_client)
        assert handler._async is False

    def test_handle_exec(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        mock_client.exec.return_value = CommandResult(
            stdout="hello\n",
            stderr="",
            exit_code=0,
        )

        handler = create_openai_tools(mock_client)
        result = handler.handle("bashlet_exec", {"command": "echo hello"})

        mock_client.exec.assert_called_once_with("echo hello", workdir=None)
        parsed = json.loads(result)
        assert parsed["stdout"] == "hello\n"
        assert parsed["exit_code"] == 0

    def test_handle_exec_with_workdir(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        mock_client.exec.return_value = CommandResult(stdout="", stderr="", exit_code=0)

        handler = create_openai_tools(mock_client)
        handler.handle("bashlet_exec", {"command": "ls", "workdir": "/workspace"})

        mock_client.exec.assert_called_once_with("ls", workdir="/workspace")

    def test_handle_read_file(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        mock_client.read_file.return_value = "file content"

        handler = create_openai_tools(mock_client)
        result = handler.handle("bashlet_read_file", {"path": "/file.txt"})

        mock_client.read_file.assert_called_once_with("/file.txt")
        assert result == "file content"

    def test_handle_write_file(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        mock_client.write_file.return_value = None

        handler = create_openai_tools(mock_client)
        result = handler.handle("bashlet_write_file", {
            "path": "/file.txt",
            "content": "new content",
        })

        mock_client.write_file.assert_called_once_with("/file.txt", "new content")
        parsed = json.loads(result)
        assert parsed["success"] is True
        assert parsed["path"] == "/file.txt"

    def test_handle_list_dir(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        mock_client.list_dir.return_value = "file1\nfile2"

        handler = create_openai_tools(mock_client)
        result = handler.handle("bashlet_list_dir", {"path": "/workspace"})

        mock_client.list_dir.assert_called_once_with("/workspace")
        assert result == "file1\nfile2"


class TestCreateAsyncOpenAITools:
    """Tests for create_async_openai_tools function."""

    def test_returns_handler(self) -> None:
        mock_client = MagicMock(spec=AsyncBashlet)
        handler = create_async_openai_tools(mock_client)
        assert isinstance(handler, OpenAIToolHandler)

    def test_has_four_definitions(self) -> None:
        mock_client = MagicMock(spec=AsyncBashlet)
        handler = create_async_openai_tools(mock_client)
        assert len(handler.definitions) == 4

    def test_is_async(self) -> None:
        mock_client = MagicMock(spec=AsyncBashlet)
        handler = create_async_openai_tools(mock_client)
        assert handler._async is True

    @pytest.mark.asyncio
    async def test_handle_async_exec(self) -> None:
        mock_client = MagicMock(spec=AsyncBashlet)
        mock_client.exec = AsyncMock(return_value=CommandResult(
            stdout="hello\n",
            stderr="",
            exit_code=0,
        ))

        handler = create_async_openai_tools(mock_client)
        result = await handler.handle_async("bashlet_exec", {"command": "echo hello"})

        mock_client.exec.assert_called_once_with("echo hello", workdir=None)
        parsed = json.loads(result)
        assert parsed["stdout"] == "hello\n"

    @pytest.mark.asyncio
    async def test_handle_async_read_file(self) -> None:
        mock_client = MagicMock(spec=AsyncBashlet)
        mock_client.read_file = AsyncMock(return_value="content")

        handler = create_async_openai_tools(mock_client)
        result = await handler.handle_async("bashlet_read_file", {"path": "/file"})

        assert result == "content"

    @pytest.mark.asyncio
    async def test_handle_async_write_file(self) -> None:
        mock_client = MagicMock(spec=AsyncBashlet)
        mock_client.write_file = AsyncMock(return_value=None)

        handler = create_async_openai_tools(mock_client)
        result = await handler.handle_async("bashlet_write_file", {
            "path": "/file",
            "content": "data",
        })

        parsed = json.loads(result)
        assert parsed["success"] is True

    @pytest.mark.asyncio
    async def test_handle_async_list_dir(self) -> None:
        mock_client = MagicMock(spec=AsyncBashlet)
        mock_client.list_dir = AsyncMock(return_value="files")

        handler = create_async_openai_tools(mock_client)
        result = await handler.handle_async("bashlet_list_dir", {"path": "/"})

        assert result == "files"


class TestOpenAIToolParameters:
    """Tests for OpenAI tool parameter schemas."""

    def test_exec_requires_command(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        handler = create_openai_tools(mock_client)

        exec_def = next(d for d in handler.definitions if d["function"]["name"] == "bashlet_exec")
        assert "command" in exec_def["function"]["parameters"]["required"]

    def test_read_file_requires_path(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        handler = create_openai_tools(mock_client)

        def_obj = next(d for d in handler.definitions if d["function"]["name"] == "bashlet_read_file")
        assert "path" in def_obj["function"]["parameters"]["required"]

    def test_write_file_requires_path_and_content(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        handler = create_openai_tools(mock_client)

        def_obj = next(d for d in handler.definitions if d["function"]["name"] == "bashlet_write_file")
        required = def_obj["function"]["parameters"]["required"]
        assert "path" in required
        assert "content" in required

    def test_list_dir_requires_path(self) -> None:
        mock_client = MagicMock(spec=Bashlet)
        handler = create_openai_tools(mock_client)

        def_obj = next(d for d in handler.definitions if d["function"]["name"] == "bashlet_list_dir")
        assert "path" in def_obj["function"]["parameters"]["required"]
