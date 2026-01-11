import { B as Bashlet } from '../client-CZ5pOic9.js';
import { J as JSONSchema } from '../json-schema-Be2SVjL0.js';

/**
 * MCP tool definition structure
 */
interface MCPToolDefinition {
    name: string;
    description: string;
    inputSchema: JSONSchema;
}
/**
 * MCP tool content item
 */
interface MCPToolContent {
    type: "text";
    text: string;
}
/**
 * MCP tool result
 */
interface MCPToolResult {
    content: MCPToolContent[];
    isError?: boolean;
}
/**
 * MCP tool with handler
 */
interface MCPToolHandler {
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
declare function generateMCPTools(client: Bashlet): MCPToolHandler[];
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
declare function createMCPServer(client: Bashlet): {
    tools: MCPToolDefinition[];
    handleToolCall: (name: string, args: Record<string, unknown>) => Promise<MCPToolResult>;
};

export { type MCPToolContent, type MCPToolDefinition, type MCPToolHandler, type MCPToolResult, createMCPServer, generateMCPTools };
