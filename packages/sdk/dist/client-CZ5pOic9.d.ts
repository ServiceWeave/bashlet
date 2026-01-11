/**
 * Mount configuration for sandbox filesystem
 */
interface Mount {
    /** Path on the host system */
    hostPath: string;
    /** Path inside the sandbox */
    guestPath: string;
    /** Whether the mount is read-only (default: false) */
    readonly?: boolean;
}
/**
 * Environment variable definition
 */
interface EnvVar {
    key: string;
    value: string;
}
/**
 * Configuration options for Bashlet client
 */
interface BashletOptions {
    /** Path to bashlet binary (defaults to 'bashlet' in PATH) */
    binaryPath?: string;
    /** Default preset to apply */
    preset?: string;
    /** Default mounts */
    mounts?: Mount[];
    /** Default environment variables */
    envVars?: EnvVar[];
    /** Default working directory inside sandbox */
    workdir?: string;
    /** Command timeout in seconds (default: 300) */
    timeout?: number;
    /** Path to config file */
    configPath?: string;
}
/**
 * Options for session creation
 */
interface CreateSessionOptions {
    /** Session name (auto-generated if not provided) */
    name?: string;
    /** Preset configuration to apply */
    preset?: string;
    /** Mount specifications */
    mounts?: Mount[];
    /** Environment variables */
    envVars?: EnvVar[];
    /** Working directory */
    workdir?: string;
    /** Time-to-live (e.g., "5m", "1h", "30s") */
    ttl?: string;
}
/**
 * Options for command execution
 */
interface ExecOptions {
    /** Preset configuration to apply */
    preset?: string;
    /** Mount specifications */
    mounts?: Mount[];
    /** Environment variables */
    envVars?: EnvVar[];
    /** Working directory */
    workdir?: string;
    /** Command timeout in seconds */
    timeout?: number;
}
/**
 * Result of command execution
 */
interface CommandResult {
    /** Standard output from the command */
    stdout: string;
    /** Standard error from the command */
    stderr: string;
    /** Exit code of the command */
    exitCode: number;
}
/**
 * Session information
 */
interface Session {
    /** Unique session ID */
    id: string;
    /** Optional session name */
    name?: string;
    /** Unix timestamp when the session was created */
    createdAt: number;
    /** Unix timestamp of last activity */
    lastActivity: number;
    /** Time-to-live in seconds */
    ttlSeconds?: number;
    /** Whether the session has expired */
    expired: boolean;
    /** Mount configurations for this session */
    mounts: Array<{
        hostPath: string;
        guestPath: string;
        readonly: boolean;
    }>;
    /** Working directory for this session */
    workdir: string;
}
/**
 * Tool operation names
 */
type ToolOperation = "bashlet_exec" | "bashlet_read_file" | "bashlet_write_file" | "bashlet_list_dir";
/**
 * Generic tool definition
 */
interface ToolDefinition<TInput = Record<string, unknown>, TOutput = unknown> {
    /** Tool name */
    name: ToolOperation;
    /** Tool description */
    description: string;
    /** JSON Schema for input parameters */
    parameters: Record<string, unknown>;
    /** Execute function */
    execute: (args: TInput) => Promise<TOutput>;
}
/**
 * JSON output format from bashlet CLI
 */
interface BashletJsonOutput {
    stdout?: string;
    stderr?: string;
    exit_code?: number;
    id?: string;
    name?: string;
    error?: string;
}
/**
 * Session list item from bashlet CLI JSON output
 */
interface SessionListItem {
    id: string;
    name?: string;
    created_at: number;
    last_activity: number;
    ttl_seconds?: number;
    expired: boolean;
    mounts: Array<{
        host_path: string;
        guest_path: string;
        readonly: boolean;
    }>;
    workdir: string;
}

/**
 * Bashlet client for sandboxed bash execution.
 *
 * Provides methods for:
 * - One-shot command execution
 * - Session management (create, run, terminate)
 * - File operations (read, write, list)
 * - Tool generation for AI agent frameworks
 *
 * @example
 * ```typescript
 * const bashlet = new Bashlet({
 *   mounts: [{ hostPath: './src', guestPath: '/workspace' }],
 * });
 *
 * const result = await bashlet.exec('ls -la /workspace');
 * console.log(result.stdout);
 * ```
 */
declare class Bashlet {
    private readonly binaryPath;
    private readonly defaultOptions;
    constructor(options?: BashletOptions);
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
    exec(command: string, options?: ExecOptions): Promise<CommandResult>;
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
    createSession(options?: CreateSessionOptions): Promise<string>;
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
    runInSession(sessionId: string, command: string, options?: {
        createIfMissing?: boolean;
        preset?: string;
    }): Promise<CommandResult>;
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
    terminate(sessionId: string): Promise<void>;
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
    listSessions(): Promise<Session[]>;
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
    readFile(path: string, options?: ExecOptions): Promise<string>;
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
    writeFile(path: string, content: string, options?: ExecOptions): Promise<void>;
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
    listDir(path: string, options?: ExecOptions): Promise<string>;
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
    toMCPTools(): any;
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
    toVercelTools(): any;
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
    toOpenAITools(): any;
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
    toGenericTools(): any;
    private mergeOptions;
    private runCommand;
    private buildExecArgs;
    private buildCreateArgs;
    private parseSessionCreateResult;
    private parseSessionList;
    private escapeShellArg;
}

export { Bashlet as B, type CreateSessionOptions as C, type ExecOptions as E, type Mount as M, type Session as S, type ToolOperation as T, type BashletOptions as a, type CommandResult as b, type EnvVar as c, type ToolDefinition as d, type BashletJsonOutput as e, type SessionListItem as f };
