import type { Bashlet } from "../client.js";
import {
  execJsonSchema,
  readFileJsonSchema,
  writeFileJsonSchema,
  listDirJsonSchema,
  type JSONSchema,
} from "../schemas/json-schema.js";

/**
 * Generic tool definition that can be adapted to any AI framework.
 */
export interface GenericTool<TInput = Record<string, unknown>, TOutput = unknown> {
  /** Tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for input parameters */
  parameters: JSONSchema;
  /** Execute the tool with given arguments */
  execute: (args: TInput) => Promise<TOutput>;
}

/**
 * Input types for generic tools
 */
export interface ExecArgs {
  command: string;
  workdir?: string;
}

export interface ReadFileArgs {
  path: string;
}

export interface WriteFileArgs {
  path: string;
  content: string;
}

export interface ListDirArgs {
  path: string;
}

/**
 * Output types for generic tools
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface WriteFileResult {
  success: boolean;
  path: string;
}

/**
 * Generate framework-agnostic tool definitions.
 *
 * These tools can be adapted to work with any AI agent framework
 * by using the JSON Schema parameters and execute function.
 *
 * @param client - Bashlet client instance
 * @returns Array of generic tool definitions
 *
 * @example
 * ```typescript
 * import { Bashlet, generateGenericTools } from '@bashlet/sdk';
 *
 * const bashlet = new Bashlet();
 * const tools = generateGenericTools(bashlet);
 *
 * // Use with any custom AI agent implementation
 * for (const tool of tools) {
 *   console.log(`Tool: ${tool.name}`);
 *   console.log(`Description: ${tool.description}`);
 *   console.log(`Parameters: ${JSON.stringify(tool.parameters)}`);
 *
 *   // Execute the tool
 *   const result = await tool.execute({ command: 'ls' });
 * }
 * ```
 */
export function generateGenericTools(client: Bashlet): GenericTool[] {
  return [
    {
      name: "bashlet_exec",
      description:
        "Execute a shell command in a sandboxed bash environment. " +
        "Returns stdout, stderr, and exit code. " +
        "Use this for running shell commands, scripts, and system operations safely.",
      parameters: execJsonSchema,
      execute: async (args): Promise<ExecResult> => {
        const { command, workdir } = args as unknown as ExecArgs;
        const result = await client.exec(command, { workdir });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        };
      },
    },
    {
      name: "bashlet_read_file",
      description:
        "Read the contents of a file from the sandboxed environment. " +
        "Returns the file content as a string.",
      parameters: readFileJsonSchema,
      execute: async (args): Promise<string> => {
        const { path } = args as unknown as ReadFileArgs;
        return await client.readFile(path);
      },
    },
    {
      name: "bashlet_write_file",
      description:
        "Write content to a file in the sandboxed environment. " +
        "Creates the file if it doesn't exist, overwrites if it does.",
      parameters: writeFileJsonSchema,
      execute: async (args): Promise<WriteFileResult> => {
        const { path, content } = args as unknown as WriteFileArgs;
        await client.writeFile(path, content);
        return { success: true, path };
      },
    },
    {
      name: "bashlet_list_dir",
      description:
        "List the contents of a directory in the sandboxed environment. " +
        "Returns a detailed listing with file permissions, sizes, and names.",
      parameters: listDirJsonSchema,
      execute: async (args): Promise<string> => {
        const { path } = args as unknown as ListDirArgs;
        return await client.listDir(path);
      },
    },
  ];
}

/**
 * Create a tool registry for looking up and executing tools by name.
 *
 * @param client - Bashlet client instance
 * @returns Object with tools map and execute helper
 *
 * @example
 * ```typescript
 * const registry = createToolRegistry(bashlet);
 *
 * // Get tool by name
 * const execTool = registry.get('bashlet_exec');
 *
 * // Execute tool by name
 * const result = await registry.execute('bashlet_exec', { command: 'ls' });
 * ```
 */
export function createToolRegistry(client: Bashlet) {
  const tools = generateGenericTools(client);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  return {
    /** Get all tools as an array */
    all: () => tools,

    /** Get a tool by name */
    get: (name: string) => toolMap.get(name),

    /** Check if a tool exists */
    has: (name: string) => toolMap.has(name),

    /** Execute a tool by name */
    execute: async (name: string, args: Record<string, unknown>) => {
      const tool = toolMap.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }
      return tool.execute(args);
    },

    /** Get tool names */
    names: () => Array.from(toolMap.keys()),
  };
}
