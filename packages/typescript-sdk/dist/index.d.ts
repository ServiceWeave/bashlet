export { a as BackendType, B as Bashlet, g as BashletJsonOutput, b as BashletOptions, c as CommandResult, C as CreateSessionOptions, D as DockerOptions, e as EnvVar, E as ExecOptions, M as Mount, d as Session, h as SessionListItem, S as SshOptions, f as ToolDefinition, T as ToolOperation } from './client-B-jVT1DT.js';
export { E as ExecInput, L as ListDirInput, R as ReadFileInput, W as WriteFileInput, e as execSchema, l as listDirSchema, r as readFileSchema, w as writeFileSchema } from './zod-BlfQ35iM.js';
export { J as JSONSchema, e as execJsonSchema, l as listDirJsonSchema, r as readFileJsonSchema, w as writeFileJsonSchema } from './json-schema-Be2SVjL0.js';
export { MCPToolContent, MCPToolDefinition, MCPToolHandler, MCPToolResult, createMCPServer, generateMCPTools } from './tools/mcp.js';
export { BashletVercelTools, ExecOutput, ListDirOutput, ReadFileOutput, VercelTool, WriteFileOutput, generateVercelTools } from './tools/vercel.js';
export { OpenAITool, OpenAIToolWithHandler, createOpenAIToolHandler, generateOpenAITools, getOpenAIToolDefinitions } from './tools/openai.js';
export { ExecArgs, ExecResult, GenericTool, ListDirArgs, ReadFileArgs, WriteFileArgs, WriteFileResult, createToolRegistry, generateGenericTools } from './tools/generic.js';
import 'zod';

/**
 * Base error class for all bashlet SDK errors
 */
declare class BashletError extends Error {
    readonly cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
/**
 * Error thrown when command execution fails
 */
declare class CommandExecutionError extends BashletError {
    readonly exitCode: number;
    readonly stderr: string;
    constructor(message: string, exitCode: number, stderr: string);
}
/**
 * Error thrown when session operations fail
 */
declare class SessionError extends BashletError {
    readonly sessionId?: string | undefined;
    constructor(message: string, sessionId?: string | undefined);
}
/**
 * Error thrown when configuration is invalid
 */
declare class ConfigurationError extends BashletError {
    constructor(message: string);
}
/**
 * Error thrown when the bashlet binary is not found or inaccessible
 */
declare class BinaryNotFoundError extends BashletError {
    constructor(binaryPath: string);
}
/**
 * Error thrown when command times out
 */
declare class TimeoutError extends BashletError {
    constructor(command: string, timeoutSeconds: number);
}

export { BashletError, BinaryNotFoundError, CommandExecutionError, ConfigurationError, SessionError, TimeoutError };
