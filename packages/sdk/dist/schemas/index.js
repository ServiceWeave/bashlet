import { z } from 'zod';

// src/schemas/zod.ts
var execSchema = z.object({
  command: z.string().describe("The shell command to execute in the sandbox"),
  workdir: z.string().optional().describe("Working directory inside the sandbox (default: /workspace)")
});
var readFileSchema = z.object({
  path: z.string().describe("Absolute path to the file inside the sandbox")
});
var writeFileSchema = z.object({
  path: z.string().describe("Absolute path to the file inside the sandbox"),
  content: z.string().describe("Content to write to the file")
});
var listDirSchema = z.object({
  path: z.string().describe("Absolute path to the directory inside the sandbox")
});

// src/schemas/json-schema.ts
var execJsonSchema = {
  type: "object",
  properties: {
    command: {
      type: "string",
      description: "The shell command to execute in the sandbox"
    },
    workdir: {
      type: "string",
      description: "Working directory inside the sandbox (default: /workspace)"
    }
  },
  required: ["command"],
  additionalProperties: false
};
var readFileJsonSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Absolute path to the file inside the sandbox"
    }
  },
  required: ["path"],
  additionalProperties: false
};
var writeFileJsonSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Absolute path to the file inside the sandbox"
    },
    content: {
      type: "string",
      description: "Content to write to the file"
    }
  },
  required: ["path", "content"],
  additionalProperties: false
};
var listDirJsonSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Absolute path to the directory inside the sandbox"
    }
  },
  required: ["path"],
  additionalProperties: false
};

export { execJsonSchema, execSchema, listDirJsonSchema, listDirSchema, readFileJsonSchema, readFileSchema, writeFileJsonSchema, writeFileSchema };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map