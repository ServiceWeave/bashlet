import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Bashlet } from "./client.js";
import {
  BashletError,
  CommandExecutionError,
  BinaryNotFoundError,
  TimeoutError,
} from "./errors.js";

// Mock execa
vi.mock("execa", () => ({
  execa: vi.fn(),
}));

import { execa } from "execa";

const mockedExeca = vi.mocked(execa);

describe("Bashlet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create instance with default options", () => {
      const bashlet = new Bashlet();
      expect(bashlet).toBeInstanceOf(Bashlet);
    });

    it("should accept custom binary path", () => {
      const bashlet = new Bashlet({ binaryPath: "/custom/path/bashlet" });
      expect(bashlet).toBeInstanceOf(Bashlet);
    });

    it("should accept all options", () => {
      const bashlet = new Bashlet({
        binaryPath: "/custom/bashlet",
        preset: "default",
        mounts: [{ hostPath: "/host", guestPath: "/guest" }],
        envVars: [{ key: "FOO", value: "bar" }],
        workdir: "/workspace",
        timeout: 60,
        configPath: "/config.yaml",
      });
      expect(bashlet).toBeInstanceOf(Bashlet);
    });
  });

  describe("exec", () => {
    it("should execute a simple command", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "hello\n", stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      const result = await bashlet.exec("echo hello");

      expect(result.stdout).toBe("hello\n");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);

      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining(["--format", "json", "exec", "echo hello"]),
        expect.any(Object)
      );
    });

    it("should execute command with workdir option", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "", stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await bashlet.exec("ls", { workdir: "/workspace" });

      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining(["--workdir", "/workspace"]),
        expect.any(Object)
      );
    });

    it("should execute command with mounts", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "", stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await bashlet.exec("ls", {
        mounts: [
          { hostPath: "/host", guestPath: "/guest" },
          { hostPath: "/host2", guestPath: "/guest2", readonly: true },
        ],
      });

      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining([
          "--mount",
          "/host:/guest",
          "--mount",
          "/host2:/guest2:ro",
        ]),
        expect.any(Object)
      );
    });

    it("should execute command with env vars", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "", stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await bashlet.exec("printenv", {
        envVars: [
          { key: "FOO", value: "bar" },
          { key: "BAZ", value: "qux" },
        ],
      });

      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining(["--env", "FOO=bar", "--env", "BAZ=qux"]),
        expect.any(Object)
      );
    });

    it("should execute command with preset", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "", stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await bashlet.exec("npm install", { preset: "node" });

      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining(["--preset", "node"]),
        expect.any(Object)
      );
    });

    it("should merge default options with exec options", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "", stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet({
        mounts: [{ hostPath: "/default", guestPath: "/default-guest" }],
        envVars: [{ key: "DEFAULT", value: "value" }],
      });

      await bashlet.exec("ls", {
        mounts: [{ hostPath: "/extra", guestPath: "/extra-guest" }],
        envVars: [{ key: "EXTRA", value: "value2" }],
      });

      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining([
          "--mount",
          "/default:/default-guest",
          "--mount",
          "/extra:/extra-guest",
          "--env",
          "DEFAULT=value",
          "--env",
          "EXTRA=value2",
        ]),
        expect.any(Object)
      );
    });

    it("should use config path when provided", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "", stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet({ configPath: "/my/config.yaml" });
      await bashlet.exec("ls");

      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining(["--config", "/my/config.yaml"]),
        expect.any(Object)
      );
    });

    it("should throw TimeoutError when command times out", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: "",
        stderr: "",
        exitCode: null,
        timedOut: true,
      } as never);

      const bashlet = new Bashlet();
      await expect(bashlet.exec("sleep 1000", { timeout: 1 })).rejects.toThrow(
        TimeoutError
      );
    });

    it("should throw BinaryNotFoundError when binary not found", async () => {
      const error = new Error("Command not found") as Error & { code: string };
      error.code = "ENOENT";
      mockedExeca.mockRejectedValueOnce(error);

      const bashlet = new Bashlet();
      await expect(bashlet.exec("echo hello")).rejects.toThrow(
        BinaryNotFoundError
      );
    });

    it("should throw BashletError on JSON error response", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ error: "Something went wrong" }),
        stderr: "",
        exitCode: 1,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await expect(bashlet.exec("bad command")).rejects.toThrow(BashletError);
    });

    it("should handle non-JSON output gracefully", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: "plain text output",
        stderr: "some error",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      const result = await bashlet.exec("echo test");

      expect(result.stdout).toBe("plain text output");
      expect(result.stderr).toBe("some error");
      expect(result.exitCode).toBe(0);
    });

    it("should handle command with non-zero exit code", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "", stderr: "error", exit_code: 1 }),
        stderr: "",
        exitCode: 1,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      const result = await bashlet.exec("false");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("error");
    });
  });

  describe("createSession", () => {
    it("should create a session", async () => {
      // The CLI returns JSON wrapped in BashletJsonOutput format
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({
          stdout: JSON.stringify({ id: "abc123", name: "my-session" }),
          stderr: "",
          exit_code: 0,
        }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      const sessionId = await bashlet.createSession({ name: "my-session" });

      expect(sessionId).toBe("my-session");
      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining(["create", "--name", "my-session"]),
        expect.any(Object)
      );
    });

    it("should return ID when name is not provided", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({
          stdout: JSON.stringify({ id: "generated-id-123" }),
          stderr: "",
          exit_code: 0,
        }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      const sessionId = await bashlet.createSession();

      expect(sessionId).toBe("generated-id-123");
    });

    it("should create session with all options", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({
          stdout: JSON.stringify({ id: "abc", name: "test" }),
          stderr: "",
          exit_code: 0,
        }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await bashlet.createSession({
        name: "test",
        preset: "default",
        mounts: [{ hostPath: "/host", guestPath: "/guest", readonly: true }],
        envVars: [{ key: "FOO", value: "bar" }],
        workdir: "/workspace",
        ttl: "1h",
      });

      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining([
          "create",
          "--name",
          "test",
          "--preset",
          "default",
          "--mount",
          "/host:/guest:ro",
          "--env",
          "FOO=bar",
          "--workdir",
          "/workspace",
          "--ttl",
          "1h",
        ]),
        expect.any(Object)
      );
    });

    it("should handle raw output fallback", async () => {
      // When the CLI returns non-JSON output, it falls back to raw parsing
      mockedExeca.mockResolvedValueOnce({
        stdout: "raw-session-id\n",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      const sessionId = await bashlet.createSession();

      // Raw output is returned as-is (trimmed)
      expect(sessionId).toBe("raw-session-id");
    });
  });

  describe("runInSession", () => {
    it("should run command in session", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "output", stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      const result = await bashlet.runInSession("my-session", "ls -la");

      expect(result.stdout).toBe("output");
      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining(["run", "my-session", "ls -la"]),
        expect.any(Object)
      );
    });

    it("should run with createIfMissing option", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "", stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await bashlet.runInSession("new-session", "echo hi", {
        createIfMissing: true,
      });

      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining(["run", "-C", "new-session", "echo hi"]),
        expect.any(Object)
      );
    });

    it("should run with preset option", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "", stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await bashlet.runInSession("my-session", "npm test", {
        preset: "node",
      });

      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining(["run", "--preset", "node", "my-session"]),
        expect.any(Object)
      );
    });
  });

  describe("terminate", () => {
    it("should terminate a session", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await bashlet.terminate("my-session");

      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining(["terminate", "my-session"]),
        expect.any(Object)
      );
    });
  });

  describe("listSessions", () => {
    it("should list sessions", async () => {
      const sessionData = [
        {
          id: "session-1",
          name: "my-session",
          created_at: 1704067200,
          last_activity: 1704067300,
          ttl_seconds: 3600,
          expired: false,
          mounts: [
            { host_path: "/host", guest_path: "/guest", readonly: false },
          ],
          workdir: "/workspace",
        },
      ];
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({
          stdout: JSON.stringify(sessionData),
          stderr: "",
          exit_code: 0,
        }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      const sessions = await bashlet.listSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe("session-1");
      expect(sessions[0].name).toBe("my-session");
      expect(sessions[0].createdAt).toBe(1704067200);
      expect(sessions[0].lastActivity).toBe(1704067300);
      expect(sessions[0].ttlSeconds).toBe(3600);
      expect(sessions[0].expired).toBe(false);
      expect(sessions[0].mounts).toEqual([
        { hostPath: "/host", guestPath: "/guest", readonly: false },
      ]);
      expect(sessions[0].workdir).toBe("/workspace");
    });

    it("should return empty array on parse error", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: "invalid json",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      const sessions = await bashlet.listSessions();

      expect(sessions).toEqual([]);
    });

    it("should handle empty session list", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({
          stdout: JSON.stringify([]),
          stderr: "",
          exit_code: 0,
        }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      const sessions = await bashlet.listSessions();

      expect(sessions).toEqual([]);
    });
  });

  describe("readFile", () => {
    it("should read a file", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({
          stdout: "file content here",
          stderr: "",
          exit_code: 0,
        }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      const content = await bashlet.readFile("/path/to/file.txt");

      expect(content).toBe("file content here");
    });

    it("should throw CommandExecutionError when file not found", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({
          stdout: "",
          stderr: "cat: /missing: No such file or directory",
          exit_code: 1,
        }),
        stderr: "",
        exitCode: 1,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await expect(bashlet.readFile("/missing")).rejects.toThrow(
        CommandExecutionError
      );
    });

    it("should escape special characters in path", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "content", stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await bashlet.readFile("/path/with spaces/and'quotes");

      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining([
          "exec",
          expect.stringContaining("cat '/path/with spaces/and"),
        ]),
        expect.any(Object)
      );
    });
  });

  describe("writeFile", () => {
    it("should write a file", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "", stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await bashlet.writeFile("/path/to/file.txt", "new content");

      expect(mockedExeca).toHaveBeenCalledWith(
        "bashlet",
        expect.arrayContaining([
          "exec",
          expect.stringContaining("base64"),
        ]),
        expect.any(Object)
      );
    });

    it("should throw CommandExecutionError on write failure", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({
          stdout: "",
          stderr: "Permission denied",
          exit_code: 1,
        }),
        stderr: "",
        exitCode: 1,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await expect(
        bashlet.writeFile("/readonly/file", "content")
      ).rejects.toThrow(CommandExecutionError);
    });

    it("should handle special characters in content", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: "", stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await bashlet.writeFile("/file.txt", "special 'chars' and \"quotes\"");

      // Content is base64 encoded, so it should be in the command
      expect(mockedExeca).toHaveBeenCalled();
    });
  });

  describe("listDir", () => {
    it("should list directory contents", async () => {
      const listing = `total 4
drwxr-xr-x  2 user user 4096 Jan  1 00:00 .
drwxr-xr-x  3 user user 4096 Jan  1 00:00 ..
-rw-r--r--  1 user user  100 Jan  1 00:00 file.txt`;

      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({ stdout: listing, stderr: "", exit_code: 0 }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      const result = await bashlet.listDir("/workspace");

      expect(result).toBe(listing);
    });

    it("should throw CommandExecutionError for non-existent directory", async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({
          stdout: "",
          stderr: "ls: cannot access '/missing': No such file or directory",
          exit_code: 2,
        }),
        stderr: "",
        exitCode: 2,
        timedOut: false,
      } as never);

      const bashlet = new Bashlet();
      await expect(bashlet.listDir("/missing")).rejects.toThrow(
        CommandExecutionError
      );
    });
  });

  describe("tool generators", () => {
    it("should have toMCPTools method", () => {
      const bashlet = new Bashlet();
      expect(typeof bashlet.toMCPTools).toBe("function");
    });

    it("should have toVercelTools method", () => {
      const bashlet = new Bashlet();
      expect(typeof bashlet.toVercelTools).toBe("function");
    });

    it("should have toOpenAITools method", () => {
      const bashlet = new Bashlet();
      expect(typeof bashlet.toOpenAITools).toBe("function");
    });

    it("should have toGenericTools method", () => {
      const bashlet = new Bashlet();
      expect(typeof bashlet.toGenericTools).toBe("function");
    });
  });
});
