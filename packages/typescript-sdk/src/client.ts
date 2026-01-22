import { execa } from "execa";
import type {
  BashletOptions,
  CreateSessionOptions,
  ExecOptions,
  CommandResult,
  Session,
  BashletJsonOutput,
  SessionListItem,
  SshOptions,
} from "./types.js";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { randomBytes } from "crypto";
import {
  BashletError,
  CommandExecutionError,
  BinaryNotFoundError,
  TimeoutError,
} from "./errors.js";

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
export class Bashlet {
  private readonly binaryPath: string;
  private readonly defaultOptions: BashletOptions;

  constructor(options: BashletOptions = {}) {
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
  async exec(command: string, options: ExecOptions = {}): Promise<CommandResult> {
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
  async createSession(options: CreateSessionOptions = {}): Promise<string> {
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
  async runInSession(
    sessionId: string,
    command: string,
    options: { createIfMissing?: boolean; preset?: string } = {}
  ): Promise<CommandResult> {
    const args: string[] = [];

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
  async terminate(sessionId: string): Promise<void> {
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
  async listSessions(): Promise<Session[]> {
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
  async readFile(path: string, options: ExecOptions = {}): Promise<string> {
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
  async writeFile(
    path: string,
    content: string,
    options: ExecOptions = {}
  ): Promise<void> {
    const escapedPath = this.escapeShellArg(path);
    // Use base64 encoding to handle special characters safely
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
  async listDir(path: string, options: ExecOptions = {}): Promise<string> {
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
    // Dynamic import to avoid bundling MCP SDK when not needed
    const { generateMCPTools } = require("./tools/mcp.js");
    return generateMCPTools(this);
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
    const { generateVercelTools } = require("./tools/vercel.js");
    return generateVercelTools(this);
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
    const { generateOpenAITools } = require("./tools/openai.js");
    return generateOpenAITools(this);
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
    const { generateGenericTools } = require("./tools/generic.js");
    return generateGenericTools(this);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private mergeOptions(options: ExecOptions): ExecOptions {
    return {
      preset: options.preset ?? this.defaultOptions.preset,
      mounts: [...(this.defaultOptions.mounts ?? []), ...(options.mounts ?? [])],
      envVars: [...(this.defaultOptions.envVars ?? []), ...(options.envVars ?? [])],
      workdir: options.workdir ?? this.defaultOptions.workdir,
      timeout: options.timeout ?? this.defaultOptions.timeout ?? 300,
      backend: options.backend ?? this.defaultOptions.backend,
      ssh: options.ssh ?? this.defaultOptions.ssh,
    };
  }

  private async runCommand(
    args: string[],
    timeoutSeconds?: number
  ): Promise<CommandResult> {
    const fullArgs = ["--format", "json", ...args];

    if (this.defaultOptions.configPath) {
      fullArgs.unshift("--config", this.defaultOptions.configPath);
    }

    try {
      const subprocess = execa(this.binaryPath, fullArgs, {
        timeout: (timeoutSeconds ?? 300) * 1000,
        reject: false,
      });

      const { stdout, stderr, exitCode, timedOut } = await subprocess;

      if (timedOut) {
        throw new TimeoutError(args.join(" "), timeoutSeconds ?? 300);
      }

      // Parse JSON output
      try {
        const parsed = JSON.parse(stdout) as BashletJsonOutput;

        // Check for error in JSON response
        if (parsed.error) {
          throw new BashletError(parsed.error);
        }

        return {
          stdout: parsed.stdout ?? "",
          stderr: parsed.stderr ?? stderr,
          exitCode: parsed.exit_code ?? exitCode ?? 0,
        };
      } catch (e) {
        // If not valid JSON and not our error, return raw output
        if (e instanceof BashletError) {
          throw e;
        }
        return { stdout, stderr, exitCode: exitCode ?? 0 };
      }
    } catch (error) {
      if (error instanceof BashletError) {
        throw error;
      }

      const execError = error as Error & { code?: string };

      // Check for binary not found
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
  private tempConfigFiles: string[] = [];

  private buildExecArgs(command: string, options: ExecOptions): string[] {
    const args: string[] = [];

    if (options.preset) {
      args.push("--preset", options.preset);
    }

    if (options.backend) {
      args.push("--backend", options.backend);
    }

    // Handle SSH configuration by creating a temporary config file
    if (options.ssh) {
      const configPath = this.createSshConfigFile(options.ssh);
      args.push("--config", configPath);
    }

    for (const mount of options.mounts ?? []) {
      const mountStr = mount.readonly
        ? `${mount.hostPath}:${mount.guestPath}:ro`
        : `${mount.hostPath}:${mount.guestPath}`;
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
  private createSshConfigFile(ssh: SshOptions): string {
    const config = {
      ssh: {
        host: ssh.host,
        port: ssh.port ?? 22,
        user: ssh.user,
        key_file: ssh.keyFile,
        use_control_master: ssh.useControlMaster ?? true,
        connect_timeout: ssh.connectTimeout ?? 30,
      },
    };

    const configId = randomBytes(8).toString("hex");
    const configPath = join(tmpdir(), `bashlet-ssh-${configId}.json`);
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    this.tempConfigFiles.push(configPath);

    return configPath;
  }

  /**
   * Clean up temporary config files.
   * Called automatically but can also be called manually.
   */
  cleanup(): void {
    for (const configPath of this.tempConfigFiles) {
      if (existsSync(configPath)) {
        try {
          unlinkSync(configPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
    this.tempConfigFiles = [];
  }

  private buildCreateArgs(options: CreateSessionOptions): string[] {
    const args: string[] = [];

    if (options.name) {
      args.push("--name", options.name);
    }

    if (options.preset) {
      args.push("--preset", options.preset);
    }

    for (const mount of options.mounts ?? []) {
      const mountStr = mount.readonly
        ? `${mount.hostPath}:${mount.guestPath}:ro`
        : `${mount.hostPath}:${mount.guestPath}`;
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

  private parseSessionCreateResult(result: CommandResult): string {
    // JSON output contains { id, name }
    try {
      const parsed = JSON.parse(result.stdout) as { id: string; name?: string };
      return parsed.name ?? parsed.id;
    } catch {
      // Fallback to raw output
      return result.stdout.trim();
    }
  }

  private parseSessionList(result: CommandResult): Session[] {
    try {
      const items = JSON.parse(result.stdout) as SessionListItem[];
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
          readonly: m.readonly,
        })),
        workdir: item.workdir,
      }));
    } catch {
      return [];
    }
  }

  private escapeShellArg(arg: string): string {
    // Escape single quotes by ending the string, adding escaped quote, starting new string
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
}
