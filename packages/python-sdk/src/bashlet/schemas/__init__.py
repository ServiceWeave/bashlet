"""Schema definitions for bashlet tools."""

from .json_schema import (
    EXEC_JSON_SCHEMA,
    LIST_DIR_JSON_SCHEMA,
    READ_FILE_JSON_SCHEMA,
    WRITE_FILE_JSON_SCHEMA,
)

__all__ = [
    "EXEC_JSON_SCHEMA",
    "READ_FILE_JSON_SCHEMA",
    "WRITE_FILE_JSON_SCHEMA",
    "LIST_DIR_JSON_SCHEMA",
]

# Conditionally export Pydantic models if available
try:
    from .pydantic import (
        ExecInput,
        ListDirInput,
        ReadFileInput,
        WriteFileInput,
    )

    __all__.extend([
        "ExecInput",
        "ReadFileInput",
        "WriteFileInput",
        "ListDirInput",
    ])
except ImportError:
    pass
