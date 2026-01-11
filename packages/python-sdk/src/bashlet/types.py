"""Type definitions for the bashlet SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TypedDict


class MountDict(TypedDict, total=False):
    """Mount configuration as a dictionary."""

    host_path: str
    guest_path: str
    readonly: bool


@dataclass
class Mount:
    """Mount configuration for sandbox filesystem."""

    host_path: str
    """Path on the host system."""

    guest_path: str
    """Path inside the sandbox."""

    readonly: bool = False
    """Whether the mount is read-only."""

    def to_cli_arg(self) -> str:
        """Convert to CLI argument format."""
        if self.readonly:
            return f"{self.host_path}:{self.guest_path}:ro"
        return f"{self.host_path}:{self.guest_path}"

    @classmethod
    def from_dict(cls, data: MountDict) -> Mount:
        """Create from dictionary."""
        return cls(
            host_path=data["host_path"],
            guest_path=data["guest_path"],
            readonly=data.get("readonly", False),
        )


@dataclass
class EnvVar:
    """Environment variable definition."""

    key: str
    """Variable name."""

    value: str
    """Variable value."""

    def to_cli_arg(self) -> str:
        """Convert to CLI argument format."""
        return f"{self.key}={self.value}"


@dataclass
class BashletOptions:
    """Configuration options for Bashlet client."""

    binary_path: str = "bashlet"
    """Path to bashlet binary."""

    preset: str | None = None
    """Default preset to apply."""

    mounts: list[Mount] = field(default_factory=list)
    """Default mounts."""

    env_vars: list[EnvVar] = field(default_factory=list)
    """Default environment variables."""

    workdir: str | None = None
    """Default working directory inside sandbox."""

    timeout: int = 300
    """Command timeout in seconds."""

    config_path: str | None = None
    """Path to config file."""


@dataclass
class CreateSessionOptions:
    """Options for session creation."""

    name: str | None = None
    """Session name (auto-generated if not provided)."""

    preset: str | None = None
    """Preset configuration to apply."""

    mounts: list[Mount] = field(default_factory=list)
    """Mount specifications."""

    env_vars: list[EnvVar] = field(default_factory=list)
    """Environment variables."""

    workdir: str | None = None
    """Working directory."""

    ttl: str | None = None
    """Time-to-live (e.g., '5m', '1h', '30s')."""


@dataclass
class ExecOptions:
    """Options for command execution."""

    preset: str | None = None
    """Preset configuration to apply."""

    mounts: list[Mount] = field(default_factory=list)
    """Mount specifications."""

    env_vars: list[EnvVar] = field(default_factory=list)
    """Environment variables."""

    workdir: str | None = None
    """Working directory."""

    timeout: int | None = None
    """Command timeout in seconds."""


@dataclass
class CommandResult:
    """Result of command execution."""

    stdout: str
    """Standard output from the command."""

    stderr: str
    """Standard error from the command."""

    exit_code: int
    """Exit code of the command."""

    @property
    def success(self) -> bool:
        """Whether the command succeeded (exit code 0)."""
        return self.exit_code == 0


@dataclass
class SessionMount:
    """Mount information in a session."""

    host_path: str
    guest_path: str
    readonly: bool


@dataclass
class Session:
    """Session information."""

    id: str
    """Unique session ID."""

    name: str | None
    """Optional session name."""

    created_at: int
    """Unix timestamp when the session was created."""

    last_activity: int
    """Unix timestamp of last activity."""

    ttl_seconds: int | None
    """Time-to-live in seconds."""

    expired: bool
    """Whether the session has expired."""

    mounts: list[SessionMount]
    """Mount configurations for this session."""

    workdir: str
    """Working directory for this session."""


# Type aliases for tool operations
ToolOperation = str  # "bashlet_exec" | "bashlet_read_file" | "bashlet_write_file" | "bashlet_list_dir"


class ExecInput(TypedDict):
    """Input for bashlet_exec tool."""

    command: str
    workdir: str | None


class ReadFileInput(TypedDict):
    """Input for bashlet_read_file tool."""

    path: str


class WriteFileInput(TypedDict):
    """Input for bashlet_write_file tool."""

    path: str
    content: str


class ListDirInput(TypedDict):
    """Input for bashlet_list_dir tool."""

    path: str


class ExecOutput(TypedDict):
    """Output for bashlet_exec tool."""

    stdout: str
    stderr: str
    exit_code: int


class WriteFileOutput(TypedDict):
    """Output for bashlet_write_file tool."""

    success: bool
    path: str
