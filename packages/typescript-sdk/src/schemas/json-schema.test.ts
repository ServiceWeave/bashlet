import { describe, it, expect } from "vitest";
import {
  execJsonSchema,
  readFileJsonSchema,
  writeFileJsonSchema,
  listDirJsonSchema,
  type JSONSchema,
} from "./json-schema.js";

describe("execJsonSchema", () => {
  it("should have correct structure", () => {
    expect(execJsonSchema.type).toBe("object");
    expect(execJsonSchema.properties).toBeDefined();
    expect(execJsonSchema.required).toContain("command");
    expect(execJsonSchema.additionalProperties).toBe(false);
  });

  it("should define command property", () => {
    const command = execJsonSchema.properties!.command;
    expect(command.type).toBe("string");
    expect(command.description).toBeDefined();
    expect(command.description).toContain("command");
  });

  it("should define optional workdir property", () => {
    const workdir = execJsonSchema.properties!.workdir;
    expect(workdir.type).toBe("string");
    expect(workdir.description).toBeDefined();
    expect(execJsonSchema.required).not.toContain("workdir");
  });

  it("should not require workdir", () => {
    expect(execJsonSchema.required).toEqual(["command"]);
  });
});

describe("readFileJsonSchema", () => {
  it("should have correct structure", () => {
    expect(readFileJsonSchema.type).toBe("object");
    expect(readFileJsonSchema.properties).toBeDefined();
    expect(readFileJsonSchema.required).toContain("path");
    expect(readFileJsonSchema.additionalProperties).toBe(false);
  });

  it("should define path property", () => {
    const path = readFileJsonSchema.properties!.path;
    expect(path.type).toBe("string");
    expect(path.description).toBeDefined();
    expect(path.description).toContain("path");
  });

  it("should only require path", () => {
    expect(readFileJsonSchema.required).toEqual(["path"]);
  });
});

describe("writeFileJsonSchema", () => {
  it("should have correct structure", () => {
    expect(writeFileJsonSchema.type).toBe("object");
    expect(writeFileJsonSchema.properties).toBeDefined();
    expect(writeFileJsonSchema.required).toContain("path");
    expect(writeFileJsonSchema.required).toContain("content");
    expect(writeFileJsonSchema.additionalProperties).toBe(false);
  });

  it("should define path property", () => {
    const path = writeFileJsonSchema.properties!.path;
    expect(path.type).toBe("string");
    expect(path.description).toBeDefined();
  });

  it("should define content property", () => {
    const content = writeFileJsonSchema.properties!.content;
    expect(content.type).toBe("string");
    expect(content.description).toBeDefined();
    expect(content.description!.toLowerCase()).toContain("content");
  });

  it("should require both path and content", () => {
    expect(writeFileJsonSchema.required).toEqual(
      expect.arrayContaining(["path", "content"])
    );
  });
});

describe("listDirJsonSchema", () => {
  it("should have correct structure", () => {
    expect(listDirJsonSchema.type).toBe("object");
    expect(listDirJsonSchema.properties).toBeDefined();
    expect(listDirJsonSchema.required).toContain("path");
    expect(listDirJsonSchema.additionalProperties).toBe(false);
  });

  it("should define path property", () => {
    const path = listDirJsonSchema.properties!.path;
    expect(path.type).toBe("string");
    expect(path.description).toBeDefined();
    expect(path.description).toContain("directory");
  });

  it("should only require path", () => {
    expect(listDirJsonSchema.required).toEqual(["path"]);
  });
});

describe("JSONSchema type", () => {
  it("should allow creating valid schemas", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    };

    expect(schema.type).toBe("object");
    expect(schema.properties?.name?.type).toBe("string");
  });

  it("should support nested schemas", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: {
            value: { type: "string" },
          },
        },
      },
    };

    expect(schema.properties?.nested?.type).toBe("object");
  });

  it("should support array types", () => {
    const schema: JSONSchema = {
      type: "array",
      items: { type: "string" },
    };

    expect(schema.type).toBe("array");
    expect(schema.items?.type).toBe("string");
  });

  it("should support enum types", () => {
    const schema: JSONSchema = {
      type: "string",
      enum: ["a", "b", "c"],
    };

    expect(schema.enum).toEqual(["a", "b", "c"]);
  });
});

describe("schema consistency", () => {
  it("all schemas should be objects", () => {
    expect(execJsonSchema.type).toBe("object");
    expect(readFileJsonSchema.type).toBe("object");
    expect(writeFileJsonSchema.type).toBe("object");
    expect(listDirJsonSchema.type).toBe("object");
  });

  it("all schemas should disallow additional properties", () => {
    expect(execJsonSchema.additionalProperties).toBe(false);
    expect(readFileJsonSchema.additionalProperties).toBe(false);
    expect(writeFileJsonSchema.additionalProperties).toBe(false);
    expect(listDirJsonSchema.additionalProperties).toBe(false);
  });

  it("all schemas should have required array", () => {
    expect(Array.isArray(execJsonSchema.required)).toBe(true);
    expect(Array.isArray(readFileJsonSchema.required)).toBe(true);
    expect(Array.isArray(writeFileJsonSchema.required)).toBe(true);
    expect(Array.isArray(listDirJsonSchema.required)).toBe(true);
  });

  it("all property descriptions should be non-empty strings", () => {
    const checkProperties = (schema: JSONSchema) => {
      for (const [, prop] of Object.entries(schema.properties ?? {})) {
        expect(typeof prop.description).toBe("string");
        expect(prop.description!.length).toBeGreaterThan(0);
      }
    };

    checkProperties(execJsonSchema);
    checkProperties(readFileJsonSchema);
    checkProperties(writeFileJsonSchema);
    checkProperties(listDirJsonSchema);
  });
});
