"""Tests for type definitions and data classes."""

import pytest

from bashlet.types import (
    BashletOptions,
    CommandResult,
    CreateSessionOptions,
    EnvVar,
    ExecOptions,
    Mount,
    Session,
    SessionMount,
)


class TestMount:
    """Tests for Mount dataclass."""

    def test_create_basic(self) -> None:
        mount = Mount(host_path="/host", guest_path="/guest")
        assert mount.host_path == "/host"
        assert mount.guest_path == "/guest"
        assert mount.readonly is False

    def test_create_readonly(self) -> None:
        mount = Mount(host_path="/host", guest_path="/guest", readonly=True)
        assert mount.readonly is True

    def test_to_cli_arg_basic(self) -> None:
        mount = Mount(host_path="/host", guest_path="/guest")
        assert mount.to_cli_arg() == "/host:/guest"

    def test_to_cli_arg_readonly(self) -> None:
        mount = Mount(host_path="/host", guest_path="/guest", readonly=True)
        assert mount.to_cli_arg() == "/host:/guest:ro"

    def test_from_dict_basic(self) -> None:
        mount = Mount.from_dict({"host_path": "/host", "guest_path": "/guest"})
        assert mount.host_path == "/host"
        assert mount.guest_path == "/guest"
        assert mount.readonly is False

    def test_from_dict_readonly(self) -> None:
        mount = Mount.from_dict({
            "host_path": "/host",
            "guest_path": "/guest",
            "readonly": True,
        })
        assert mount.readonly is True


class TestEnvVar:
    """Tests for EnvVar dataclass."""

    def test_create(self) -> None:
        env = EnvVar(key="FOO", value="bar")
        assert env.key == "FOO"
        assert env.value == "bar"

    def test_to_cli_arg(self) -> None:
        env = EnvVar(key="FOO", value="bar")
        assert env.to_cli_arg() == "FOO=bar"

    def test_to_cli_arg_with_special_characters(self) -> None:
        env = EnvVar(key="PATH", value="/usr/bin:/usr/local/bin")
        assert env.to_cli_arg() == "PATH=/usr/bin:/usr/local/bin"

    def test_to_cli_arg_empty_value(self) -> None:
        env = EnvVar(key="EMPTY", value="")
        assert env.to_cli_arg() == "EMPTY="


class TestBashletOptions:
    """Tests for BashletOptions dataclass."""

    def test_default_values(self) -> None:
        options = BashletOptions()
        assert options.binary_path == "bashlet"
        assert options.preset is None
        assert options.mounts == []
        assert options.env_vars == []
        assert options.workdir is None
        assert options.timeout == 300
        assert options.config_path is None

    def test_custom_values(self) -> None:
        mounts = [Mount("/host", "/guest")]
        env_vars = [EnvVar("FOO", "bar")]
        options = BashletOptions(
            binary_path="/custom/bashlet",
            preset="node",
            mounts=mounts,
            env_vars=env_vars,
            workdir="/workspace",
            timeout=60,
            config_path="/config.yaml",
        )
        assert options.binary_path == "/custom/bashlet"
        assert options.preset == "node"
        assert options.mounts == mounts
        assert options.env_vars == env_vars
        assert options.workdir == "/workspace"
        assert options.timeout == 60
        assert options.config_path == "/config.yaml"


class TestCreateSessionOptions:
    """Tests for CreateSessionOptions dataclass."""

    def test_default_values(self) -> None:
        options = CreateSessionOptions()
        assert options.name is None
        assert options.preset is None
        assert options.mounts == []
        assert options.env_vars == []
        assert options.workdir is None
        assert options.ttl is None

    def test_custom_values(self) -> None:
        options = CreateSessionOptions(
            name="my-session",
            preset="default",
            ttl="1h",
            workdir="/workspace",
        )
        assert options.name == "my-session"
        assert options.preset == "default"
        assert options.ttl == "1h"
        assert options.workdir == "/workspace"


class TestExecOptions:
    """Tests for ExecOptions dataclass."""

    def test_default_values(self) -> None:
        options = ExecOptions()
        assert options.preset is None
        assert options.mounts == []
        assert options.env_vars == []
        assert options.workdir is None
        assert options.timeout is None

    def test_custom_values(self) -> None:
        mounts = [Mount("/host", "/guest")]
        options = ExecOptions(
            preset="node",
            mounts=mounts,
            workdir="/workspace",
            timeout=60,
        )
        assert options.preset == "node"
        assert options.mounts == mounts
        assert options.workdir == "/workspace"
        assert options.timeout == 60


class TestCommandResult:
    """Tests for CommandResult dataclass."""

    def test_create(self) -> None:
        result = CommandResult(stdout="output", stderr="", exit_code=0)
        assert result.stdout == "output"
        assert result.stderr == ""
        assert result.exit_code == 0

    def test_success_property_true(self) -> None:
        result = CommandResult(stdout="", stderr="", exit_code=0)
        assert result.success is True

    def test_success_property_false(self) -> None:
        result = CommandResult(stdout="", stderr="error", exit_code=1)
        assert result.success is False

    def test_success_property_with_various_exit_codes(self) -> None:
        assert CommandResult("", "", 0).success is True
        assert CommandResult("", "", 1).success is False
        assert CommandResult("", "", 127).success is False
        assert CommandResult("", "", 137).success is False
        assert CommandResult("", "", -1).success is False


class TestSessionMount:
    """Tests for SessionMount dataclass."""

    def test_create(self) -> None:
        mount = SessionMount(
            host_path="/host",
            guest_path="/guest",
            readonly=True,
        )
        assert mount.host_path == "/host"
        assert mount.guest_path == "/guest"
        assert mount.readonly is True


class TestSession:
    """Tests for Session dataclass."""

    def test_create(self) -> None:
        mounts = [SessionMount("/host", "/guest", False)]
        session = Session(
            id="session-123",
            name="my-session",
            created_at=1704067200,
            last_activity=1704067300,
            ttl_seconds=3600,
            expired=False,
            mounts=mounts,
            workdir="/workspace",
        )
        assert session.id == "session-123"
        assert session.name == "my-session"
        assert session.created_at == 1704067200
        assert session.last_activity == 1704067300
        assert session.ttl_seconds == 3600
        assert session.expired is False
        assert session.mounts == mounts
        assert session.workdir == "/workspace"

    def test_create_without_name(self) -> None:
        session = Session(
            id="session-123",
            name=None,
            created_at=1704067200,
            last_activity=1704067300,
            ttl_seconds=None,
            expired=False,
            mounts=[],
            workdir="/",
        )
        assert session.name is None
        assert session.ttl_seconds is None
