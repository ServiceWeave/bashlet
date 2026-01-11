/**
 * Base error class for all bashlet SDK errors
 */
export class BashletError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "BashletError";
    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BashletError);
    }
  }
}

/**
 * Error thrown when command execution fails
 */
export class CommandExecutionError extends BashletError {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stderr: string
  ) {
    super(message);
    this.name = "CommandExecutionError";
  }
}

/**
 * Error thrown when session operations fail
 */
export class SessionError extends BashletError {
  constructor(
    message: string,
    public readonly sessionId?: string
  ) {
    super(message);
    this.name = "SessionError";
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends BashletError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/**
 * Error thrown when the bashlet binary is not found or inaccessible
 */
export class BinaryNotFoundError extends BashletError {
  constructor(binaryPath: string) {
    super(
      `Bashlet binary not found at '${binaryPath}'. ` +
        `Make sure bashlet is installed and available in your PATH, ` +
        `or specify the correct path using the 'binaryPath' option.`
    );
    this.name = "BinaryNotFoundError";
  }
}

/**
 * Error thrown when command times out
 */
export class TimeoutError extends BashletError {
  constructor(
    command: string,
    timeoutSeconds: number
  ) {
    super(
      `Command timed out after ${timeoutSeconds} seconds: ${command.substring(0, 100)}${command.length > 100 ? "..." : ""}`
    );
    this.name = "TimeoutError";
  }
}
