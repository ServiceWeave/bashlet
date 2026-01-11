"""Tests for synchronous Bashlet client."""

import json
import subprocess
from unittest.mock import MagicMock, patch

import pytest

from bashlet.client import Bashlet
from bashlet.errors import (
    BashletError,
    BinaryNotFoundError,
    CommandExecutionError,
    TimeoutError,
)
from bashlet.types import Mount


class TestBashletInit:
    """Tests for Bashlet initialization."""

    def test_default_options(self) -> None:
        bashlet = Bashlet()
        assert bashlet._options.binary_path == "bashlet"
        assert bashlet._options.timeout == 300

    def test_custom_binary_path(self) -> None:
        bashlet = Bashlet(binary_path="/custom/bashlet")
        assert bashlet._options.binary_path == "/custom/bashlet"

    def test_with_mounts(self) -> None:
        bashlet = Bashlet(mounts=[Mount("/host", "/guest")])
        assert len(bashlet._options.mounts) == 1
        assert bashlet._options.mounts[0].host_path == "/host"

    def test_with_dict_mounts(self) -> None:
        bashlet = Bashlet(mounts=[{"host_path": "/host", "guest_path": "/guest"}])
        assert len(bashlet._options.mounts) == 1
        assert bashlet._options.mounts[0].host_path == "/host"

    def test_with_env_vars(self) -> None:
        bashlet = Bashlet(env_vars=[("FOO", "bar"), ("BAZ", "qux")])
        assert len(bashlet._options.env_vars) == 2
        assert bashlet._options.env_vars[0].key == "FOO"

    def test_with_all_options(self) -> None:
        bashlet = Bashlet(
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
        assert bashlet._options.workdir == "/workspace"
        assert bashlet._options.timeout == 60
        assert bashlet._options.config_path == "/config.yaml"


class TestBashletExec:
    """Tests for Bashlet.exec method."""

    @patch("subprocess.run")
    def test_exec_simple_command(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"stdout": "hello\n", "stderr": "", "exit_code": 0}),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        result = bashlet.exec("echo hello")

        assert result.stdout == "hello\n"
        assert result.stderr == ""
        assert result.exit_code == 0
        assert result.success is True

        mock_run.assert_called_once()
        call_args = mock_run.call_args[0][0]
        assert "bashlet" in call_args
        assert "--format" in call_args
        assert "json" in call_args
        assert "exec" in call_args
        assert "echo hello" in call_args

    @patch("subprocess.run")
    def test_exec_with_workdir(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"stdout": "", "stderr": "", "exit_code": 0}),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        bashlet.exec("ls", workdir="/workspace")

        call_args = mock_run.call_args[0][0]
        assert "--workdir" in call_args
        assert "/workspace" in call_args

    @patch("subprocess.run")
    def test_exec_with_mounts(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"stdout": "", "stderr": "", "exit_code": 0}),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        bashlet.exec("ls", mounts=[
            Mount("/host1", "/guest1"),
            Mount("/host2", "/guest2", readonly=True),
        ])

        call_args = mock_run.call_args[0][0]
        assert "--mount" in call_args
        assert "/host1:/guest1" in call_args
        assert "/host2:/guest2:ro" in call_args

    @patch("subprocess.run")
    def test_exec_with_env_vars(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"stdout": "", "stderr": "", "exit_code": 0}),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        bashlet.exec("printenv", env_vars=[("FOO", "bar"), ("BAZ", "qux")])

        call_args = mock_run.call_args[0][0]
        assert "--env" in call_args
        assert "FOO=bar" in call_args
        assert "BAZ=qux" in call_args

    @patch("subprocess.run")
    def test_exec_with_preset(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"stdout": "", "stderr": "", "exit_code": 0}),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        bashlet.exec("npm install", preset="node")

        call_args = mock_run.call_args[0][0]
        assert "--preset" in call_args
        assert "node" in call_args

    @patch("subprocess.run")
    def test_exec_merges_default_options(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"stdout": "", "stderr": "", "exit_code": 0}),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet(
            mounts=[Mount("/default", "/default-guest")],
            env_vars=[("DEFAULT", "value")],
        )
        bashlet.exec("ls", mounts=[Mount("/extra", "/extra-guest")])

        call_args = mock_run.call_args[0][0]
        assert "/default:/default-guest" in call_args
        assert "/extra:/extra-guest" in call_args
        assert "DEFAULT=value" in call_args

    @patch("subprocess.run")
    def test_exec_with_config_path(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"stdout": "", "stderr": "", "exit_code": 0}),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet(config_path="/my/config.yaml")
        bashlet.exec("ls")

        call_args = mock_run.call_args[0][0]
        assert "--config" in call_args
        assert "/my/config.yaml" in call_args

    @patch("subprocess.run")
    def test_exec_timeout(self, mock_run: MagicMock) -> None:
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="bashlet", timeout=1)

        bashlet = Bashlet()
        with pytest.raises(TimeoutError) as exc_info:
            bashlet.exec("sleep 1000", timeout=1)

        assert exc_info.value.timeout_seconds == 1

    @patch("subprocess.run")
    def test_exec_binary_not_found(self, mock_run: MagicMock) -> None:
        mock_run.side_effect = FileNotFoundError()

        bashlet = Bashlet()
        with pytest.raises(BinaryNotFoundError) as exc_info:
            bashlet.exec("echo hello")

        assert exc_info.value.binary_path == "bashlet"

    @patch("subprocess.run")
    def test_exec_json_error_response(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"error": "Something went wrong"}),
            stderr="",
            returncode=1,
        )

        bashlet = Bashlet()
        with pytest.raises(BashletError) as exc_info:
            bashlet.exec("bad command")

        assert "Something went wrong" in str(exc_info.value)

    @patch("subprocess.run")
    def test_exec_non_json_output(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout="plain text output",
            stderr="some error",
            returncode=0,
        )

        bashlet = Bashlet()
        result = bashlet.exec("echo test")

        assert result.stdout == "plain text output"
        assert result.stderr == "some error"
        assert result.exit_code == 0

    @patch("subprocess.run")
    def test_exec_non_zero_exit_code(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"stdout": "", "stderr": "error", "exit_code": 1}),
            stderr="",
            returncode=1,
        )

        bashlet = Bashlet()
        result = bashlet.exec("false")

        assert result.exit_code == 1
        assert result.stderr == "error"
        assert result.success is False


