// Zod schemas (for Vercel AI SDK)
export {
  execSchema,
  readFileSchema,
  writeFileSchema,
  listDirSchema,
  type ExecInput,
  type ReadFileInput,
  type WriteFileInput,
  type ListDirInput,
} from "./zod.js";

// JSON schemas (for MCP, OpenAI)
export {
  execJsonSchema,
  readFileJsonSchema,
  writeFileJsonSchema,
  listDirJsonSchema,
  type JSONSchema,
} from "./json-schema.js";
