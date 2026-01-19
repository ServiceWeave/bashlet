"""
Bashlet Python SDK - Sandboxed bash execution for AI agents.

This SDK provides Python bindings for bashlet, allowing you to:
- Execute shell commands in isolated sandboxes
- Manage persistent sessions
- Perform file operations
- Generate tools for AI agent frameworks (LangChain, OpenAI, Anthropic, MCP)

Basic usage:
    >>> from bashlet import Bashlet
    >>> bashlet = Bashlet()
    >>> result = bashlet.exec("echo hello")
    >>> print(result.stdout)  # "hello\\n"

Async usage:
    >>> from bashlet import AsyncBashlet
    >>> bashlet = AsyncBashlet()
    >>> result = await bashlet.exec("echo hello")

With AI frameworks:
    >>> tools = bashlet.to_langchain_tools()
    >>> tools = bashlet.to_openai_tools()
    >>> tools = bashlet.to_anthropic_tools()
"""

from .async_client import AsyncBashlet
from .client import Bashlet
from .errors import (
    BashletError,
    BinaryNotFoundError,
    CommandExecutionError,
    ConfigurationError,
    SessionError,
    TimeoutError,
)
from .types import (
    BackendType,
    BashletOptions,
    CommandResult,
    CreateSessionOptions,
    DockerOptions,
    EnvVar,
    ExecOptions,
    Mount,
    Session,
    SessionMount,
)

__version__ = "0.1.0"

__all__ = [
    # Clients
    "Bashlet",
    "AsyncBashlet",
    # Types
    "BackendType",
    "BashletOptions",
    "CreateSessionOptions",
    "DockerOptions",
    "ExecOptions",
    "CommandResult",
    "Session",
    "SessionMount",
    "Mount",
    "EnvVar",
    # Errors
    "BashletError",
    "CommandExecutionError",
    "SessionError",
    "ConfigurationError",
    "BinaryNotFoundError",
    "TimeoutError",
]

# Conditionally export schemas
try:
    from .schemas import (
        EXEC_JSON_SCHEMA,
        LIST_DIR_JSON_SCHEMA,
        READ_FILE_JSON_SCHEMA,
        WRITE_FILE_JSON_SCHEMA,
    )

    __all__.extend([
        "EXEC_JSON_SCHEMA",
        "READ_FILE_JSON_SCHEMA",
        "WRITE_FILE_JSON_SCHEMA",
        "LIST_DIR_JSON_SCHEMA",
    ])
except ImportError:
    pass

# Conditionally export tool generators
try:
    from .tools import GenericTool, create_async_generic_tools, create_generic_tools

    __all__.extend([
        "GenericTool",
        "create_generic_tools",
        "create_async_generic_tools",
    ])
except ImportError:
    pass
