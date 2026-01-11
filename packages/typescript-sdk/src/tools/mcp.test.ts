import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateMCPTools, createMCPServer } from "./mcp.js";
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

describe("generateMCPTools", () => {
  let mockClient: Bashlet;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it("should generate 4 tools", () => {
    const tools = generateMCPTools(mockClient);
    expect(tools).toHaveLength(4);
  });

  it("should generate tools with correct names", () => {
    const tools = generateMCPTools(mockClient);
    const names = tools.map((t) => t.definition.name);
    expect(names).toContain("bashlet_exec");
    expect(names).toContain("bashlet_read_file");
    expect(names).toContain("bashlet_write_file");
    expect(names).toContain("bashlet_list_dir");
  });

  it("should generate tools with descriptions", () => {
    const tools = generateMCPTools(mockClient);
    for (const tool of tools) {
      expect(tool.definition.description).toBeDefined();
      expect(tool.definition.description.length).toBeGreaterThan(0);
    }
  });

  it("should generate tools with input schemas", () => {
    const tools = generateMCPTools(mockClient);
    for (const tool of tools) {
      expect(tool.definition.inputSchema).toBeDefined();
      expect(tool.definition.inputSchema.type).toBe("object");
    }
  });

  describe("bashlet_exec handler", () => {
    it("should execute command and return result", async () => {
      vi.mocked(mockClient.exec).mockResolvedValue({
        stdout: "hello\n",
        stderr: "",
        exitCode: 0,
      });

      const tools = generateMCPTools(mockClient);
      const execTool = tools.find((t) => t.definition.name === "bashlet_exec")!;
      const result = await execTool.handler({ command: "echo hello" });

      expect(mockClient.exec).toHaveBeenCalledWith("echo hello", {
        workdir: undefined,
      });
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.isError).toBeUndefined();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.stdout).toBe("hello\n");
      expect(parsed.exitCode).toBe(0);
    });

    it("should pass workdir option", async () => {
      vi.mocked(mockClient.exec).mockResolvedValue({
        stdout: "",
        stderr: "",
        exitCode: 0,
      });

      const tools = generateMCPTools(mockClient);
      const execTool = tools.find((t) => t.definition.name === "bashlet_exec")!;
      await execTool.handler({ command: "ls", workdir: "/workspace" });

      expect(mockClient.exec).toHaveBeenCalledWith("ls", {
        workdir: "/workspace",
      });
    });

    it("should return error on failure", async () => {
      vi.mocked(mockClient.exec).mockRejectedValue(new Error("Exec failed"));

      const tools = generateMCPTools(mockClient);
      const execTool = tools.find((t) => t.definition.name === "bashlet_exec")!;
      const result = await execTool.handler({ command: "bad" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Exec failed");
    });
  });

  describe("bashlet_read_file handler", () => {
    it("should read file and return content", async () => {
      vi.mocked(mockClient.readFile).mockResolvedValue("file content");

      const tools = generateMCPTools(mockClient);
      const tool = tools.find((t) => t.definition.name === "bashlet_read_file")!;
      const result = await tool.handler({ path: "/file.txt" });

      expect(mockClient.readFile).toHaveBeenCalledWith("/file.txt");
      expect(result.content[0].text).toBe("file content");
      expect(result.isError).toBeUndefined();
    });

    it("should return error on failure", async () => {
      vi.mocked(mockClient.readFile).mockRejectedValue(new Error("Not found"));

      const tools = generateMCPTools(mockClient);
      const tool = tools.find((t) => t.definition.name === "bashlet_read_file")!;
      const result = await tool.handler({ path: "/missing" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not found");
    });
  });

  describe("bashlet_write_file handler", () => {
    it("should write file and return success", async () => {
      vi.mocked(mockClient.writeFile).mockResolvedValue(undefined);

      const tools = generateMCPTools(mockClient);
      const tool = tools.find(
        (t) => t.definition.name === "bashlet_write_file"
      )!;
      const result = await tool.handler({
        path: "/file.txt",
        content: "new content",
      });

      expect(mockClient.writeFile).toHaveBeenCalledWith(
        "/file.txt",
        "new content"
      );
      expect(result.content[0].text).toContain("Successfully wrote");
      expect(result.isError).toBeUndefined();
    });

    it("should return error on failure", async () => {
      vi.mocked(mockClient.writeFile).mockRejectedValue(
        new Error("Permission denied")
      );

      const tools = generateMCPTools(mockClient);
      const tool = tools.find(
        (t) => t.definition.name === "bashlet_write_file"
      )!;
      const result = await tool.handler({ path: "/file", content: "x" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Permission denied");
    });
  });

  describe("bashlet_list_dir handler", () => {
    it("should list directory and return content", async () => {
      const listing = "file1.txt\nfile2.txt";
      vi.mocked(mockClient.listDir).mockResolvedValue(listing);

      const tools = generateMCPTools(mockClient);
      const tool = tools.find((t) => t.definition.name === "bashlet_list_dir")!;
      const result = await tool.handler({ path: "/workspace" });

      expect(mockClient.listDir).toHaveBeenCalledWith("/workspace");
      expect(result.content[0].text).toBe(listing);
      expect(result.isError).toBeUndefined();
    });

    it("should return error on failure", async () => {
      vi.mocked(mockClient.listDir).mockRejectedValue(
        new Error("Directory not found")
      );

      const tools = generateMCPTools(mockClient);
      const tool = tools.find((t) => t.definition.name === "bashlet_list_dir")!;
      const result = await tool.handler({ path: "/missing" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Directory not found");
    });
  });
});

describe("createMCPServer", () => {
  let mockClient: Bashlet;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it("should return tools and handleToolCall", () => {
    const server = createMCPServer(mockClient);
    expect(server.tools).toBeDefined();
    expect(server.handleToolCall).toBeDefined();
    expect(typeof server.handleToolCall).toBe("function");
  });

  it("should return 4 tool definitions", () => {
    const server = createMCPServer(mockClient);
    expect(server.tools).toHaveLength(4);
  });

  it("should handle valid tool calls", async () => {
    vi.mocked(mockClient.exec).mockResolvedValue({
      stdout: "output",
      stderr: "",
      exitCode: 0,
    });

    const server = createMCPServer(mockClient);
    const result = await server.handleToolCall("bashlet_exec", {
      command: "ls",
    });

    expect(result.content).toHaveLength(1);
    expect(result.isError).toBeUndefined();
  });

  it("should return error for unknown tool", async () => {
    const server = createMCPServer(mockClient);
    const result = await server.handleToolCall("unknown_tool", {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool");
  });

  it("tools should have proper MCP structure", () => {
    const server = createMCPServer(mockClient);
    for (const tool of server.tools) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });
});
