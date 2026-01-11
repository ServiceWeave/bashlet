import { describe, it, expect } from "vitest";
import {
  execSchema,
  readFileSchema,
  writeFileSchema,
  listDirSchema,
  type ExecInput,
  type ReadFileInput,
  type WriteFileInput,
  type ListDirInput,
} from "./zod.js";

describe("execSchema", () => {
  it("should accept valid input with command only", () => {
    const input = { command: "echo hello" };
    const result = execSchema.parse(input);
    expect(result.command).toBe("echo hello");
    expect(result.workdir).toBeUndefined();
  });

  it("should accept valid input with command and workdir", () => {
    const input = { command: "ls -la", workdir: "/workspace" };
    const result = execSchema.parse(input);
    expect(result.command).toBe("ls -la");
    expect(result.workdir).toBe("/workspace");
  });

  it("should reject input without command", () => {
    expect(() => execSchema.parse({})).toThrow();
    expect(() => execSchema.parse({ workdir: "/workspace" })).toThrow();
  });

  it("should reject non-string command", () => {
    expect(() => execSchema.parse({ command: 123 })).toThrow();
    expect(() => execSchema.parse({ command: null })).toThrow();
    expect(() => execSchema.parse({ command: undefined })).toThrow();
  });

  it("should reject non-string workdir", () => {
    expect(() =>
      execSchema.parse({ command: "ls", workdir: 123 })
    ).toThrow();
  });

  it("should have correct type inference", () => {
    const input: ExecInput = { command: "test", workdir: "/dir" };
    expect(input.command).toBe("test");
    expect(input.workdir).toBe("/dir");
  });
});

describe("readFileSchema", () => {
  it("should accept valid input", () => {
    const input = { path: "/workspace/file.txt" };
    const result = readFileSchema.parse(input);
    expect(result.path).toBe("/workspace/file.txt");
  });

  it("should reject input without path", () => {
    expect(() => readFileSchema.parse({})).toThrow();
  });

  it("should reject non-string path", () => {
    expect(() => readFileSchema.parse({ path: 123 })).toThrow();
    expect(() => readFileSchema.parse({ path: null })).toThrow();
  });

  it("should accept paths with special characters", () => {
    const input = { path: "/workspace/my file with spaces.txt" };
    const result = readFileSchema.parse(input);
    expect(result.path).toBe("/workspace/my file with spaces.txt");
  });

  it("should have correct type inference", () => {
    const input: ReadFileInput = { path: "/test" };
    expect(input.path).toBe("/test");
  });
});

describe("writeFileSchema", () => {
  it("should accept valid input", () => {
    const input = { path: "/workspace/file.txt", content: "hello world" };
    const result = writeFileSchema.parse(input);
    expect(result.path).toBe("/workspace/file.txt");
    expect(result.content).toBe("hello world");
  });

  it("should reject input without path", () => {
    expect(() => writeFileSchema.parse({ content: "test" })).toThrow();
  });

  it("should reject input without content", () => {
    expect(() => writeFileSchema.parse({ path: "/file" })).toThrow();
  });

  it("should reject non-string values", () => {
    expect(() =>
      writeFileSchema.parse({ path: 123, content: "test" })
    ).toThrow();
    expect(() =>
      writeFileSchema.parse({ path: "/file", content: 123 })
    ).toThrow();
  });

  it("should accept empty content", () => {
    const input = { path: "/file.txt", content: "" };
    const result = writeFileSchema.parse(input);
    expect(result.content).toBe("");
  });

  it("should accept multi-line content", () => {
    const content = "line1\nline2\nline3";
    const input = { path: "/file.txt", content };
    const result = writeFileSchema.parse(input);
    expect(result.content).toBe(content);
  });

  it("should have correct type inference", () => {
    const input: WriteFileInput = { path: "/test", content: "data" };
    expect(input.path).toBe("/test");
    expect(input.content).toBe("data");
  });
});

describe("listDirSchema", () => {
  it("should accept valid input", () => {
    const input = { path: "/workspace" };
    const result = listDirSchema.parse(input);
    expect(result.path).toBe("/workspace");
  });

  it("should reject input without path", () => {
    expect(() => listDirSchema.parse({})).toThrow();
  });

  it("should reject non-string path", () => {
    expect(() => listDirSchema.parse({ path: 123 })).toThrow();
  });

  it("should accept root path", () => {
    const input = { path: "/" };
    const result = listDirSchema.parse(input);
    expect(result.path).toBe("/");
  });

  it("should have correct type inference", () => {
    const input: ListDirInput = { path: "/dir" };
    expect(input.path).toBe("/dir");
  });
});

describe("schema descriptions", () => {
  it("execSchema should have descriptions", () => {
    const shape = execSchema.shape;
    expect(shape.command.description).toBeDefined();
    expect(shape.workdir.description).toBeDefined();
  });

  it("readFileSchema should have descriptions", () => {
    const shape = readFileSchema.shape;
    expect(shape.path.description).toBeDefined();
  });

  it("writeFileSchema should have descriptions", () => {
    const shape = writeFileSchema.shape;
    expect(shape.path.description).toBeDefined();
    expect(shape.content.description).toBeDefined();
  });

  it("listDirSchema should have descriptions", () => {
    const shape = listDirSchema.shape;
    expect(shape.path.description).toBeDefined();
  });
});
