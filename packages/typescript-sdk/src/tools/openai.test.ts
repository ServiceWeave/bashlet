import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateOpenAITools,
  getOpenAIToolDefinitions,
  createOpenAIToolHandler,
} from "./openai.js";
import type { Bashlet } from "../client.js";

// Create a mock Bashlet client
function createMockClient(): Bashlet {
  return {
    exec: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    listDir: vi.fn(),
  } as unknown as Bashlet;
}

describe("generateOpenAITools", () => {
  let mockClient: Bashlet;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it("should generate 4 tools", () => {
    const tools = generateOpenAITools(mockClient);
    expect(tools).toHaveLength(4);
  });

  it("should generate tools with correct structure", () => {
    const tools = generateOpenAITools(mockClient);
    for (const tool of tools) {
      expect(tool.type).toBe("function");
      expect(tool.function).toBeDefined();
      expect(tool.function.name).toBeDefined();
      expect(tool.function.description).toBeDefined();
      expect(tool.function.parameters).toBeDefined();
      expect(tool.handler).toBeDefined();
      expect(typeof tool.handler).toBe("function");
    }
  });

  it("should generate tools with correct names", () => {
    const tools = generateOpenAITools(mockClient);
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("bashlet_exec");
    expect(names).toContain("bashlet_read_file");
    expect(names).toContain("bashlet_write_file");
    expect(names).toContain("bashlet_list_dir");
  });

  describe("bashlet_exec handler", () => {
    it("should execute command and return JSON result", async () => {
      vi.mocked(mockClient.exec).mockResolvedValue({
        stdout: "hello\n",
        stderr: "",
        exitCode: 0,
      });

      const tools = generateOpenAITools(mockClient);
      const execTool = tools.find((t) => t.function.name === "bashlet_exec")!;
      const result = await execTool.handler({ command: "echo hello" });

      expect(mockClient.exec).toHaveBeenCalledWith("echo hello", {
        workdir: undefined,
      });

      const parsed = JSON.parse(result);
      expect(parsed.stdout).toBe("hello\n");
      expect(parsed.stderr).toBe("");
      expect(parsed.exitCode).toBe(0);
    });

    it("should pass workdir option", async () => {
      vi.mocked(mockClient.exec).mockResolvedValue({
        stdout: "",
        stderr: "",
        exitCode: 0,
      });

      const tools = generateOpenAITools(mockClient);
      const execTool = tools.find((t) => t.function.name === "bashlet_exec")!;
      await execTool.handler({ command: "ls", workdir: "/workspace" });

      expect(mockClient.exec).toHaveBeenCalledWith("ls", {
        workdir: "/workspace",
      });
    });
  });

  describe("bashlet_read_file handler", () => {
    it("should read file and return content", async () => {
      vi.mocked(mockClient.readFile).mockResolvedValue("file content");

      const tools = generateOpenAITools(mockClient);
      const tool = tools.find(
        (t) => t.function.name === "bashlet_read_file"
      )!;
      const result = await tool.handler({ path: "/file.txt" });

      expect(mockClient.readFile).toHaveBeenCalledWith("/file.txt");
      expect(result).toBe("file content");
    });
  });

  describe("bashlet_write_file handler", () => {
    it("should write file and return success JSON", async () => {
      vi.mocked(mockClient.writeFile).mockResolvedValue(undefined);

      const tools = generateOpenAITools(mockClient);
      const tool = tools.find(
        (t) => t.function.name === "bashlet_write_file"
      )!;
      const result = await tool.handler({
        path: "/file.txt",
        content: "new content",
      });

      expect(mockClient.writeFile).toHaveBeenCalledWith(
        "/file.txt",
        "new content"
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.path).toBe("/file.txt");
    });
  });

  describe("bashlet_list_dir handler", () => {
    it("should list directory and return content", async () => {
      const listing = "file1.txt\nfile2.txt";
      vi.mocked(mockClient.listDir).mockResolvedValue(listing);

      const tools = generateOpenAITools(mockClient);
      const tool = tools.find((t) => t.function.name === "bashlet_list_dir")!;
      const result = await tool.handler({ path: "/workspace" });

      expect(mockClient.listDir).toHaveBeenCalledWith("/workspace");
      expect(result).toBe(listing);
    });
  });
});

