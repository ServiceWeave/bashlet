"""Tests for error classes."""

import pytest

from bashlet.errors import (
    BashletError,
    BinaryNotFoundError,
    CommandExecutionError,
    ConfigurationError,
    SessionError,
    TimeoutError,
)


class TestBashletError:
    """Tests for BashletError base class."""

    def test_create_with_message(self) -> None:
        error = BashletError("Test error message")
        assert str(error) == "Test error message"
        assert error.cause is None

    def test_create_with_cause(self) -> None:
        cause = ValueError("Original error")
        error = BashletError("Wrapped error", cause)
        assert str(error) == "Wrapped error"
        assert error.cause is cause

    def test_is_exception(self) -> None:
        error = BashletError("Test")
        assert isinstance(error, Exception)


class TestCommandExecutionError:
    """Tests for CommandExecutionError."""

    def test_create_with_exit_code_and_stderr(self) -> None:
        error = CommandExecutionError("Command failed", 1, "error output")
        assert str(error) == "Command failed"
        assert error.exit_code == 1
        assert error.stderr == "error output"

    def test_inherits_from_bashlet_error(self) -> None:
        error = CommandExecutionError("Failed", 1, "")
        assert isinstance(error, BashletError)

    def test_zero_exit_code(self) -> None:
        error = CommandExecutionError("Unexpected failure", 0, "")
        assert error.exit_code == 0

    def test_large_exit_code(self) -> None:
        error = CommandExecutionError("Signal killed", 137, "killed")
        assert error.exit_code == 137


class TestSessionError:
    """Tests for SessionError."""

    def test_create_with_session_id(self) -> None:
        error = SessionError("Session failed", "session-123")
        assert str(error) == "Session failed"
        assert error.session_id == "session-123"

    def test_create_without_session_id(self) -> None:
        error = SessionError("Session operation failed")
        assert str(error) == "Session operation failed"
        assert error.session_id is None

    def test_inherits_from_bashlet_error(self) -> None:
        error = SessionError("Failed")
        assert isinstance(error, BashletError)


class TestConfigurationError:
    """Tests for ConfigurationError."""

    def test_create(self) -> None:
        error = ConfigurationError("Invalid configuration")
        assert str(error) == "Invalid configuration"

    def test_inherits_from_bashlet_error(self) -> None:
        error = ConfigurationError("Invalid")
        assert isinstance(error, BashletError)


class TestBinaryNotFoundError:
    """Tests for BinaryNotFoundError."""

    def test_create_with_path(self) -> None:
        error = BinaryNotFoundError("/usr/local/bin/bashlet")
        assert "/usr/local/bin/bashlet" in str(error)
        assert error.binary_path == "/usr/local/bin/bashlet"

    def test_message_contains_helpful_info(self) -> None:
        error = BinaryNotFoundError("bashlet")
        message = str(error)
        assert "bashlet" in message
        assert "PATH" in message
        assert "binary_path" in message

    def test_inherits_from_bashlet_error(self) -> None:
        error = BinaryNotFoundError("bashlet")
        assert isinstance(error, BashletError)


class TestTimeoutError:
    """Tests for TimeoutError."""

    def test_create(self) -> None:
        error = TimeoutError("echo hello", 30)
        assert "30 seconds" in str(error)
        assert "echo hello" in str(error)
        assert error.command == "echo hello"
        assert error.timeout_seconds == 30

    def test_truncates_long_commands(self) -> None:
        long_command = "x" * 200
        error = TimeoutError(long_command, 60)
        assert "..." in str(error)
        # The message should be shorter than the original command
        assert len(str(error)) < len(long_command) + 100

    def test_does_not_truncate_short_commands(self) -> None:
        short_command = "ls -la"
        error = TimeoutError(short_command, 10)
        assert "..." not in str(error)
        assert short_command in str(error)

    def test_inherits_from_bashlet_error(self) -> None:
        error = TimeoutError("cmd", 10)
        assert isinstance(error, BashletError)
