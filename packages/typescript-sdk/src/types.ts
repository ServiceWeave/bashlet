/**
 * Sandbox backend type
 */
export type BackendType = "wasmer" | "firecracker" | "docker" | "ssh" | "auto";

/**
 * Docker-specific configuration options
 */
export interface DockerOptions {
  /** Custom Docker image name (default: bashlet-sandbox:latest) */
  image?: string;
  /** Enable networking in the container (default: false) */
  enableNetworking?: boolean;
  /** Enable session mode for persistent container (default: false) */
  sessionMode?: boolean;
}

/**
 * SSH-specific configuration options
 */
export interface SshOptions {
  /** SSH host to connect to */
  host: string;
  /** SSH port (default: 22) */
  port?: number;
  /** SSH username */
  user: string;
  /** Path to private key file */
  keyFile?: string;
  /** Use SSH ControlMaster for connection multiplexing (default: true) */
  useControlMaster?: boolean;
  /** Connection timeout in seconds (default: 30) */
  connectTimeout?: number;
}

/**
 * Mount configuration for sandbox filesystem
 */
export interface Mount {
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
export interface EnvVar {
  key: string;
  value: string;
}

/**
 * Configuration options for Bashlet client
 */
export interface BashletOptions {
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
  /** Sandbox backend to use (wasmer, firecracker, docker, ssh, auto) */
  backend?: BackendType;
  /** SSH configuration (required when backend is 'ssh') */
  ssh?: SshOptions;
}

/**
 * Options for session creation
 */
export interface CreateSessionOptions {
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
export interface ExecOptions {
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
  /** Sandbox backend to use (wasmer, firecracker, docker, ssh, auto) */
  backend?: BackendType;
  /** SSH configuration (required when backend is 'ssh') */
  ssh?: SshOptions;
}

/**
 * Result of command execution
 */
export interface CommandResult {
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
export interface Session {
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
export type ToolOperation =
  | "bashlet_exec"
  | "bashlet_read_file"
  | "bashlet_write_file"
  | "bashlet_list_dir";

/**
 * Generic tool definition
 */
export interface ToolDefinition<TInput = Record<string, unknown>, TOutput = unknown> {
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
export interface BashletJsonOutput {
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
export interface SessionListItem {
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
