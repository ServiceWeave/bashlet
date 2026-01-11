import type { Bashlet } from "../client.js";
import {
  execJsonSchema,
  readFileJsonSchema,
  writeFileJsonSchema,
  listDirJsonSchema,
  type JSONSchema,
} from "../schemas/json-schema.js";

/**
 * OpenAI function calling tool structure
 */
export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

/**
 * OpenAI tool with handler for executing tool calls
 */
export interface OpenAIToolWithHandler extends OpenAITool {
  handler: (args: Record<string, unknown>) => Promise<string>;
}

/**
 * Generate OpenAI function calling-compatible tools with handlers.
 *
 * @param client - Bashlet client instance
 * @returns Array of OpenAI tools with handlers
 *
 * @example
 * ```typescript
 * import OpenAI from 'openai';
 * import { Bashlet, generateOpenAITools } from '@bashlet/sdk';
 *
 * const openai = new OpenAI();
 * const bashlet = new Bashlet();
 * const tools = generateOpenAITools(bashlet);
 *
 * const response = await openai.chat.completions.create({
 *   model: 'gpt-4-turbo',
 *   tools: tools.map(t => ({ type: t.type, function: t.function })),
 *   messages: [{ role: 'user', content: 'List files in the current directory' }],
 * });
 *
 * // Handle tool calls
 * for (const toolCall of response.choices[0].message.tool_calls ?? []) {
 *   const tool = tools.find(t => t.function.name === toolCall.function.name);
 *   const result = await tool.handler(JSON.parse(toolCall.function.arguments));
 *   console.log(result);
 * }
 * ```
 */
export function generateOpenAITools(client: Bashlet): OpenAIToolWithHandler[] {
  return [
    {
      type: "function",
      function: {
        name: "bashlet_exec",
        description:
          "Execute a shell command in a sandboxed bash environment. " +
          "Returns stdout, stderr, and exit code. " +
          "Use this for running shell commands, scripts, and system operations safely.",
        parameters: execJsonSchema,
      },
      handler: async (args) => {
        const { command, workdir } = args as { command: string; workdir?: string };
        const result = await client.exec(command, { workdir });
        return JSON.stringify({
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        });
      },
    },
    {
      type: "function",
      function: {
        name: "bashlet_read_file",
        description:
          "Read the contents of a file from the sandboxed environment. " +
          "Returns the file content as a string.",
        parameters: readFileJsonSchema,
      },
      handler: async (args) => {
        const { path } = args as { path: string };
        return await client.readFile(path);
      },
    },
    {
      type: "function",
      function: {
        name: "bashlet_write_file",
        description:
          "Write content to a file in the sandboxed environment. " +
          "Creates the file if it doesn't exist, overwrites if it does.",
        parameters: writeFileJsonSchema,
      },
      handler: async (args) => {
        const { path, content } = args as { path: string; content: string };
        await client.writeFile(path, content);
        return JSON.stringify({ success: true, path });
      },
    },
    {
      type: "function",
      function: {
        name: "bashlet_list_dir",
        description:
          "List the contents of a directory in the sandboxed environment. " +
          "Returns a detailed listing with file permissions, sizes, and names.",
        parameters: listDirJsonSchema,
      },
      handler: async (args) => {
        const { path } = args as { path: string };
        return await client.listDir(path);
      },
    },
  ];
}

/**
 * Get just the tool definitions (for passing to OpenAI API).
 *
 * @param client - Bashlet client instance
 * @returns Array of OpenAI tool definitions (without handlers)
 *
 * @example
 * ```typescript
 * const tools = getOpenAIToolDefinitions(bashlet);
 * const response = await openai.chat.completions.create({
 *   model: 'gpt-4-turbo',
 *   tools,
 *   messages: [...],
 * });
 * ```
 */
export function getOpenAIToolDefinitions(client: Bashlet): OpenAITool[] {
  return generateOpenAITools(client).map(({ type, function: fn }) => ({
    type,
    function: fn,
  }));
}

/**
 * Create a tool handler map for processing tool calls.
 *
 * @param client - Bashlet client instance
 * @returns Function that handles tool calls by name
 *
 * @example
 * ```typescript
 * const handleToolCall = createOpenAIToolHandler(bashlet);
 *
 * // After getting tool calls from OpenAI response
 * for (const toolCall of response.choices[0].message.tool_calls) {
 *   const result = await handleToolCall(
 *     toolCall.function.name,
 *     JSON.parse(toolCall.function.arguments)
 *   );
 *   // Send result back to OpenAI
 * }
 * ```
 */
export function createOpenAIToolHandler(client: Bashlet) {
  const tools = generateOpenAITools(client);
  const handlerMap = new Map(tools.map((t) => [t.function.name, t.handler]));

  return async (name: string, args: Record<string, unknown>): Promise<string> => {
    const handler = handlerMap.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return handler(args);
  };
}
