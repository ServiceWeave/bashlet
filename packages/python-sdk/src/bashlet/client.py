"""Synchronous Bashlet client for sandboxed bash execution."""

from __future__ import annotations

import base64
import json
import shlex
import subprocess
from typing import TYPE_CHECKING, Any

from .errors import (
    BashletError,
    BinaryNotFoundError,
    CommandExecutionError,
    TimeoutError,
)
from .types import (
    BackendType,
    BashletOptions,
    CommandResult,
    CreateSessionOptions,
    ExecOptions,
    Mount,
    Session,
    SessionMount,
)

if TYPE_CHECKING:
    from .tools.anthropic import AnthropicToolHandler
    from .tools.generic import GenericTool
    from .tools.langchain import BashletLangChainTools
    from .tools.mcp import MCPToolHandler
    from .tools.openai import OpenAIToolHandler


class Bashlet:
    """
    Synchronous Bashlet client for sandboxed bash execution.

    Provides methods for:
    - One-shot command execution
    - Session management (create, run, terminate)
    - File operations (read, write, list)
    - Tool generation for AI agent frameworks

    Example:
        >>> bashlet = Bashlet(
        ...     mounts=[Mount("./src", "/workspace")],
        ... )
        >>> result = bashlet.exec("ls -la /workspace")
        >>> print(result.stdout)
    """

    def __init__(
        self,
        binary_path: str = "bashlet",
        preset: str | None = None,
        mounts: list[Mount | dict[str, Any]] | None = None,
        env_vars: list[tuple[str, str]] | None = None,
        workdir: str | None = None,
        timeout: int = 300,
        config_path: str | None = None,
        backend: BackendType | str | None = None,
    ) -> None:
        """
        Initialize a Bashlet client.

        Args:
            binary_path: Path to bashlet binary (default: 'bashlet' in PATH)
            preset: Default preset to apply
            mounts: Default mounts (list of Mount objects or dicts)
            env_vars: Default environment variables as (key, value) tuples
            workdir: Default working directory inside sandbox
            timeout: Command timeout in seconds (default: 300)
            config_path: Path to config file
            backend: Sandbox backend to use (wasmer, firecracker, docker, auto)
        """
        from .types import EnvVar

        # Convert string backend to BackendType enum
        backend_type: BackendType | None = None
        if backend is not None:
            if isinstance(backend, str):
                backend_type = BackendType(backend)
            else:
                backend_type = backend

        self._options = BashletOptions(
            binary_path=binary_path,
            preset=preset,
            mounts=[
                m if isinstance(m, Mount) else Mount.from_dict(m) for m in (mounts or [])
            ],
            env_vars=[EnvVar(k, v) for k, v in (env_vars or [])],
            workdir=workdir,
            timeout=timeout,
            config_path=config_path,
            backend=backend_type,
        )

    # =========================================================================
    # One-Shot Execution
    # =========================================================================

    def exec(
        self,
        command: str,
        *,
        preset: str | None = None,
        mounts: list[Mount | dict[str, Any]] | None = None,
        env_vars: list[tuple[str, str]] | None = None,
        workdir: str | None = None,
        timeout: int | None = None,
        backend: BackendType | str | None = None,
    ) -> CommandResult:
        """
        Execute a one-shot command in an isolated sandbox.

        Args:
            command: Shell command to execute
            preset: Preset configuration to apply
            mounts: Mount specifications
            env_vars: Environment variables as (key, value) tuples
            workdir: Working directory inside sandbox
            timeout: Command timeout in seconds
            backend: Sandbox backend to use (wasmer, firecracker, docker, auto)

        Returns:
            CommandResult with stdout, stderr, and exit code

        Example:
            >>> result = bashlet.exec('echo "Hello World"')
            >>> print(result.stdout)  # "Hello World\\n"
        """
        # Convert string backend to BackendType enum
        backend_type: BackendType | None = None
        if backend is not None:
            if isinstance(backend, str):
                backend_type = BackendType(backend)
            else:
                backend_type = backend

        options = self._merge_options(
            ExecOptions(
                preset=preset,
                mounts=[
                    m if isinstance(m, Mount) else Mount.from_dict(m) for m in (mounts or [])
                ],
                env_vars=[],
                workdir=workdir,
                timeout=timeout,
                backend=backend_type,
            ),
            env_vars,
        )
        args = self._build_exec_args(command, options)
        return self._run_command(["exec", *args], options.timeout)

    # =========================================================================
    # Session Management
    # =========================================================================

    def create_session(
        self,
        name: str | None = None,
        preset: str | None = None,
        mounts: list[Mount | dict[str, Any]] | None = None,
        env_vars: list[tuple[str, str]] | None = None,
        workdir: str | None = None,
        ttl: str | None = None,
    ) -> str:
        """
        Create a new persistent sandbox session.

        Args:
            name: Session name (auto-generated if not provided)
            preset: Preset configuration to apply
            mounts: Mount specifications
            env_vars: Environment variables
            workdir: Working directory
            ttl: Time-to-live (e.g., '5m', '1h', '30s')

        Returns:
            Session ID or name

        Example:
            >>> session_id = bashlet.create_session(
            ...     name="my-session",
            ...     ttl="1h",
            ... )
        """
        from .types import EnvVar

        options = CreateSessionOptions(
            name=name,
            preset=preset,
            mounts=[
                m if isinstance(m, Mount) else Mount.from_dict(m) for m in (mounts or [])
            ],
            env_vars=[EnvVar(k, v) for k, v in (env_vars or [])],
            workdir=workdir,
            ttl=ttl,
        )
        args = self._build_create_args(options)
        result = self._run_command(["create", *args])
        return self._parse_session_create_result(result)

    def run_in_session(
        self,
        session_id: str,
        command: str,
        *,
        create_if_missing: bool = False,
        preset: str | None = None,
    ) -> CommandResult:
        """
        Run a command in an existing session.

        Args:
            session_id: Session ID or name
            command: Command to execute
            create_if_missing: Create the session if it doesn't exist
            preset: Preset to use when creating (requires create_if_missing)

        Returns:
            CommandResult with stdout, stderr, and exit code

        Example:
            >>> result = bashlet.run_in_session("my-session", "npm install")
        """
        args: list[str] = []

        if create_if_missing:
            args.append("-C")

        if preset:
            args.extend(["--preset", preset])

        args.extend([session_id, command])

        return self._run_command(["run", *args])

    def terminate(self, session_id: str) -> None:
        """
        Terminate a session.

        Args:
            session_id: Session ID or name to terminate

        Example:
            >>> bashlet.terminate("my-session")
        """
        self._run_command(["terminate", session_id])

    def list_sessions(self) -> list[Session]:
        """
        List all active sessions.

        Returns:
            List of Session objects

        Example:
            >>> sessions = bashlet.list_sessions()
            >>> for s in sessions:
            ...     print(f"{s.id}: {s.name or 'unnamed'}")
        """
        result = self._run_command(["list"])
        return self._parse_session_list(result)

    # =========================================================================
    # File Operations
    # =========================================================================

    def read_file(
        self,
        path: str,
        *,
        preset: str | None = None,
        mounts: list[Mount | dict[str, Any]] | None = None,
        workdir: str | None = None,
    ) -> str:
        """
        Read a file from the sandbox.

        Args:
            path: Path to the file inside the sandbox
            preset: Preset configuration
            mounts: Mount specifications
            workdir: Working directory

        Returns:
            File contents as string

        Example:
            >>> content = bashlet.read_file("/workspace/package.json")
            >>> pkg = json.loads(content)
        """
        escaped_path = shlex.quote(path)
        result = self.exec(
            f"cat {escaped_path}",
            preset=preset,
            mounts=mounts,
            workdir=workdir,
        )

        if result.exit_code != 0:
            raise CommandExecutionError(
                f"Failed to read file: {path}",
                result.exit_code,
                result.stderr,
            )

        return result.stdout

    def write_file(
        self,
        path: str,
        content: str,
        *,
        preset: str | None = None,
        mounts: list[Mount | dict[str, Any]] | None = None,
        workdir: str | None = None,
    ) -> None:
        """
        Write content to a file in the sandbox.

        Args:
            path: Path to the file inside the sandbox
            content: Content to write
            preset: Preset configuration
            mounts: Mount specifications
            workdir: Working directory

        Example:
            >>> bashlet.write_file("/workspace/output.txt", "Hello World")
        """
        escaped_path = shlex.quote(path)
        # Use base64 encoding to handle special characters safely
        encoded = base64.b64encode(content.encode()).decode()
        command = f"echo '{encoded}' | base64 -d > {escaped_path}"

        result = self.exec(
            command,
            preset=preset,
            mounts=mounts,
            workdir=workdir,
        )

        if result.exit_code != 0:
            raise CommandExecutionError(
                f"Failed to write file: {path}",
                result.exit_code,
                result.stderr,
            )

    def list_dir(
        self,
        path: str,
        *,
        preset: str | None = None,
        mounts: list[Mount | dict[str, Any]] | None = None,
        workdir: str | None = None,
    ) -> str:
        """
        List directory contents.

        Args:
            path: Path to the directory inside the sandbox
            preset: Preset configuration
            mounts: Mount specifications
            workdir: Working directory

        Returns:
            Directory listing as string

        Example:
            >>> listing = bashlet.list_dir("/workspace")
            >>> print(listing)
        """
        escaped_path = shlex.quote(path)
        result = self.exec(
            f"ls -la {escaped_path}",
            preset=preset,
            mounts=mounts,
            workdir=workdir,
        )

        if result.exit_code != 0:
            raise CommandExecutionError(
                f"Failed to list directory: {path}",
                result.exit_code,
                result.stderr,
            )

        return result.stdout

    # =========================================================================
    # Tool Generators
    # =========================================================================

    def to_langchain_tools(self) -> BashletLangChainTools:
        """
        Generate LangChain-compatible tools.

        Returns:
            BashletLangChainTools with exec, read_file, write_file, list_dir tools

        Example:
            >>> from langchain_openai import ChatOpenAI
            >>> llm = ChatOpenAI()
            >>> tools = bashlet.to_langchain_tools()
            >>> llm_with_tools = llm.bind_tools(tools.all())
        """
        from .tools.langchain import create_langchain_tools

        return create_langchain_tools(self)

    def to_openai_tools(self) -> OpenAIToolHandler:
        """
        Generate OpenAI function calling-compatible tools.

        Returns:
            OpenAIToolHandler with tool definitions and handler

        Example:
            >>> handler = bashlet.to_openai_tools()
            >>> response = client.chat.completions.create(
            ...     model="gpt-4-turbo",
            ...     tools=handler.definitions,
            ...     messages=[...],
            ... )
            >>> result = handler.handle(tool_call.function.name, args)
        """
        from .tools.openai import create_openai_tools

        return create_openai_tools(self)

    def to_anthropic_tools(self) -> AnthropicToolHandler:
        """
        Generate Anthropic tool use-compatible tools.

        Returns:
            AnthropicToolHandler with tool definitions and handler

        Example:
            >>> handler = bashlet.to_anthropic_tools()
            >>> response = client.messages.create(
            ...     model="claude-3-opus-20240229",
            ...     tools=handler.definitions,
            ...     messages=[...],
            ... )
            >>> result = handler.handle(tool_use.name, tool_use.input)
        """
        from .tools.anthropic import create_anthropic_tools

        return create_anthropic_tools(self)

    def to_mcp_tools(self) -> MCPToolHandler:
        """
        Generate MCP-compatible tools.

        Returns:
            MCPToolHandler with tool definitions and handler

        Example:
            >>> handler = bashlet.to_mcp_tools()
            >>> # Use with MCP server
        """
        from .tools.mcp import create_mcp_tools

        return create_mcp_tools(self)

    def to_generic_tools(self) -> list[GenericTool]:
        """
        Generate framework-agnostic tool definitions.

        Returns:
            List of GenericTool objects

        Example:
            >>> tools = bashlet.to_generic_tools()
            >>> for tool in tools:
            ...     print(tool.name, tool.description)
        """
        from .tools.generic import create_generic_tools

        return create_generic_tools(self)

    # =========================================================================
    # Private Helpers
    # =========================================================================

    def _merge_options(
        self,
        options: ExecOptions,
        env_vars: list[tuple[str, str]] | None,
    ) -> ExecOptions:
        """Merge provided options with defaults."""
        from .types import EnvVar

        return ExecOptions(
            preset=options.preset or self._options.preset,
            mounts=[*self._options.mounts, *options.mounts],
            env_vars=[
                *self._options.env_vars,
                *options.env_vars,
                *[EnvVar(k, v) for k, v in (env_vars or [])],
            ],
            workdir=options.workdir or self._options.workdir,
            timeout=options.timeout or self._options.timeout,
            backend=options.backend or self._options.backend,
        )

    def _run_command(
        self,
        args: list[str],
        timeout: int | None = None,
    ) -> CommandResult:
        """Run a bashlet CLI command."""
        full_args = [self._options.binary_path, "--format", "json", *args]

        if self._options.config_path:
            full_args.insert(1, "--config")
            full_args.insert(2, self._options.config_path)

        try:
            proc = subprocess.run(
                full_args,
                capture_output=True,
                text=True,
                timeout=timeout or self._options.timeout,
            )

            # Parse JSON output
            try:
                parsed = json.loads(proc.stdout)

                # Check for error in JSON response
                if "error" in parsed:
                    raise BashletError(parsed["error"])

                return CommandResult(
                    stdout=parsed.get("stdout", ""),
                    stderr=parsed.get("stderr", proc.stderr),
                    exit_code=parsed.get("exit_code", proc.returncode),
                )
            except json.JSONDecodeError:
                # If not valid JSON, return raw output
                return CommandResult(
                    stdout=proc.stdout,
                    stderr=proc.stderr,
                    exit_code=proc.returncode,
                )

        except FileNotFoundError:
            raise BinaryNotFoundError(self._options.binary_path)
        except subprocess.TimeoutExpired:
            raise TimeoutError(" ".join(args), timeout or self._options.timeout)
        except Exception as e:
            raise BashletError(f"Failed to execute bashlet: {e}", e)

    def _build_exec_args(self, command: str, options: ExecOptions) -> list[str]:
        """Build CLI arguments for exec command."""
        args: list[str] = []

        if options.preset:
            args.extend(["--preset", options.preset])

        if options.backend:
            args.extend(["--backend", options.backend.value])

        for mount in options.mounts:
            args.extend(["--mount", mount.to_cli_arg()])

        for env in options.env_vars:
            args.extend(["--env", env.to_cli_arg()])

        if options.workdir:
            args.extend(["--workdir", options.workdir])

        args.append(command)
        return args

    def _build_create_args(self, options: CreateSessionOptions) -> list[str]:
        """Build CLI arguments for create command."""
        args: list[str] = []

        if options.name:
            args.extend(["--name", options.name])

        if options.preset:
            args.extend(["--preset", options.preset])

        for mount in options.mounts:
            args.extend(["--mount", mount.to_cli_arg()])

        for env in options.env_vars:
            args.extend(["--env", env.to_cli_arg()])

        if options.workdir:
            args.extend(["--workdir", options.workdir])

        if options.ttl:
            args.extend(["--ttl", options.ttl])

        return args

    def _parse_session_create_result(self, result: CommandResult) -> str:
        """Parse session creation result."""
        try:
            parsed = json.loads(result.stdout)
            return parsed.get("name") or parsed.get("id", result.stdout.strip())
        except json.JSONDecodeError:
            return result.stdout.strip()

    def _parse_session_list(self, result: CommandResult) -> list[Session]:
        """Parse session list result."""
        try:
            items = json.loads(result.stdout)
            return [
                Session(
                    id=item["id"],
                    name=item.get("name"),
                    created_at=item["created_at"],
                    last_activity=item["last_activity"],
                    ttl_seconds=item.get("ttl_seconds"),
                    expired=item["expired"],
                    mounts=[
                        SessionMount(
                            host_path=m["host_path"],
                            guest_path=m["guest_path"],
                            readonly=m["readonly"],
                        )
                        for m in item.get("mounts", [])
                    ],
                    workdir=item["workdir"],
                )
                for item in items
            ]
        except (json.JSONDecodeError, KeyError):
            return []
