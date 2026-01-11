import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateVercelTools } from "./vercel.js";
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

describe("generateVercelTools", () => {
  let mockClient: Bashlet;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it("should generate 4 tools", () => {
    const tools = generateVercelTools(mockClient);
    expect(Object.keys(tools)).toHaveLength(4);
  });

  it("should generate tools with correct keys", () => {
    const tools = generateVercelTools(mockClient);
    expect(tools.bashlet_exec).toBeDefined();
    expect(tools.bashlet_read_file).toBeDefined();
    expect(tools.bashlet_write_file).toBeDefined();
    expect(tools.bashlet_list_dir).toBeDefined();
  });

  it("should generate tools with correct structure", () => {
    const tools = generateVercelTools(mockClient);
    for (const tool of Object.values(tools)) {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.parameters).toBeDefined();
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

      const tools = generateVercelTools(mockClient);
      const result = await tools.bashlet_exec.execute({ command: "echo hello" });

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

      const tools = generateVercelTools(mockClient);
      await tools.bashlet_exec.execute({
        command: "ls",
        workdir: "/workspace",
      });

      expect(mockClient.exec).toHaveBeenCalledWith("ls", {
        workdir: "/workspace",
      });
    });

    it("should return non-zero exit code", async () => {
      vi.mocked(mockClient.exec).mockResolvedValue({
        stdout: "",
        stderr: "error",
        exitCode: 1,
      });

      const tools = generateVercelTools(mockClient);
      const result = await tools.bashlet_exec.execute({ command: "false" });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("error");
    });

    it("should have Zod schema parameters", () => {
      const tools = generateVercelTools(mockClient);
      expect(tools.bashlet_exec.parameters).toBeDefined();
      // Zod schema should have _def property
      expect(
        (tools.bashlet_exec.parameters as unknown as Record<string, unknown>)._def
      ).toBeDefined();
    });
  });

  describe("bashlet_read_file tool", () => {
    it("should read file and return content", async () => {
      vi.mocked(mockClient.readFile).mockResolvedValue("file content");

      const tools = generateVercelTools(mockClient);
      const result = await tools.bashlet_read_file.execute({
        path: "/file.txt",
      });

      expect(mockClient.readFile).toHaveBeenCalledWith("/file.txt");
      expect(result.content).toBe("file content");
    });

    it("should handle empty files", async () => {
      vi.mocked(mockClient.readFile).mockResolvedValue("");

      const tools = generateVercelTools(mockClient);
      const result = await tools.bashlet_read_file.execute({ path: "/empty" });

      expect(result.content).toBe("");
    });

    it("should propagate errors", async () => {
      vi.mocked(mockClient.readFile).mockRejectedValue(new Error("Not found"));

      const tools = generateVercelTools(mockClient);
      await expect(
        tools.bashlet_read_file.execute({ path: "/missing" })
      ).rejects.toThrow("Not found");
    });
  });

  describe("bashlet_write_file tool", () => {
    it("should write file and return success", async () => {
      vi.mocked(mockClient.writeFile).mockResolvedValue(undefined);

      const tools = generateVercelTools(mockClient);
      const result = await tools.bashlet_write_file.execute({
        path: "/file.txt",
        content: "new content",
      });

      expect(mockClient.writeFile).toHaveBeenCalledWith(
        "/file.txt",
        "new content"
      );
      expect(result.success).toBe(true);
      expect(result.path).toBe("/file.txt");
    });

    it("should handle empty content", async () => {
      vi.mocked(mockClient.writeFile).mockResolvedValue(undefined);

      const tools = generateVercelTools(mockClient);
      const result = await tools.bashlet_write_file.execute({
        path: "/file.txt",
        content: "",
      });

      expect(result.success).toBe(true);
    });

    it("should propagate errors", async () => {
      vi.mocked(mockClient.writeFile).mockRejectedValue(
        new Error("Permission denied")
      );

      const tools = generateVercelTools(mockClient);
      await expect(
        tools.bashlet_write_file.execute({ path: "/file", content: "x" })
      ).rejects.toThrow("Permission denied");
    });
  });

  describe("bashlet_list_dir tool", () => {
    it("should list directory and return listing", async () => {
      const listing = "file1.txt\nfile2.txt";
      vi.mocked(mockClient.listDir).mockResolvedValue(listing);

      const tools = generateVercelTools(mockClient);
      const result = await tools.bashlet_list_dir.execute({
        path: "/workspace",
      });

      expect(mockClient.listDir).toHaveBeenCalledWith("/workspace");
      expect(result.listing).toBe(listing);
    });

    it("should handle empty directories", async () => {
      vi.mocked(mockClient.listDir).mockResolvedValue("");

      const tools = generateVercelTools(mockClient);
      const result = await tools.bashlet_list_dir.execute({ path: "/empty" });

      expect(result.listing).toBe("");
    });

    it("should propagate errors", async () => {
      vi.mocked(mockClient.listDir).mockRejectedValue(
        new Error("Directory not found")
      );

      const tools = generateVercelTools(mockClient);
      await expect(
        tools.bashlet_list_dir.execute({ path: "/missing" })
      ).rejects.toThrow("Directory not found");
    });
  });
});

describe("Vercel tool descriptions", () => {
  let mockClient: Bashlet;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it("exec tool should have meaningful description", () => {
    const tools = generateVercelTools(mockClient);
    expect(tools.bashlet_exec.description).toContain("shell");
    expect(tools.bashlet_exec.description).toContain("sandbox");
  });

  it("read_file tool should have meaningful description", () => {
    const tools = generateVercelTools(mockClient);
    expect(tools.bashlet_read_file.description).toContain("Read");
    expect(tools.bashlet_read_file.description).toContain("file");
  });

  it("write_file tool should have meaningful description", () => {
    const tools = generateVercelTools(mockClient);
    expect(tools.bashlet_write_file.description).toContain("Write");
    expect(tools.bashlet_write_file.description).toContain("file");
  });

  it("list_dir tool should have meaningful description", () => {
    const tools = generateVercelTools(mockClient);
    expect(tools.bashlet_list_dir.description).toContain("List");
    expect(tools.bashlet_list_dir.description).toContain("directory");
  });
});

describe("Vercel AI SDK compatibility", () => {
  let mockClient: Bashlet;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it("tools should work as object for Vercel SDK", () => {
    const tools = generateVercelTools(mockClient);

    // Vercel SDK expects tools as an object with tool names as keys
    expect(typeof tools).toBe("object");
    expect(tools).not.toBeInstanceOf(Array);
  });

  it("each tool should have required properties", () => {
    const tools = generateVercelTools(mockClient);

    for (const [name, tool] of Object.entries(tools)) {
      expect(name).toMatch(/^bashlet_/);
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.execute).toBeDefined();
    }
  });
});
