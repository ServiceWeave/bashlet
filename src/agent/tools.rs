use serde_json::json;

use crate::providers::Tool;

pub struct ToolExecutionResult {
    pub output: String,
    pub is_error: bool,
}

pub fn get_tool_definitions() -> Vec<Tool> {
    vec![
        Tool {
            name: "execute_command".to_string(),
            description: "Execute a shell command in the sandboxed environment. \
                Use this to run programs, scripts, and system commands. \
                The sandbox runs a bash shell."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to execute"
                    }
                },
                "required": ["command"]
            }),
        },
        Tool {
            name: "read_file".to_string(),
            description: "Read the contents of a file in the sandbox filesystem.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The absolute path to the file to read"
                    }
                },
                "required": ["path"]
            }),
        },
        Tool {
            name: "write_file".to_string(),
            description: "Write content to a file in the sandbox filesystem. \
                Creates the file if it doesn't exist, overwrites if it does."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The absolute path to the file to write"
                    },
                    "content": {
                        "type": "string",
                        "description": "The content to write to the file"
                    }
                },
                "required": ["path", "content"]
            }),
        },
        Tool {
            name: "list_directory".to_string(),
            description: "List contents of a directory in the sandbox with details.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The directory path to list (defaults to current directory)"
                    }
                },
                "required": []
            }),
        },
    ]
}
