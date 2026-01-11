"""Tests for asynchronous Bashlet client."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from bashlet.async_client import AsyncBashlet
from bashlet.errors import (
    BashletError,
    BinaryNotFoundError,
    CommandExecutionError,
    TimeoutError,
)
from bashlet.types import Mount


class TestAsyncBashletInit:
    """Tests for AsyncBashlet initialization."""

    def test_default_options(self) -> None:
        bashlet = AsyncBashlet()
        assert bashlet._options.binary_path == "bashlet"
        assert bashlet._options.timeout == 300

    def test_custom_binary_path(self) -> None:
        bashlet = AsyncBashlet(binary_path="/custom/bashlet")
        assert bashlet._options.binary_path == "/custom/bashlet"

    def test_with_mounts(self) -> None:
        bashlet = AsyncBashlet(mounts=[Mount("/host", "/guest")])
        assert len(bashlet._options.mounts) == 1

    def test_with_all_options(self) -> None:
        bashlet = AsyncBashlet(
            binary_path="/custom/bashlet",
            preset="default",
            mounts=[Mount("/host", "/guest")],
            env_vars=[("FOO", "bar")],
            workdir="/workspace",
            timeout=60,
            config_path="/config.yaml",
        )
        assert bashlet._options.binary_path == "/custom/bashlet"
        assert bashlet._options.preset == "default"


class TestAsyncBashletExec:
    """Tests for AsyncBashlet.exec method."""

    @pytest.mark.asyncio
    async def test_exec_simple_command(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (
                json.dumps({"stdout": "hello\n", "stderr": "", "exit_code": 0}).encode(),
                b"",
            )
            mock_process.returncode = 0
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            result = await bashlet.exec("echo hello")

            assert result.stdout == "hello\n"
            assert result.stderr == ""
            assert result.exit_code == 0
            assert result.success is True

    @pytest.mark.asyncio
    async def test_exec_with_workdir(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (
                json.dumps({"stdout": "", "stderr": "", "exit_code": 0}).encode(),
                b"",
            )
            mock_process.returncode = 0
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            await bashlet.exec("ls", workdir="/workspace")

            call_args = mock_create.call_args[0]
            assert "--workdir" in call_args
            assert "/workspace" in call_args

    @pytest.mark.asyncio
    async def test_exec_with_mounts(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (
                json.dumps({"stdout": "", "stderr": "", "exit_code": 0}).encode(),
                b"",
            )
            mock_process.returncode = 0
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            await bashlet.exec("ls", mounts=[Mount("/host", "/guest", readonly=True)])

            call_args = mock_create.call_args[0]
            assert "--mount" in call_args
            assert "/host:/guest:ro" in call_args

    @pytest.mark.asyncio
    async def test_exec_timeout(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.side_effect = asyncio.TimeoutError()
            mock_process.kill = MagicMock()
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            with pytest.raises(TimeoutError):
                await bashlet.exec("sleep 1000", timeout=1)

    @pytest.mark.asyncio
    async def test_exec_binary_not_found(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_create.side_effect = FileNotFoundError()

            bashlet = AsyncBashlet()
            with pytest.raises(BinaryNotFoundError):
                await bashlet.exec("echo hello")

    @pytest.mark.asyncio
    async def test_exec_json_error_response(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (
                json.dumps({"error": "Something went wrong"}).encode(),
                b"",
            )
            mock_process.returncode = 1
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            with pytest.raises(BashletError):
                await bashlet.exec("bad command")

    @pytest.mark.asyncio
    async def test_exec_non_json_output(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (
                b"plain text output",
                b"some error",
            )
            mock_process.returncode = 0
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            result = await bashlet.exec("echo test")

            assert result.stdout == "plain text output"
            assert result.stderr == "some error"


class TestAsyncBashletSession:
    """Tests for AsyncBashlet session management."""

    @pytest.mark.asyncio
    async def test_create_session(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (
                json.dumps({
                    "stdout": json.dumps({"id": "abc123", "name": "my-session"}),
                    "stderr": "",
                    "exit_code": 0,
                }).encode(),
                b"",
            )
            mock_process.returncode = 0
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            session_id = await bashlet.create_session(name="my-session")

            assert session_id == "my-session"

    @pytest.mark.asyncio
    async def test_run_in_session(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (
                json.dumps({"stdout": "output", "stderr": "", "exit_code": 0}).encode(),
                b"",
            )
            mock_process.returncode = 0
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            result = await bashlet.run_in_session("my-session", "ls -la")

            assert result.stdout == "output"

    @pytest.mark.asyncio
    async def test_terminate(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b"", b"")
            mock_process.returncode = 0
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            await bashlet.terminate("my-session")

            call_args = mock_create.call_args[0]
            assert "terminate" in call_args

    @pytest.mark.asyncio
    async def test_list_sessions(self) -> None:
        session_data = [{
            "id": "session-1",
            "name": "my-session",
            "created_at": 1704067200,
            "last_activity": 1704067300,
            "ttl_seconds": 3600,
            "expired": False,
            "mounts": [],
            "workdir": "/",
        }]
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (
                json.dumps({
                    "stdout": json.dumps(session_data),
                    "stderr": "",
                    "exit_code": 0,
                }).encode(),
                b"",
            )
            mock_process.returncode = 0
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            sessions = await bashlet.list_sessions()

            assert len(sessions) == 1
            assert sessions[0].id == "session-1"


class TestAsyncBashletFileOperations:
    """Tests for AsyncBashlet file operations."""

    @pytest.mark.asyncio
    async def test_read_file(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (
                json.dumps({
                    "stdout": "file content",
                    "stderr": "",
                    "exit_code": 0,
                }).encode(),
                b"",
            )
            mock_process.returncode = 0
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            content = await bashlet.read_file("/file.txt")

            assert content == "file content"

    @pytest.mark.asyncio
    async def test_read_file_not_found(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (
                json.dumps({
                    "stdout": "",
                    "stderr": "No such file",
                    "exit_code": 1,
                }).encode(),
                b"",
            )
            mock_process.returncode = 1
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            with pytest.raises(CommandExecutionError):
                await bashlet.read_file("/missing")

    @pytest.mark.asyncio
    async def test_write_file(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (
                json.dumps({"stdout": "", "stderr": "", "exit_code": 0}).encode(),
                b"",
            )
            mock_process.returncode = 0
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            await bashlet.write_file("/file.txt", "content")

            # Should complete without error
            mock_create.assert_called()

    @pytest.mark.asyncio
    async def test_list_dir(self) -> None:
        with patch("asyncio.create_subprocess_exec") as mock_create:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (
                json.dumps({
                    "stdout": "file1\nfile2",
                    "stderr": "",
                    "exit_code": 0,
                }).encode(),
                b"",
            )
            mock_process.returncode = 0
            mock_create.return_value = mock_process

            bashlet = AsyncBashlet()
            listing = await bashlet.list_dir("/workspace")

            assert "file1" in listing


class TestAsyncBashletToolGenerators:
    """Tests for AsyncBashlet tool generator methods."""

    def test_has_to_langchain_tools(self) -> None:
        bashlet = AsyncBashlet()
        assert hasattr(bashlet, "to_langchain_tools")

    def test_has_to_openai_tools(self) -> None:
        bashlet = AsyncBashlet()
        assert hasattr(bashlet, "to_openai_tools")

    def test_has_to_anthropic_tools(self) -> None:
        bashlet = AsyncBashlet()
        assert hasattr(bashlet, "to_anthropic_tools")

    def test_has_to_mcp_tools(self) -> None:
        bashlet = AsyncBashlet()
        assert hasattr(bashlet, "to_mcp_tools")

    def test_has_to_generic_tools(self) -> None:
        bashlet = AsyncBashlet()
        assert hasattr(bashlet, "to_generic_tools")
