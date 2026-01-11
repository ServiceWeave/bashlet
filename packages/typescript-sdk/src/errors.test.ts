import { describe, it, expect } from "vitest";
import {
  BashletError,
  CommandExecutionError,
  SessionError,
  ConfigurationError,
  BinaryNotFoundError,
  TimeoutError,
} from "./errors.js";

describe("BashletError", () => {
  it("should create an error with message", () => {
    const error = new BashletError("Test error message");
    expect(error.message).toBe("Test error message");
    expect(error.name).toBe("BashletError");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BashletError);
  });

  it("should create an error with cause", () => {
    const cause = new Error("Original error");
    const error = new BashletError("Wrapped error", cause);
    expect(error.message).toBe("Wrapped error");
    expect(error.cause).toBe(cause);
  });

  it("should have proper stack trace", () => {
    const error = new BashletError("Test");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("BashletError");
  });
});

describe("CommandExecutionError", () => {
  it("should create an error with exit code and stderr", () => {
    const error = new CommandExecutionError("Command failed", 1, "error output");
    expect(error.message).toBe("Command failed");
    expect(error.name).toBe("CommandExecutionError");
    expect(error.exitCode).toBe(1);
    expect(error.stderr).toBe("error output");
    expect(error).toBeInstanceOf(BashletError);
  });

  it("should handle zero exit code", () => {
    const error = new CommandExecutionError("Unexpected failure", 0, "");
    expect(error.exitCode).toBe(0);
    expect(error.stderr).toBe("");
  });

  it("should handle large exit codes", () => {
    const error = new CommandExecutionError("Signal killed", 137, "killed");
    expect(error.exitCode).toBe(137);
  });
});

describe("SessionError", () => {
  it("should create an error with session ID", () => {
    const error = new SessionError("Session failed", "session-123");
    expect(error.message).toBe("Session failed");
    expect(error.name).toBe("SessionError");
    expect(error.sessionId).toBe("session-123");
    expect(error).toBeInstanceOf(BashletError);
  });

  it("should create an error without session ID", () => {
    const error = new SessionError("Session operation failed");
    expect(error.message).toBe("Session operation failed");
    expect(error.sessionId).toBeUndefined();
  });
});

describe("ConfigurationError", () => {
  it("should create a configuration error", () => {
    const error = new ConfigurationError("Invalid configuration");
    expect(error.message).toBe("Invalid configuration");
    expect(error.name).toBe("ConfigurationError");
    expect(error).toBeInstanceOf(BashletError);
  });
});

describe("BinaryNotFoundError", () => {
  it("should create an error with binary path", () => {
    const error = new BinaryNotFoundError("/usr/local/bin/bashlet");
    expect(error.message).toContain("/usr/local/bin/bashlet");
    expect(error.message).toContain("not found");
    expect(error.message).toContain("binaryPath");
    expect(error.name).toBe("BinaryNotFoundError");
    expect(error).toBeInstanceOf(BashletError);
  });

  it("should provide helpful message for default path", () => {
    const error = new BinaryNotFoundError("bashlet");
    expect(error.message).toContain("bashlet");
    expect(error.message).toContain("PATH");
  });
});

describe("TimeoutError", () => {
  it("should create a timeout error", () => {
    const error = new TimeoutError("echo hello", 30);
    expect(error.message).toContain("30 seconds");
    expect(error.message).toContain("echo hello");
    expect(error.name).toBe("TimeoutError");
    expect(error).toBeInstanceOf(BashletError);
  });

  it("should truncate long commands", () => {
    const longCommand = "x".repeat(200);
    const error = new TimeoutError(longCommand, 60);
    expect(error.message).toContain("...");
    expect(error.message.length).toBeLessThan(longCommand.length + 100);
  });

  it("should not truncate short commands", () => {
    const shortCommand = "ls -la";
    const error = new TimeoutError(shortCommand, 10);
    expect(error.message).not.toContain("...");
    expect(error.message).toContain(shortCommand);
  });
});
