// MCP tools
export {
  generateMCPTools,
  createMCPServer,
  type MCPToolDefinition,
  type MCPToolContent,
  type MCPToolResult,
  type MCPToolHandler,
} from "./mcp.js";

// Vercel AI SDK tools
export {
  generateVercelTools,
  type VercelTool,
  type BashletVercelTools,
  type ExecOutput,
  type ReadFileOutput,
  type WriteFileOutput,
  type ListDirOutput,
} from "./vercel.js";

// OpenAI function calling tools
export {
  generateOpenAITools,
  getOpenAIToolDefinitions,
  createOpenAIToolHandler,
  type OpenAITool,
  type OpenAIToolWithHandler,
} from "./openai.js";

// Generic/framework-agnostic tools
export {
  generateGenericTools,
  createToolRegistry,
  type GenericTool,
  type ExecArgs,
  type ReadFileArgs,
  type WriteFileArgs,
  type ListDirArgs,
  type ExecResult,
  type WriteFileResult,
} from "./generic.js";
