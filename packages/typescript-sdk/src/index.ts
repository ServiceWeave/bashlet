// Main client export
export { Bashlet } from "./client.js";

// Type exports
export type {
  BackendType,
  DockerOptions,
  BashletOptions,
  CreateSessionOptions,
  ExecOptions,
  CommandResult,
  Session,
  Mount,
  EnvVar,
  ToolOperation,
  ToolDefinition,
  BashletJsonOutput,
  SessionListItem,
} from "./types.js";

// Error exports
export {
  BashletError,
  CommandExecutionError,
  SessionError,
  ConfigurationError,
  BinaryNotFoundError,
  TimeoutError,
} from "./errors.js";

// Schema exports
export {
  // Zod schemas
  execSchema,
  readFileSchema,
  writeFileSchema,
  listDirSchema,
  type ExecInput,
  type ReadFileInput,
  type WriteFileInput,
  type ListDirInput,
  // JSON schemas
  execJsonSchema,
  readFileJsonSchema,
  writeFileJsonSchema,
  listDirJsonSchema,
  type JSONSchema,
} from "./schemas/index.js";

// Tool generator exports
export {
  // MCP
  generateMCPTools,
  createMCPServer,
  type MCPToolDefinition,
  type MCPToolContent,
  type MCPToolResult,
  type MCPToolHandler,
  // Vercel
  generateVercelTools,
  type VercelTool,
  type BashletVercelTools,
  type ExecOutput,
  type ReadFileOutput,
  type WriteFileOutput,
  type ListDirOutput,
  // OpenAI
  generateOpenAITools,
  getOpenAIToolDefinitions,
  createOpenAIToolHandler,
  type OpenAITool,
  type OpenAIToolWithHandler,
  // Generic
  generateGenericTools,
  createToolRegistry,
  type GenericTool,
  type ExecArgs,
  type ReadFileArgs,
  type WriteFileArgs,
  type ListDirArgs,
  type ExecResult,
  type WriteFileResult,
} from "./tools/index.js";
