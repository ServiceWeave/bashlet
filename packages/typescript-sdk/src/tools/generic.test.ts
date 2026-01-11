import { describe, it, expect, vi, beforeEach } from "vitest";
import {
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

describe("generateGenericTools", () => {
  let mockClient: Bashlet;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it("should generate 4 tools", () => {
    const tools = generateGenericTools(mockClient);
    expect(tools).toHaveLength(4);
  });

  it("should generate tools with correct names", () => {
    const tools = generateGenericTools(mockClient);
    const names = tools.map((t) => t.name);
    expect(names).toContain("bashlet_exec");
    expect(names).toContain("bashlet_read_file");
    expect(names).toContain("bashlet_write_file");
    expect(names).toContain("bashlet_list_dir");
  });

  it("should generate tools with descriptions", () => {
    const tools = generateGenericTools(mockClient);
    for (const tool of tools) {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("should generate tools with JSON Schema parameters", () => {
    const tools = generateGenericTools(mockClient);
    for (const tool of tools) {
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe("object");
      expect(tool.parameters.properties).toBeDefined();
    }
  });

  it("should generate tools with execute functions", () => {
    const tools = generateGenericTools(mockClient);
    for (const tool of tools) {
      expect(tool.execute).toBeDefined();
      expect(typeof tool.execute).toBe("function");
    }
  });

  describe("bashlet_exec tool", () => {
    it("should execute command and return result", async () => {
      vi.mocked(mockClient.exec).mockResolvedValue({
        stdout: "hello\n",
        stderr: "",
        exitCode: 0,
      });

      const tools = generateGenericTools(mockClient);
      const execTool = tools.find((t) => t.name === "bashlet_exec")!;
      const result = (await execTool.execute({
        command: "echo hello",
      })) as ExecResult;

      expect(mockClient.exec).toHaveBeenCalledWith("echo hello", {
        workdir: undefined,
      });
      expect(result.stdout).toBe("hello\n");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    });

    it("should pass workdir option", async () => {
      vi.mocked(mockClient.exec).mockResolvedValue({
        stdout: "",
        stderr: "",
        exitCode: 0,
      });

      const tools = generateGenericTools(mockClient);
      const execTool = tools.find((t) => t.name === "bashlet_exec")!;
      await execTool.execute({ command: "ls", workdir: "/workspace" });

      expect(mockClient.exec).toHaveBeenCalledWith("ls", {
        workdir: "/workspace",
      });
    });

    it("should return non-zero exit code", async () => {
      vi.mocked(mockClient.exec).mockResolvedValue({
        stdout: "",
        stderr: "error message",
        exitCode: 1,
      });

      const tools = generateGenericTools(mockClient);
      const execTool = tools.find((t) => t.name === "bashlet_exec")!;
      const result = (await execTool.execute({
        command: "false",
      })) as ExecResult;

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("error message");
    });

    it("should propagate errors", async () => {
      vi.mocked(mockClient.exec).mockRejectedValue(new Error("Exec failed"));

      const tools = generateGenericTools(mockClient);
      const execTool = tools.find((t) => t.name === "bashlet_exec")!;

      await expect(execTool.execute({ command: "bad" })).rejects.toThrow(
        "Exec failed"
      );
    });
  });

  describe("bashlet_read_file tool", () => {
    it("should read file and return content", async () => {
      vi.mocked(mockClient.readFile).mockResolvedValue("file content");

      const tools = generateGenericTools(mockClient);
      const tool = tools.find((t) => t.name === "bashlet_read_file")!;
      const result = await tool.execute({ path: "/file.txt" });

      expect(mockClient.readFile).toHaveBeenCalledWith("/file.txt");
      expect(result).toBe("file content");
    });

    it("should handle empty files", async () => {
      vi.mocked(mockClient.readFile).mockResolvedValue("");

      const tools = generateGenericTools(mockClient);
      const tool = tools.find((t) => t.name === "bashlet_read_file")!;
      const result = await tool.execute({ path: "/empty" });

      expect(result).toBe("");
    });

    it("should propagate errors", async () => {
      vi.mocked(mockClient.readFile).mockRejectedValue(new Error("Not found"));

      const tools = generateGenericTools(mockClient);
      const tool = tools.find((t) => t.name === "bashlet_read_file")!;

      await expect(tool.execute({ path: "/missing" })).rejects.toThrow(
        "Not found"
      );
    });
  });

  describe("bashlet_write_file tool", () => {
    it("should write file and return success", async () => {
      vi.mocked(mockClient.writeFile).mockResolvedValue(undefined);

      const tools = generateGenericTools(mockClient);
      const tool = tools.find((t) => t.name === "bashlet_write_file")!;
      const result = (await tool.execute({
        path: "/file.txt",
        content: "new content",
      })) as WriteFileResult;

      expect(mockClient.writeFile).toHaveBeenCalledWith(
        "/file.txt",
        "new content"
      );
      expect(result.success).toBe(true);
      expect(result.path).toBe("/file.txt");
    });

    it("should handle empty content", async () => {
      vi.mocked(mockClient.writeFile).mockResolvedValue(undefined);

      const tools = generateGenericTools(mockClient);
      const tool = tools.find((t) => t.name === "bashlet_write_file")!;
      const result = (await tool.execute({
        path: "/file.txt",
        content: "",
      })) as WriteFileResult;

      expect(result.success).toBe(true);
    });

    it("should propagate errors", async () => {
      vi.mocked(mockClient.writeFile).mockRejectedValue(
        new Error("Permission denied")
      );

      const tools = generateGenericTools(mockClient);
      const tool = tools.find((t) => t.name === "bashlet_write_file")!;

      await expect(
        tool.execute({ path: "/file", content: "x" })
      ).rejects.toThrow("Permission denied");
    });
  });

  describe("bashlet_list_dir tool", () => {
    it("should list directory and return content", async () => {
      const listing = "file1.txt\nfile2.txt";
      vi.mocked(mockClient.listDir).mockResolvedValue(listing);

      const tools = generateGenericTools(mockClient);
      const tool = tools.find((t) => t.name === "bashlet_list_dir")!;
      const result = await tool.execute({ path: "/workspace" });

      expect(mockClient.listDir).toHaveBeenCalledWith("/workspace");
      expect(result).toBe(listing);
    });

    it("should handle empty directories", async () => {
      vi.mocked(mockClient.listDir).mockResolvedValue("");

      const tools = generateGenericTools(mockClient);
      const tool = tools.find((t) => t.name === "bashlet_list_dir")!;
      const result = await tool.execute({ path: "/empty" });

      expect(result).toBe("");
    });

    it("should propagate errors", async () => {
      vi.mocked(mockClient.listDir).mockRejectedValue(
        new Error("Directory not found")
      );

      const tools = generateGenericTools(mockClient);
      const tool = tools.find((t) => t.name === "bashlet_list_dir")!;

      await expect(tool.execute({ path: "/missing" })).rejects.toThrow(
        "Directory not found"
      );
    });
  });
});

describe("createToolRegistry", () => {
  let mockClient: Bashlet;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it("should return registry with all methods", () => {
    const registry = createToolRegistry(mockClient);
    expect(registry.all).toBeDefined();
    expect(registry.get).toBeDefined();
    expect(registry.has).toBeDefined();
    expect(registry.execute).toBeDefined();
    expect(registry.names).toBeDefined();
  });

  describe("all()", () => {
    it("should return all tools", () => {
      const registry = createToolRegistry(mockClient);
      const tools = registry.all();
      expect(tools).toHaveLength(4);
    });
  });

  describe("get()", () => {
    it("should return tool by name", () => {
      const registry = createToolRegistry(mockClient);
      const tool = registry.get("bashlet_exec");
      expect(tool).toBeDefined();
      expect(tool?.name).toBe("bashlet_exec");
    });

    it("should return undefined for unknown tool", () => {
      const registry = createToolRegistry(mockClient);
      const tool = registry.get("unknown_tool");
      expect(tool).toBeUndefined();
    });
  });

  describe("has()", () => {
    it("should return true for existing tool", () => {
      const registry = createToolRegistry(mockClient);
      expect(registry.has("bashlet_exec")).toBe(true);
      expect(registry.has("bashlet_read_file")).toBe(true);
      expect(registry.has("bashlet_write_file")).toBe(true);
      expect(registry.has("bashlet_list_dir")).toBe(true);
    });

    it("should return false for unknown tool", () => {
      const registry = createToolRegistry(mockClient);
      expect(registry.has("unknown_tool")).toBe(false);
    });
  });

  describe("execute()", () => {
    it("should execute bashlet_exec tool", async () => {
      vi.mocked(mockClient.exec).mockResolvedValue({
        stdout: "output",
        stderr: "",
        exitCode: 0,
      });

      const registry = createToolRegistry(mockClient);
      const result = (await registry.execute("bashlet_exec", {
        command: "ls",
      })) as ExecResult;

      expect(result.stdout).toBe("output");
    });

    it("should execute bashlet_read_file tool", async () => {
      vi.mocked(mockClient.readFile).mockResolvedValue("content");

      const registry = createToolRegistry(mockClient);
      const result = await registry.execute("bashlet_read_file", {
        path: "/file",
      });

      expect(result).toBe("content");
    });

    it("should execute bashlet_write_file tool", async () => {
      vi.mocked(mockClient.writeFile).mockResolvedValue(undefined);

      const registry = createToolRegistry(mockClient);
      const result = (await registry.execute("bashlet_write_file", {
        path: "/file",
        content: "data",
      })) as WriteFileResult;

      expect(result.success).toBe(true);
    });

    it("should execute bashlet_list_dir tool", async () => {
      vi.mocked(mockClient.listDir).mockResolvedValue("files");

      const registry = createToolRegistry(mockClient);
      const result = await registry.execute("bashlet_list_dir", { path: "/" });

      expect(result).toBe("files");
    });

    it("should throw error for unknown tool", async () => {
      const registry = createToolRegistry(mockClient);

      await expect(registry.execute("unknown_tool", {})).rejects.toThrow(
        "Unknown tool: unknown_tool"
      );
    });
  });

  describe("names()", () => {
    it("should return all tool names", () => {
      const registry = createToolRegistry(mockClient);
      const names = registry.names();
      expect(names).toContain("bashlet_exec");
      expect(names).toContain("bashlet_read_file");
      expect(names).toContain("bashlet_write_file");
      expect(names).toContain("bashlet_list_dir");
      expect(names).toHaveLength(4);
    });
  });
});

describe("GenericTool type", () => {
  it("should be properly typed", () => {
    const mockClient = createMockClient();
    const tools = generateGenericTools(mockClient);

    // Type check - this should compile
    const execTool: GenericTool = tools[0];
    expect(execTool.name).toBeDefined();
    expect(execTool.description).toBeDefined();
    expect(execTool.parameters).toBeDefined();
    expect(execTool.execute).toBeDefined();
  });
});

describe("Input type interfaces", () => {
  it("ExecArgs should have correct shape", () => {
    const args: ExecArgs = { command: "ls", workdir: "/dir" };
    expect(args.command).toBe("ls");
    expect(args.workdir).toBe("/dir");
  });

  it("ExecArgs workdir should be optional", () => {
    const args: ExecArgs = { command: "ls" };
    expect(args.command).toBe("ls");
    expect(args.workdir).toBeUndefined();
  });

  it("ReadFileArgs should have correct shape", () => {
    const args: ReadFileArgs = { path: "/file.txt" };
    expect(args.path).toBe("/file.txt");
  });

  it("WriteFileArgs should have correct shape", () => {
    const args: WriteFileArgs = { path: "/file.txt", content: "data" };
    expect(args.path).toBe("/file.txt");
    expect(args.content).toBe("data");
  });

  it("ListDirArgs should have correct shape", () => {
    const args: ListDirArgs = { path: "/dir" };
    expect(args.path).toBe("/dir");
  });
});

describe("Output type interfaces", () => {
  it("ExecResult should have correct shape", () => {
    const result: ExecResult = { stdout: "out", stderr: "err", exitCode: 0 };
    expect(result.stdout).toBe("out");
    expect(result.stderr).toBe("err");
    expect(result.exitCode).toBe(0);
  });

  it("WriteFileResult should have correct shape", () => {
    const result: WriteFileResult = { success: true, path: "/file.txt" };
    expect(result.success).toBe(true);
    expect(result.path).toBe("/file.txt");
  });
});
