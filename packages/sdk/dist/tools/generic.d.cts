import { B as Bashlet } from '../client-CZ5pOic9.cjs';
import { J as JSONSchema } from '../json-schema-Be2SVjL0.cjs';

/**
 * Generic tool definition that can be adapted to any AI framework.
 */
interface GenericTool<TInput = Record<string, unknown>, TOutput = unknown> {
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
interface ExecArgs {
    command: string;
    workdir?: string;
}
interface ReadFileArgs {
    path: string;
}
interface WriteFileArgs {
    path: string;
    content: string;
}
interface ListDirArgs {
    path: string;
}
/**
 * Output types for generic tools
 */
interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
interface WriteFileResult {
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
declare function generateGenericTools(client: Bashlet): GenericTool[];
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
declare function createToolRegistry(client: Bashlet): {
    /** Get all tools as an array */
    all: () => GenericTool<Record<string, unknown>, unknown>[];
    /** Get a tool by name */
    get: (name: string) => GenericTool<Record<string, unknown>, unknown> | undefined;
    /** Check if a tool exists */
    has: (name: string) => boolean;
    /** Execute a tool by name */
    execute: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    /** Get tool names */
    names: () => string[];
};

export { type ExecArgs, type ExecResult, type GenericTool, type ListDirArgs, type ReadFileArgs, type WriteFileArgs, type WriteFileResult, createToolRegistry, generateGenericTools };