class TestBashletSession:
    """Tests for Bashlet session management."""

    @patch("subprocess.run")
    def test_create_session(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({
                "stdout": json.dumps({"id": "abc123", "name": "my-session"}),
                "stderr": "",
                "exit_code": 0,
            }),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        session_id = bashlet.create_session(name="my-session")

        assert session_id == "my-session"
        call_args = mock_run.call_args[0][0]
        assert "create" in call_args
        assert "--name" in call_args
        assert "my-session" in call_args

    @patch("subprocess.run")
    def test_create_session_returns_id_when_no_name(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({
                "stdout": json.dumps({"id": "generated-id-123"}),
                "stderr": "",
                "exit_code": 0,
            }),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        session_id = bashlet.create_session()

        assert session_id == "generated-id-123"

    @patch("subprocess.run")
    def test_create_session_with_all_options(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({
                "stdout": json.dumps({"id": "abc", "name": "test"}),
                "stderr": "",
                "exit_code": 0,
            }),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        bashlet.create_session(
            name="test",
            preset="default",
            mounts=[Mount("/host", "/guest", readonly=True)],
            env_vars=[("FOO", "bar")],
            workdir="/workspace",
            ttl="1h",
        )

        call_args = mock_run.call_args[0][0]
        assert "--name" in call_args
        assert "test" in call_args
        assert "--preset" in call_args
        assert "--mount" in call_args
        assert "--env" in call_args
        assert "--workdir" in call_args
        assert "--ttl" in call_args
        assert "1h" in call_args

    @patch("subprocess.run")
    def test_run_in_session(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"stdout": "output", "stderr": "", "exit_code": 0}),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        result = bashlet.run_in_session("my-session", "ls -la")

        assert result.stdout == "output"
        call_args = mock_run.call_args[0][0]
        assert "run" in call_args
        assert "my-session" in call_args
        assert "ls -la" in call_args

    @patch("subprocess.run")
    def test_run_in_session_create_if_missing(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"stdout": "", "stderr": "", "exit_code": 0}),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        bashlet.run_in_session("new-session", "echo hi", create_if_missing=True)

        call_args = mock_run.call_args[0][0]
        assert "-C" in call_args

    @patch("subprocess.run")
    def test_run_in_session_with_preset(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"stdout": "", "stderr": "", "exit_code": 0}),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        bashlet.run_in_session("my-session", "npm test", preset="node")

        call_args = mock_run.call_args[0][0]
        assert "--preset" in call_args
        assert "node" in call_args

    @patch("subprocess.run")
    def test_terminate(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout="",
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        bashlet.terminate("my-session")

        call_args = mock_run.call_args[0][0]
        assert "terminate" in call_args
        assert "my-session" in call_args

    @patch("subprocess.run")
    def test_list_sessions(self, mock_run: MagicMock) -> None:
        session_data = [{
            "id": "session-1",
            "name": "my-session",
            "created_at": 1704067200,
            "last_activity": 1704067300,
            "ttl_seconds": 3600,
            "expired": False,
            "mounts": [{"host_path": "/host", "guest_path": "/guest", "readonly": False}],
            "workdir": "/workspace",
        }]
        mock_run.return_value = MagicMock(
            stdout=json.dumps({
                "stdout": json.dumps(session_data),
                "stderr": "",
                "exit_code": 0,
            }),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        sessions = bashlet.list_sessions()

        assert len(sessions) == 1
        assert sessions[0].id == "session-1"
        assert sessions[0].name == "my-session"
        assert sessions[0].created_at == 1704067200
        assert sessions[0].mounts[0].host_path == "/host"

    @patch("subprocess.run")
    def test_list_sessions_empty(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({
                "stdout": json.dumps([]),
                "stderr": "",
                "exit_code": 0,
            }),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        sessions = bashlet.list_sessions()

        assert sessions == []

    @patch("subprocess.run")
    def test_list_sessions_parse_error(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout="invalid json",
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        sessions = bashlet.list_sessions()

        assert sessions == []


class TestBashletFileOperations:
    """Tests for Bashlet file operations."""

    @patch("subprocess.run")
    def test_read_file(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({
                "stdout": "file content here",
                "stderr": "",
                "exit_code": 0,
            }),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        content = bashlet.read_file("/path/to/file.txt")

        assert content == "file content here"

    @patch("subprocess.run")
    def test_read_file_not_found(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({
                "stdout": "",
                "stderr": "cat: /missing: No such file or directory",
                "exit_code": 1,
            }),
            stderr="",
            returncode=1,
        )

        bashlet = Bashlet()
        with pytest.raises(CommandExecutionError) as exc_info:
            bashlet.read_file("/missing")

        assert exc_info.value.exit_code == 1

    @patch("subprocess.run")
    def test_write_file(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"stdout": "", "stderr": "", "exit_code": 0}),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        bashlet.write_file("/path/to/file.txt", "new content")

        call_args = mock_run.call_args[0][0]
        # Should use base64 encoding
        assert "base64" in " ".join(call_args)

    @patch("subprocess.run")
    def test_write_file_failure(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({
                "stdout": "",
                "stderr": "Permission denied",
                "exit_code": 1,
            }),
            stderr="",
            returncode=1,
        )

        bashlet = Bashlet()
        with pytest.raises(CommandExecutionError):
            bashlet.write_file("/readonly/file", "content")

    @patch("subprocess.run")
    def test_list_dir(self, mock_run: MagicMock) -> None:
        listing = """total 4
drwxr-xr-x  2 user user 4096 Jan  1 00:00 .
drwxr-xr-x  3 user user 4096 Jan  1 00:00 ..
-rw-r--r--  1 user user  100 Jan  1 00:00 file.txt"""

        mock_run.return_value = MagicMock(
            stdout=json.dumps({"stdout": listing, "stderr": "", "exit_code": 0}),
            stderr="",
            returncode=0,
        )

        bashlet = Bashlet()
        result = bashlet.list_dir("/workspace")

        assert result == listing

    @patch("subprocess.run")
    def test_list_dir_not_found(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({
                "stdout": "",
                "stderr": "ls: cannot access '/missing': No such file or directory",
                "exit_code": 2,
            }),
            stderr="",
            returncode=2,
        )

        bashlet = Bashlet()
        with pytest.raises(CommandExecutionError) as exc_info:
            bashlet.list_dir("/missing")

        assert exc_info.value.exit_code == 2


class TestBashletToolGenerators:
    """Tests for Bashlet tool generator methods."""

    def test_has_to_langchain_tools(self) -> None:
        bashlet = Bashlet()
        assert hasattr(bashlet, "to_langchain_tools")
        assert callable(bashlet.to_langchain_tools)

    def test_has_to_openai_tools(self) -> None:
        bashlet = Bashlet()
        assert hasattr(bashlet, "to_openai_tools")
        assert callable(bashlet.to_openai_tools)

    def test_has_to_anthropic_tools(self) -> None:
        bashlet = Bashlet()
        assert hasattr(bashlet, "to_anthropic_tools")
        assert callable(bashlet.to_anthropic_tools)

    def test_has_to_mcp_tools(self) -> None:
        bashlet = Bashlet()
        assert hasattr(bashlet, "to_mcp_tools")
        assert callable(bashlet.to_mcp_tools)

    def test_has_to_generic_tools(self) -> None:
        bashlet = Bashlet()
        assert hasattr(bashlet, "to_generic_tools")
        assert callable(bashlet.to_generic_tools)
