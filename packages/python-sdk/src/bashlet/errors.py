"""Custom exceptions for the bashlet SDK."""

from __future__ import annotations


class BashletError(Exception):
    """Base error class for all bashlet SDK errors."""

    def __init__(self, message: str, cause: Exception | None = None) -> None:
        super().__init__(message)
        self.cause = cause


class CommandExecutionError(BashletError):
    """Error thrown when command execution fails."""

    def __init__(self, message: str, exit_code: int, stderr: str) -> None:
        super().__init__(message)
        self.exit_code = exit_code
        self.stderr = stderr


class SessionError(BashletError):
    """Error thrown when session operations fail."""

    def __init__(self, message: str, session_id: str | None = None) -> None:
        super().__init__(message)
        self.session_id = session_id


class ConfigurationError(BashletError):
    """Error thrown when configuration is invalid."""

    pass


class BinaryNotFoundError(BashletError):
    """Error thrown when the bashlet binary is not found or inaccessible."""

    def __init__(self, binary_path: str) -> None:
        message = (
            f"Bashlet binary not found at '{binary_path}'. "
            "Make sure bashlet is installed and available in your PATH, "
            "or specify the correct path using the 'binary_path' option."
        )
        super().__init__(message)
        self.binary_path = binary_path


class TimeoutError(BashletError):
    """Error thrown when command times out."""

    def __init__(self, command: str, timeout_seconds: int) -> None:
        truncated = command[:100] + "..." if len(command) > 100 else command
        message = f"Command timed out after {timeout_seconds} seconds: {truncated}"
        super().__init__(message)
        self.command = command
        self.timeout_seconds = timeout_seconds
