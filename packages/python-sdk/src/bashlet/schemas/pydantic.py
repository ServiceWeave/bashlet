"""Pydantic model definitions for bashlet tools.

Requires: pip install bashlet[pydantic]
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ExecInput(BaseModel):
    """Input schema for bashlet_exec tool."""

    command: str = Field(
        description="The shell command to execute in the sandbox"
    )
    workdir: str | None = Field(
        default=None,
        description="Working directory inside the sandbox (default: /workspace)",
    )


class ReadFileInput(BaseModel):
    """Input schema for bashlet_read_file tool."""

    path: str = Field(
        description="Absolute path to the file inside the sandbox"
    )


class WriteFileInput(BaseModel):
    """Input schema for bashlet_write_file tool."""

    path: str = Field(
        description="Absolute path to the file inside the sandbox"
    )
    content: str = Field(
        description="Content to write to the file"
    )


class ListDirInput(BaseModel):
    """Input schema for bashlet_list_dir tool."""

    path: str = Field(
        description="Absolute path to the directory inside the sandbox"
    )


class ExecOutput(BaseModel):
    """Output schema for bashlet_exec tool."""

    stdout: str = Field(description="Standard output from the command")
    stderr: str = Field(description="Standard error from the command")
    exit_code: int = Field(description="Exit code of the command")


class WriteFileOutput(BaseModel):
    """Output schema for bashlet_write_file tool."""

    success: bool = Field(description="Whether the write operation succeeded")
    path: str = Field(description="Path to the file that was written")
