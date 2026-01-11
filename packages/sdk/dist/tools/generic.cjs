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

// src/tools/generic.ts
function generateGenericTools(client) {
  return [
    {
      name: "bashlet_exec",
      description: "Execute a shell command in a sandboxed bash environment. Returns stdout, stderr, and exit code. Use this for running shell commands, scripts, and system operations safely.",
      parameters: execJsonSchema,
      execute: async (args) => {
        const { command, workdir } = args;
        const result = await client.exec(command, { workdir });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        };
      }
    },
    {
      name: "bashlet_read_file",
      description: "Read the contents of a file from the sandboxed environment. Returns the file content as a string.",
      parameters: readFileJsonSchema,
      execute: async (args) => {
        const { path } = args;
        return await client.readFile(path);
      }
    },
    {
      name: "bashlet_write_file",
      description: "Write content to a file in the sandboxed environment. Creates the file if it doesn't exist, overwrites if it does.",
      parameters: writeFileJsonSchema,
      execute: async (args) => {
        const { path, content } = args;
        await client.writeFile(path, content);
        return { success: true, path };
      }
    },
    {
      name: "bashlet_list_dir",
      description: "List the contents of a directory in the sandboxed environment. Returns a detailed listing with file permissions, sizes, and names.",
      parameters: listDirJsonSchema,
      execute: async (args) => {
        const { path } = args;
        return await client.listDir(path);
      }
    }
  ];
}
function createToolRegistry(client) {
  const tools = generateGenericTools(client);
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  return {
    /** Get all tools as an array */
    all: () => tools,
    /** Get a tool by name */
    get: (name) => toolMap.get(name),
    /** Check if a tool exists */
    has: (name) => toolMap.has(name),
    /** Execute a tool by name */
    execute: async (name, args) => {
      const tool = toolMap.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }
      return tool.execute(args);
    },
    /** Get tool names */
    names: () => Array.from(toolMap.keys())
  };
}

exports.createToolRegistry = createToolRegistry;
exports.generateGenericTools = generateGenericTools;
//# sourceMappingURL=generic.cjs.map
//# sourceMappingURL=generic.cjs.map