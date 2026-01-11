'use strict';

var zod = require('zod');

// src/schemas/zod.ts
var execSchema = zod.z.object({
  command: zod.z.string().describe("The shell command to execute in the sandbox"),
  workdir: zod.z.string().optional().describe("Working directory inside the sandbox (default: /workspace)")
});
var readFileSchema = zod.z.object({
  path: zod.z.string().describe("Absolute path to the file inside the sandbox")
});
var writeFileSchema = zod.z.object({
  path: zod.z.string().describe("Absolute path to the file inside the sandbox"),
  content: zod.z.string().describe("Content to write to the file")
});
var listDirSchema = zod.z.object({
  path: zod.z.string().describe("Absolute path to the directory inside the sandbox")
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

exports.execJsonSchema = execJsonSchema;
exports.execSchema = execSchema;
exports.listDirJsonSchema = listDirJsonSchema;
exports.listDirSchema = listDirSchema;
exports.readFileJsonSchema = readFileJsonSchema;
exports.readFileSchema = readFileSchema;
exports.writeFileJsonSchema = writeFileJsonSchema;
exports.writeFileSchema = writeFileSchema;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map