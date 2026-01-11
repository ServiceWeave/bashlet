import { Bashlet } from "@bashlet/sdk";

/**
 * Create a Bashlet instance configured for file search and retrieval.
 *
 * This provides access to files within a sandboxed environment,
 * allowing the AI agent to safely search, read, and analyze files
 * without risk to the host system.
 *
 * The sandbox mounts the target directory as read-only by default,
 * preventing any accidental modifications.
 */
export function createFileSearchBashlet(searchPath?: string) {
  const targetPath = searchPath || process.env.SEARCH_PATH || process.cwd();

  return new Bashlet({
    // Mount the search directory (read-only for safety)
    mounts: [
      {
        hostPath: targetPath,
        guestPath: "/data",
        readonly: true,
      },
    ],
    // Working directory inside sandbox
    workdir: "/data",
    // 30 second timeout for search commands
    timeout: 30,
  });
}

/**
 * Get the configured search path for display purposes.
 */
export function getSearchPath(): string {
  return process.env.SEARCH_PATH || process.cwd();
}
