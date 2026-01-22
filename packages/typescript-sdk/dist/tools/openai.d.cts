import { B as Bashlet } from '../client-B-jVT1DT.cjs';
import { J as JSONSchema } from '../json-schema-Be2SVjL0.cjs';

/**
 * OpenAI function calling tool structure
 */
interface OpenAITool {
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
interface OpenAIToolWithHandler extends OpenAITool {
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
declare function generateOpenAITools(client: Bashlet): OpenAIToolWithHandler[];
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
declare function getOpenAIToolDefinitions(client: Bashlet): OpenAITool[];
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
declare function createOpenAIToolHandler(client: Bashlet): (name: string, args: Record<string, unknown>) => Promise<string>;

export { type OpenAITool, type OpenAIToolWithHandler, createOpenAIToolHandler, generateOpenAITools, getOpenAIToolDefinitions };