describe("getOpenAIToolDefinitions", () => {
  let mockClient: Bashlet;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it("should return tool definitions without handlers", () => {
    const tools = getOpenAIToolDefinitions(mockClient);
    expect(tools).toHaveLength(4);

    for (const tool of tools) {
      expect(tool.type).toBe("function");
      expect(tool.function).toBeDefined();
      expect(tool.function.name).toBeDefined();
      expect(tool.function.description).toBeDefined();
      expect(tool.function.parameters).toBeDefined();
      // Should not have handler
      expect((tool as Record<string, unknown>).handler).toBeUndefined();
    }
  });

  it("should be usable with OpenAI API format", () => {
    const tools = getOpenAIToolDefinitions(mockClient);
    for (const tool of tools) {
      // OpenAI expects this exact structure
      expect(tool).toEqual({
        type: "function",
        function: {
          name: expect.any(String),
          description: expect.any(String),
          parameters: expect.any(Object),
        },
      });
    }
  });
});

describe("createOpenAIToolHandler", () => {
  let mockClient: Bashlet;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it("should return a handler function", () => {
    const handler = createOpenAIToolHandler(mockClient);
    expect(typeof handler).toBe("function");
  });

  it("should handle bashlet_exec tool call", async () => {
    vi.mocked(mockClient.exec).mockResolvedValue({
      stdout: "output",
      stderr: "",
      exitCode: 0,
    });

    const handler = createOpenAIToolHandler(mockClient);
    const result = await handler("bashlet_exec", { command: "ls" });

    expect(mockClient.exec).toHaveBeenCalled();
    const parsed = JSON.parse(result);
    expect(parsed.stdout).toBe("output");
  });

  it("should handle bashlet_read_file tool call", async () => {
    vi.mocked(mockClient.readFile).mockResolvedValue("content");

    const handler = createOpenAIToolHandler(mockClient);
    const result = await handler("bashlet_read_file", { path: "/file" });

    expect(result).toBe("content");
  });

  it("should handle bashlet_write_file tool call", async () => {
    vi.mocked(mockClient.writeFile).mockResolvedValue(undefined);

    const handler = createOpenAIToolHandler(mockClient);
    const result = await handler("bashlet_write_file", {
      path: "/file",
      content: "data",
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
  });

  it("should handle bashlet_list_dir tool call", async () => {
    vi.mocked(mockClient.listDir).mockResolvedValue("files");

    const handler = createOpenAIToolHandler(mockClient);
    const result = await handler("bashlet_list_dir", { path: "/" });

    expect(result).toBe("files");
  });

  it("should throw error for unknown tool", async () => {
    const handler = createOpenAIToolHandler(mockClient);
    await expect(handler("unknown_tool", {})).rejects.toThrow("Unknown tool");
  });
});

describe("OpenAI tool parameters", () => {
  let mockClient: Bashlet;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it("exec tool should have command required", () => {
    const tools = generateOpenAITools(mockClient);
    const execTool = tools.find((t) => t.function.name === "bashlet_exec")!;
    expect(execTool.function.parameters.required).toContain("command");
  });

  it("read_file tool should have path required", () => {
    const tools = generateOpenAITools(mockClient);
    const tool = tools.find((t) => t.function.name === "bashlet_read_file")!;
    expect(tool.function.parameters.required).toContain("path");
  });

  it("write_file tool should have path and content required", () => {
    const tools = generateOpenAITools(mockClient);
    const tool = tools.find((t) => t.function.name === "bashlet_write_file")!;
    expect(tool.function.parameters.required).toContain("path");
    expect(tool.function.parameters.required).toContain("content");
  });

  it("list_dir tool should have path required", () => {
    const tools = generateOpenAITools(mockClient);
    const tool = tools.find((t) => t.function.name === "bashlet_list_dir")!;
    expect(tool.function.parameters.required).toContain("path");
  });
});
