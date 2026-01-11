import type { Bashlet } from "../client.js";
import {
  execJsonSchema,
  readFileJsonSchema,
  writeFileJsonSchema,
  listDirJsonSchema,
  type JSONSchema,
} from "../schemas/json-schema.js";

/**
 * MCP tool definition structure
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

/**
 * MCP tool content item
 */
export interface MCPToolContent {
  type: "text";
  text: string;
}

/**
 * MCP tool result
 */
export interface MCPToolResult {
  content: MCPToolContent[];
  isError?: boolean;
}

/**
 * MCP tool with handler
 */
export interface MCPToolHandler {
  definition: MCPToolDefinition;
  handler: (args: Record<string, unknown>) => Promise<MCPToolResult>;
}

/**
 * Generate MCP-compatible tool definitions with handlers.
 *
 * @param client - Bashlet client instance
 * @returns Array of MCP tool handlers
 *
 * @example
 * ```typescript
 * import { Server } from '@modelcontextprotocol/sdk/server/index.js';
 * import { Bashlet, generateMCPTools } from '@bashlet/sdk';
 *
 * const bashlet = new Bashlet();
 * const tools = generateMCPTools(bashlet);
 *
 * server.setRequestHandler('tools/list', async () => ({
 *   tools: tools.map(t => t.definition),
 * }));
 *
 * server.setRequestHandler('tools/call', async (request) => {
 *   const { name, arguments: args } = request.params;
 *   const tool = tools.find(t => t.definition.name === name);
 *   return tool.handler(args);
 * });
 * ```
 */
export function generateMCPTools(client: Bashlet): MCPToolHandler[] {
  return [
    {
      definition: {
        name: "bashlet_exec",
        description:
          "Execute a shell command in a sandboxed bash environment. " +
          "Returns stdout, stderr, and exit code. " +
          "Use this for running shell commands, scripts, and system operations safely.",
        inputSchema: execJsonSchema,
      },
      handler: async (args) => {
        const { command, workdir } = args as { command: string; workdir?: string };
        try {
          const result = await client.exec(command, { workdir });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: String(error) }],
            isError: true,
          };
        }
      },
    },
    {
      definition: {
        name: "bashlet_read_file",
        description:
          "Read the contents of a file from the sandboxed environment. " +
          "Returns the file content as a string.",
        inputSchema: readFileJsonSchema,
      },
      handler: async (args) => {
        const { path } = args as { path: string };
        try {
          const content = await client.readFile(path);
          return { content: [{ type: "text" as const, text: content }] };
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: String(error) }],
            isError: true,
          };
        }
      },
    },
    {
      definition: {
        name: "bashlet_write_file",
        description:
          "Write content to a file in the sandboxed environment. " +
          "Creates the file if it doesn't exist, overwrites if it does.",
        inputSchema: writeFileJsonSchema,
      },
      handler: async (args) => {
        const { path, content } = args as { path: string; content: string };
        try {
          await client.writeFile(path, content);
          return {
            content: [{ type: "text" as const, text: `Successfully wrote to ${path}` }],
          };
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: String(error) }],
            isError: true,
          };
        }
      },
    },
    {
      definition: {
        name: "bashlet_list_dir",
        description:
          "List the contents of a directory in the sandboxed environment. " +
          "Returns a detailed listing with file permissions, sizes, and names.",
        inputSchema: listDirJsonSchema,
      },
      handler: async (args) => {
        const { path } = args as { path: string };
        try {
          const listing = await client.listDir(path);
          return { content: [{ type: "text" as const, text: listing }] };
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: String(error) }],
            isError: true,
          };
        }
      },
    },
  ];
}

/**
 * Create an MCP server helper with bashlet tools.
 *
 * @param client - Bashlet client instance
 * @returns Object with tools list and handler function
 *
 * @example
 * ```typescript
 * const bashlet = new Bashlet();
 * const { tools, handleToolCall } = createMCPServer(bashlet);
 *
 * // Use with MCP SDK
 * server.setRequestHandler('tools/list', async () => ({ tools }));
 * server.setRequestHandler('tools/call', async (req) =>
 *   handleToolCall(req.params.name, req.params.arguments)
 * );
 * ```
 */
export function createMCPServer(client: Bashlet) {
  const toolHandlers = generateMCPTools(client);

  return {
    tools: toolHandlers.map((t) => t.definition),
    handleToolCall: async (
      name: string,
      args: Record<string, unknown>
    ): Promise<MCPToolResult> => {
      const tool = toolHandlers.find((t) => t.definition.name === name);
      if (!tool) {
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }
      return tool.handler(args);
    },
  };
}
