'use strict';

// src/schemas/json-schema.ts
var execJsonSchema = {
  type: "object",
  properties: {
    command: {
      type: "string",
      description: "The shell command to execute in the sandbox"
    },
    workdir: {
      type: "string",
      description: "Working directory inside the sandbox (default: /workspace)"
    }
  },
  required: ["command"],
  additionalProperties: false
};
var readFileJsonSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Absolute path to the file inside the sandbox"
    }
  },
  required: ["path"],
  additionalProperties: false
};
var writeFileJsonSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Absolute path to the file inside the sandbox"
    },
    content: {
      type: "string",
      description: "Content to write to the file"
    }
  },
  required: ["path", "content"],
  additionalProperties: false
};
var listDirJsonSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Absolute path to the directory inside the sandbox"
    }
  },
  required: ["path"],
  additionalProperties: false
};

// src/tools/mcp.ts
function generateMCPTools(client) {
  return [
    {
      definition: {
        name: "bashlet_exec",
        description: "Execute a shell command in a sandboxed bash environment. Returns stdout, stderr, and exit code. Use this for running shell commands, scripts, and system operations safely.",
        inputSchema: execJsonSchema
      },
      handler: async (args) => {
        const { command, workdir } = args;
        try {
          const result = await client.exec(command, { workdir });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode
                  },
                  null,
                  2
                )
              }
            ]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: String(error) }],
            isError: true
          };
        }
      }
    },
    {
      definition: {
        name: "bashlet_read_file",
        description: "Read the contents of a file from the sandboxed environment. Returns the file content as a string.",
        inputSchema: readFileJsonSchema
      },
      handler: async (args) => {
        const { path } = args;
        try {
          const content = await client.readFile(path);
          return { content: [{ type: "text", text: content }] };
        } catch (error) {
          return {
            content: [{ type: "text", text: String(error) }],
            isError: true
          };
        }
      }
    },
    {
      definition: {
        name: "bashlet_write_file",
        description: "Write content to a file in the sandboxed environment. Creates the file if it doesn't exist, overwrites if it does.",
        inputSchema: writeFileJsonSchema
      },
      handler: async (args) => {
        const { path, content } = args;
        try {
          await client.writeFile(path, content);
          return {
            content: [{ type: "text", text: `Successfully wrote to ${path}` }]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: String(error) }],
            isError: true
          };
        }
      }
    },
    {
      definition: {
        name: "bashlet_list_dir",
        description: "List the contents of a directory in the sandboxed environment. Returns a detailed listing with file permissions, sizes, and names.",
        inputSchema: listDirJsonSchema
      },
      handler: async (args) => {
        const { path } = args;
        try {
          const listing = await client.listDir(path);
          return { content: [{ type: "text", text: listing }] };
        } catch (error) {
          return {
            content: [{ type: "text", text: String(error) }],
            isError: true
          };
        }
      }
    }
  ];
}
function createMCPServer(client) {
  const toolHandlers = generateMCPTools(client);
  return {
    tools: toolHandlers.map((t) => t.definition),
    handleToolCall: async (name, args) => {
      const tool = toolHandlers.find((t) => t.definition.name === name);
      if (!tool) {
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true
        };
      }
      return tool.handler(args);
    }
  };
}

exports.createMCPServer = createMCPServer;
exports.generateMCPTools = generateMCPTools;
//# sourceMappingURL=mcp.cjs.map
//# sourceMappingURL=mcp.cjs.map