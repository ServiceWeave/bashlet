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

// src/tools/openai.ts
function generateOpenAITools(client) {
  return [
    {
      type: "function",
      function: {
        name: "bashlet_exec",
        description: "Execute a shell command in a sandboxed bash environment. Returns stdout, stderr, and exit code. Use this for running shell commands, scripts, and system operations safely.",
        parameters: execJsonSchema
      },
      handler: async (args) => {
        const { command, workdir } = args;
        const result = await client.exec(command, { workdir });
        return JSON.stringify({
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        });
      }
    },
    {
      type: "function",
      function: {
        name: "bashlet_read_file",
        description: "Read the contents of a file from the sandboxed environment. Returns the file content as a string.",
        parameters: readFileJsonSchema
      },
      handler: async (args) => {
        const { path } = args;
        return await client.readFile(path);
      }
    },
    {
      type: "function",
      function: {
        name: "bashlet_write_file",
        description: "Write content to a file in the sandboxed environment. Creates the file if it doesn't exist, overwrites if it does.",
        parameters: writeFileJsonSchema
      },
      handler: async (args) => {
        const { path, content } = args;
        await client.writeFile(path, content);
        return JSON.stringify({ success: true, path });
      }
    },
    {
      type: "function",
      function: {
        name: "bashlet_list_dir",
        description: "List the contents of a directory in the sandboxed environment. Returns a detailed listing with file permissions, sizes, and names.",
        parameters: listDirJsonSchema
      },
      handler: async (args) => {
        const { path } = args;
        return await client.listDir(path);
      }
    }
  ];
}
function getOpenAIToolDefinitions(client) {
  return generateOpenAITools(client).map(({ type, function: fn }) => ({
    type,
    function: fn
  }));
}
function createOpenAIToolHandler(client) {
  const tools = generateOpenAITools(client);
  const handlerMap = new Map(tools.map((t) => [t.function.name, t.handler]));
  return async (name, args) => {
    const handler = handlerMap.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return handler(args);
  };
}

exports.createOpenAIToolHandler = createOpenAIToolHandler;
exports.generateOpenAITools = generateOpenAITools;
exports.getOpenAIToolDefinitions = getOpenAIToolDefinitions;
//# sourceMappingURL=openai.cjs.map
//# sourceMappingURL=openai.cjs.map