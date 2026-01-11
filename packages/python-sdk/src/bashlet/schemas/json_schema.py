"""JSON Schema definitions for bashlet tools."""

from typing import Any

# Type alias for JSON Schema
JsonSchema = dict[str, Any]

EXEC_JSON_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "command": {
            "type": "string",
            "description": "The shell command to execute in the sandbox",
        },
        "workdir": {
            "type": "string",
            "description": "Working directory inside the sandbox (default: /workspace)",
        },
    },
    "required": ["command"],
    "additionalProperties": False,
}

READ_FILE_JSON_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "path": {
            "type": "string",
            "description": "Absolute path to the file inside the sandbox",
        },
    },
    "required": ["path"],
    "additionalProperties": False,
}

WRITE_FILE_JSON_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "path": {
            "type": "string",
            "description": "Absolute path to the file inside the sandbox",
        },
        "content": {
            "type": "string",
            "description": "Content to write to the file",
        },
    },
    "required": ["path", "content"],
    "additionalProperties": False,
}

LIST_DIR_JSON_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "path": {
            "type": "string",
            "description": "Absolute path to the directory inside the sandbox",
        },
    },
    "required": ["path"],
    "additionalProperties": False,
}
