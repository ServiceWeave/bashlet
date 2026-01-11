/**
 * JSON Schema type definition (simplified for our needs)
 */
export interface JSONSchema {
  type: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JSONSchema;
  enum?: string[];
}

/**
 * JSON Schema for bashlet_exec tool input
 */
export const execJsonSchema: JSONSchema = {
  type: "object",
  properties: {
    command: {
      type: "string",
      description: "The shell command to execute in the sandbox",
    },
    workdir: {
      type: "string",
      description: "Working directory inside the sandbox (default: /workspace)",
    },
  },
  required: ["command"],
  additionalProperties: false,
};

/**
 * JSON Schema for bashlet_read_file tool input
 */
export const readFileJsonSchema: JSONSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Absolute path to the file inside the sandbox",
    },
  },
  required: ["path"],
  additionalProperties: false,
};

/**
 * JSON Schema for bashlet_write_file tool input
 */
export const writeFileJsonSchema: JSONSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Absolute path to the file inside the sandbox",
    },
    content: {
      type: "string",
      description: "Content to write to the file",
    },
  },
  required: ["path", "content"],
  additionalProperties: false,
};

/**
 * JSON Schema for bashlet_list_dir tool input
 */
export const listDirJsonSchema: JSONSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Absolute path to the directory inside the sandbox",
    },
  },
  required: ["path"],
  additionalProperties: false,
};
