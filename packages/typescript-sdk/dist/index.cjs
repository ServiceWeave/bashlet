'use strict';

var zod = require('zod');
var execa = require('execa');
var os = require('os');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/schemas/json-schema.ts
exports.execJsonSchema = void 0; exports.readFileJsonSchema = void 0; exports.writeFileJsonSchema = void 0; exports.listDirJsonSchema = void 0;
var init_json_schema = __esm({
  "src/schemas/json-schema.ts"() {
    exports.execJsonSchema = {
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
    exports.readFileJsonSchema = {
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
    exports.writeFileJsonSchema = {
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
    exports.listDirJsonSchema = {
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
  }
});

// src/tools/mcp.ts
var mcp_exports = {};
__export(mcp_exports, {
  createMCPServer: () => createMCPServer,
  generateMCPTools: () => generateMCPTools
});
function generateMCPTools(client) {
  return [
    {
      definition: {
        name: "bashlet_exec",
        description: "Execute a shell command in a sandboxed bash environment. Returns stdout, stderr, and exit code. Use this for running shell commands, scripts, and system operations safely.",
        inputSchema: exports.execJsonSchema
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
        inputSchema: exports.readFileJsonSchema
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
        inputSchema: exports.writeFileJsonSchema
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
        inputSchema: exports.listDirJsonSchema
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
var init_mcp = __esm({
  "src/tools/mcp.ts"() {
    init_json_schema();
  }
});
exports.execSchema = void 0; exports.readFileSchema = void 0; exports.writeFileSchema = void 0; exports.listDirSchema = void 0;
var init_zod = __esm({
  "src/schemas/zod.ts"() {
    exports.execSchema = zod.z.object({
      command: zod.z.string().describe("The shell command to execute in the sandbox"),
      workdir: zod.z.string().optional().describe("Working directory inside the sandbox (default: /workspace)")
    });
    exports.readFileSchema = zod.z.object({
      path: zod.z.string().describe("Absolute path to the file inside the sandbox")
    });
    exports.writeFileSchema = zod.z.object({
      path: zod.z.string().describe("Absolute path to the file inside the sandbox"),
      content: zod.z.string().describe("Content to write to the file")
    });
    exports.listDirSchema = zod.z.object({
      path: zod.z.string().describe("Absolute path to the directory inside the sandbox")
    });
  }
});

// src/tools/vercel.ts
var vercel_exports = {};
__export(vercel_exports, {
  generateVercelTools: () => generateVercelTools
});
function generateVercelTools(client) {
  return {
    bashlet_exec: {
      description: "Execute a shell command in a sandboxed bash environment. Returns stdout, stderr, and exit code. Use this for running shell commands, scripts, and system operations safely.",
      parameters: exports.execSchema,
      execute: async ({ command, workdir }) => {
        const result = await client.exec(command, { workdir });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        };
      }
    },
    bashlet_read_file: {
      description: "Read the contents of a file from the sandboxed environment. Returns the file content as a string.",
      parameters: exports.readFileSchema,
      execute: async ({ path }) => {
        const content = await client.readFile(path);
        return { content };
      }
    },
    bashlet_write_file: {
      description: "Write content to a file in the sandboxed environment. Creates the file if it doesn't exist, overwrites if it does.",
      parameters: exports.writeFileSchema,
      execute: async ({ path, content }) => {
        await client.writeFile(path, content);
        return { success: true, path };
      }
    },
    bashlet_list_dir: {
      description: "List the contents of a directory in the sandboxed environment. Returns a detailed listing with file permissions, sizes, and names.",
      parameters: exports.listDirSchema,
      execute: async ({ path }) => {
        const listing = await client.listDir(path);
        return { listing };
      }
    }
  };
}
var init_vercel = __esm({
  "src/tools/vercel.ts"() {
    init_zod();
  }
});

// src/tools/openai.ts
var openai_exports = {};
__export(openai_exports, {
  createOpenAIToolHandler: () => createOpenAIToolHandler,
  generateOpenAITools: () => generateOpenAITools,
  getOpenAIToolDefinitions: () => getOpenAIToolDefinitions
});
function generateOpenAITools(client) {
  return [
    {
      type: "function",
      function: {
        name: "bashlet_exec",
        description: "Execute a shell command in a sandboxed bash environment. Returns stdout, stderr, and exit code. Use this for running shell commands, scripts, and system operations safely.",
        parameters: exports.execJsonSchema
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
        parameters: exports.readFileJsonSchema
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
        parameters: exports.writeFileJsonSchema
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
        parameters: exports.listDirJsonSchema
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
var init_openai = __esm({
  "src/tools/openai.ts"() {
    init_json_schema();
  }
});

// src/tools/generic.ts
var generic_exports = {};
__export(generic_exports, {
  createToolRegistry: () => createToolRegistry,
  generateGenericTools: () => generateGenericTools
});
function generateGenericTools(client) {
  return [
    {
      name: "bashlet_exec",
      description: "Execute a shell command in a sandboxed bash environment. Returns stdout, stderr, and exit code. Use this for running shell commands, scripts, and system operations safely.",
      parameters: exports.execJsonSchema,
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
      parameters: exports.readFileJsonSchema,
      execute: async (args) => {
        const { path } = args;
        return await client.readFile(path);
      }
    },
    {
      name: "bashlet_write_file",
      description: "Write content to a file in the sandboxed environment. Creates the file if it doesn't exist, overwrites if it does.",
      parameters: exports.writeFileJsonSchema,
      execute: async (args) => {
        const { path, content } = args;
        await client.writeFile(path, content);
        return { success: true, path };
      }
    },
    {
      name: "bashlet_list_dir",
      description: "List the contents of a directory in the sandboxed environment. Returns a detailed listing with file permissions, sizes, and names.",
      parameters: exports.listDirJsonSchema,
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
var init_generic = __esm({
  "src/tools/generic.ts"() {
    init_json_schema();
  }
});

// src/errors.ts
var BashletError = class _BashletError extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.name = "BashletError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, _BashletError);
    }
  }
};
var CommandExecutionError = class extends BashletError {
  constructor(message, exitCode, stderr) {
    super(message);
    this.exitCode = exitCode;
    this.stderr = stderr;
    this.name = "CommandExecutionError";
  }
};
var SessionError = class extends BashletError {
  constructor(message, sessionId) {
    super(message);
    this.sessionId = sessionId;
    this.name = "SessionError";
  }
};
var ConfigurationError = class extends BashletError {
  constructor(message) {
    super(message);
    this.name = "ConfigurationError";
  }
};
var BinaryNotFoundError = class extends BashletError {
  constructor(binaryPath) {
    super(
      `Bashlet binary not found at '${binaryPath}'. Make sure bashlet is installed and available in your PATH, or specify the correct path using the 'binaryPath' option.`
    );
    this.name = "BinaryNotFoundError";
  }
};
var TimeoutError = class extends BashletError {
  constructor(command, timeoutSeconds) {
    super(
      `Command timed out after ${timeoutSeconds} seconds: ${command.substring(0, 100)}${command.length > 100 ? "..." : ""}`
    );
    this.name = "TimeoutError";
  }
};

// src/client.ts
var Bashlet = class {
  binaryPath;
  defaultOptions;
  constructor(options = {}) {
    this.binaryPath = options.binaryPath ?? "bashlet";
    this.defaultOptions = options;
  }
  // ============================================================================
  // One-Shot Execution
  // ============================================================================
  /**
   * Execute a one-shot command in an isolated sandbox.
   * Creates a sandbox, runs the command, and tears down.
   *
   * @param command - Shell command to execute
   * @param options - Execution options (mounts, env vars, etc.)
   * @returns Command result with stdout, stderr, and exit code
   *
   * @example
   * ```typescript
   * const result = await bashlet.exec('echo "Hello World"');
   * console.log(result.stdout); // "Hello World\n"
   * ```
   */
  async exec(command, options = {}) {
    const mergedOptions = this.mergeOptions(options);
    const args = this.buildExecArgs(command, mergedOptions);
    return this.runCommand(["exec", ...args], mergedOptions.timeout);
  }
  // ============================================================================
  // Session Management
  // ============================================================================
  /**
   * Create a new persistent sandbox session.
   *
   * @param options - Session creation options
   * @returns Session ID or name
   *
   * @example
   * ```typescript
   * const sessionId = await bashlet.createSession({
   *   name: 'my-session',
   *   ttl: '1h',
   *   mounts: [{ hostPath: './project', guestPath: '/workspace' }],
   * });
   * ```
   */
  async createSession(options = {}) {
    const args = this.buildCreateArgs(options);
    const result = await this.runCommand(["create", ...args]);
    return this.parseSessionCreateResult(result);
  }
  /**
   * Run a command in an existing session.
   *
   * @param sessionId - Session ID or name
   * @param command - Command to execute
   * @param options - Additional options
   * @returns Command result
   *
   * @example
   * ```typescript
   * const result = await bashlet.runInSession('my-session', 'npm install');
   * ```
   */
  async runInSession(sessionId, command, options = {}) {
    const args = [];
    if (options.createIfMissing) {
      args.push("-C");
    }
    if (options.preset) {
      args.push("--preset", options.preset);
    }
    args.push(sessionId, command);
    return this.runCommand(["run", ...args]);
  }
  /**
   * Terminate a session.
   *
   * @param sessionId - Session ID or name to terminate
   *
   * @example
   * ```typescript
   * await bashlet.terminate('my-session');
   * ```
   */
  async terminate(sessionId) {
    await this.runCommand(["terminate", sessionId]);
  }
  /**
   * List all active sessions.
   *
   * @returns Array of session information
   *
   * @example
   * ```typescript
   * const sessions = await bashlet.listSessions();
   * for (const session of sessions) {
   *   console.log(`${session.id}: ${session.name ?? 'unnamed'}`);
   * }
   * ```
   */
  async listSessions() {
    const result = await this.runCommand(["list"]);
    return this.parseSessionList(result);
  }
  // ============================================================================
  // File Operations
  // ============================================================================
  /**
   * Read a file from the sandbox.
   *
   * @param path - Path to the file inside the sandbox
   * @param options - Execution options
   * @returns File contents as string
   *
   * @example
   * ```typescript
   * const content = await bashlet.readFile('/workspace/package.json');
   * const pkg = JSON.parse(content);
   * ```
   */
  async readFile(path, options = {}) {
    const escapedPath = this.escapeShellArg(path);
    const result = await this.exec(`cat ${escapedPath}`, options);
    if (result.exitCode !== 0) {
      throw new CommandExecutionError(
        `Failed to read file: ${path}`,
        result.exitCode,
        result.stderr
      );
    }
    return result.stdout;
  }
  /**
   * Write content to a file in the sandbox.
   *
   * @param path - Path to the file inside the sandbox
   * @param content - Content to write
   * @param options - Execution options
   *
   * @example
   * ```typescript
   * await bashlet.writeFile('/workspace/output.txt', 'Hello World');
   * ```
   */
  async writeFile(path, content, options = {}) {
    const escapedPath = this.escapeShellArg(path);
    const encoded = Buffer.from(content).toString("base64");
    const command = `echo '${encoded}' | base64 -d > ${escapedPath}`;
    const result = await this.exec(command, options);
    if (result.exitCode !== 0) {
      throw new CommandExecutionError(
        `Failed to write file: ${path}`,
        result.exitCode,
        result.stderr
      );
    }
  }
  /**
   * List directory contents.
   *
   * @param path - Path to the directory inside the sandbox
   * @param options - Execution options
   * @returns Directory listing as string
   *
   * @example
   * ```typescript
   * const listing = await bashlet.listDir('/workspace');
   * console.log(listing);
   * ```
   */
  async listDir(path, options = {}) {
    const escapedPath = this.escapeShellArg(path);
    const result = await this.exec(`ls -la ${escapedPath}`, options);
    if (result.exitCode !== 0) {
      throw new CommandExecutionError(
        `Failed to list directory: ${path}`,
        result.exitCode,
        result.stderr
      );
    }
    return result.stdout;
  }
  // ============================================================================
  // Tool Generators
  // ============================================================================
  /**
   * Generate MCP-compatible tool definitions.
   * For use with Model Context Protocol servers.
   *
   * @example
   * ```typescript
   * import { Server } from '@modelcontextprotocol/sdk/server/index.js';
   *
   * const bashlet = new Bashlet();
   * const tools = bashlet.toMCPTools();
   *
   * server.setRequestHandler('tools/list', async () => ({
   *   tools: tools.map(t => t.definition),
   * }));
   * ```
   */
  toMCPTools() {
    const { generateMCPTools: generateMCPTools2 } = (init_mcp(), __toCommonJS(mcp_exports));
    return generateMCPTools2(this);
  }
  /**
   * Generate Vercel AI SDK-compatible tools.
   * For use with the `ai` package's generateText/streamText.
   *
   * @example
   * ```typescript
   * import { generateText } from 'ai';
   * import { openai } from '@ai-sdk/openai';
   *
   * const bashlet = new Bashlet();
   * const result = await generateText({
   *   model: openai('gpt-4-turbo'),
   *   tools: bashlet.toVercelTools(),
   *   prompt: 'List files in /workspace',
   * });
   * ```
   */
  toVercelTools() {
    const { generateVercelTools: generateVercelTools2 } = (init_vercel(), __toCommonJS(vercel_exports));
    return generateVercelTools2(this);
  }
  /**
   * Generate OpenAI function calling-compatible tools.
   * For use with OpenAI's chat completions API.
   *
   * @example
   * ```typescript
   * import OpenAI from 'openai';
   *
   * const bashlet = new Bashlet();
   * const tools = bashlet.toOpenAITools();
   *
   * const response = await openai.chat.completions.create({
   *   model: 'gpt-4-turbo',
   *   tools: tools.map(t => ({ type: t.type, function: t.function })),
   *   messages: [...],
   * });
   * ```
   */
  toOpenAITools() {
    const { generateOpenAITools: generateOpenAITools2 } = (init_openai(), __toCommonJS(openai_exports));
    return generateOpenAITools2(this);
  }
  /**
   * Generate framework-agnostic tool definitions.
   * For use with custom AI agent implementations.
   *
   * @example
   * ```typescript
   * const bashlet = new Bashlet();
   * const tools = bashlet.toGenericTools();
   *
   * for (const tool of tools) {
   *   console.log(tool.name, tool.description);
   *   // Use tool.parameters for JSON Schema
   *   // Use tool.execute(args) to run the tool
   * }
   * ```
   */
  toGenericTools() {
    const { generateGenericTools: generateGenericTools2 } = (init_generic(), __toCommonJS(generic_exports));
    return generateGenericTools2(this);
  }
  // ============================================================================
  // Private Helpers
  // ============================================================================
  mergeOptions(options) {
    return {
      preset: options.preset ?? this.defaultOptions.preset,
      mounts: [...this.defaultOptions.mounts ?? [], ...options.mounts ?? []],
      envVars: [...this.defaultOptions.envVars ?? [], ...options.envVars ?? []],
      workdir: options.workdir ?? this.defaultOptions.workdir,
      timeout: options.timeout ?? this.defaultOptions.timeout ?? 300,
      backend: options.backend ?? this.defaultOptions.backend,
      ssh: options.ssh ?? this.defaultOptions.ssh
    };
  }
  async runCommand(args, timeoutSeconds) {
    const fullArgs = ["--format", "json", ...args];
    if (this.defaultOptions.configPath) {
      fullArgs.unshift("--config", this.defaultOptions.configPath);
    }
    try {
      const subprocess = execa.execa(this.binaryPath, fullArgs, {
        timeout: (timeoutSeconds ?? 300) * 1e3,
        reject: false
      });
      const { stdout, stderr, exitCode, timedOut } = await subprocess;
      if (timedOut) {
        throw new TimeoutError(args.join(" "), timeoutSeconds ?? 300);
      }
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.error) {
          throw new BashletError(parsed.error);
        }
        return {
          stdout: parsed.stdout ?? "",
          stderr: parsed.stderr ?? stderr,
          exitCode: parsed.exit_code ?? exitCode ?? 0
        };
      } catch (e) {
        if (e instanceof BashletError) {
          throw e;
        }
        return { stdout, stderr, exitCode: exitCode ?? 0 };
      }
    } catch (error) {
      if (error instanceof BashletError) {
        throw error;
      }
      const execError = error;
      if (execError.code === "ENOENT") {
        throw new BinaryNotFoundError(this.binaryPath);
      }
      throw new BashletError(
        `Failed to execute bashlet: ${execError.message}`,
        error
      );
    }
  }
  /** Track temp config files for cleanup */
  tempConfigFiles = [];
  buildExecArgs(command, options) {
    const args = [];
    if (options.preset) {
      args.push("--preset", options.preset);
    }
    if (options.backend) {
      args.push("--backend", options.backend);
    }
    if (options.ssh) {
      const configPath = this.createSshConfigFile(options.ssh);
      args.push("--config", configPath);
    }
    for (const mount of options.mounts ?? []) {
      const mountStr = mount.readonly ? `${mount.hostPath}:${mount.guestPath}:ro` : `${mount.hostPath}:${mount.guestPath}`;
      args.push("--mount", mountStr);
    }
    for (const env of options.envVars ?? []) {
      args.push("--env", `${env.key}=${env.value}`);
    }
    if (options.workdir) {
      args.push("--workdir", options.workdir);
    }
    args.push(command);
    return args;
  }
  /**
   * Create a temporary config file with SSH settings.
   * The file is automatically cleaned up when the client is garbage collected.
   */
  createSshConfigFile(ssh) {
    const config = {
      ssh: {
        host: ssh.host,
        port: ssh.port ?? 22,
        user: ssh.user,
        key_file: ssh.keyFile,
        use_control_master: ssh.useControlMaster ?? true,
        connect_timeout: ssh.connectTimeout ?? 30
      }
    };
    const configId = crypto.randomBytes(8).toString("hex");
    const configPath = path.join(os.tmpdir(), `bashlet-ssh-${configId}.json`);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    this.tempConfigFiles.push(configPath);
    return configPath;
  }
  /**
   * Clean up temporary config files.
   * Called automatically but can also be called manually.
   */
  cleanup() {
    for (const configPath of this.tempConfigFiles) {
      if (fs.existsSync(configPath)) {
        try {
          fs.unlinkSync(configPath);
        } catch {
        }
      }
    }
    this.tempConfigFiles = [];
  }
  buildCreateArgs(options) {
    const args = [];
    if (options.name) {
      args.push("--name", options.name);
    }
    if (options.preset) {
      args.push("--preset", options.preset);
    }
    for (const mount of options.mounts ?? []) {
      const mountStr = mount.readonly ? `${mount.hostPath}:${mount.guestPath}:ro` : `${mount.hostPath}:${mount.guestPath}`;
      args.push("--mount", mountStr);
    }
    for (const env of options.envVars ?? []) {
      args.push("--env", `${env.key}=${env.value}`);
    }
    if (options.workdir) {
      args.push("--workdir", options.workdir);
    }
    if (options.ttl) {
      args.push("--ttl", options.ttl);
    }
    return args;
  }
  parseSessionCreateResult(result) {
    try {
      const parsed = JSON.parse(result.stdout);
      return parsed.name ?? parsed.id;
    } catch {
      return result.stdout.trim();
    }
  }
  parseSessionList(result) {
    try {
      const items = JSON.parse(result.stdout);
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        createdAt: item.created_at,
        lastActivity: item.last_activity,
        ttlSeconds: item.ttl_seconds,
        expired: item.expired,
        mounts: item.mounts.map((m) => ({
          hostPath: m.host_path,
          guestPath: m.guest_path,
          readonly: m.readonly
        })),
        workdir: item.workdir
      }));
    } catch {
      return [];
    }
  }
  escapeShellArg(arg) {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
};

// src/schemas/index.ts
init_zod();
init_json_schema();

// src/tools/index.ts
init_mcp();
init_vercel();
init_openai();
init_generic();

exports.Bashlet = Bashlet;
exports.BashletError = BashletError;
exports.BinaryNotFoundError = BinaryNotFoundError;
exports.CommandExecutionError = CommandExecutionError;
exports.ConfigurationError = ConfigurationError;
exports.SessionError = SessionError;
exports.TimeoutError = TimeoutError;
exports.createMCPServer = createMCPServer;
exports.createOpenAIToolHandler = createOpenAIToolHandler;
exports.createToolRegistry = createToolRegistry;
exports.generateGenericTools = generateGenericTools;
exports.generateMCPTools = generateMCPTools;
exports.generateOpenAITools = generateOpenAITools;
exports.generateVercelTools = generateVercelTools;
exports.getOpenAIToolDefinitions = getOpenAIToolDefinitions;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map