import type { Bashlet } from "../client.js";
import {
  execSchema,
  readFileSchema,
  writeFileSchema,
  listDirSchema,
  type ExecInput,
  type ReadFileInput,
  type WriteFileInput,
  type ListDirInput,
} from "../schemas/zod.js";

/**
 * Vercel AI SDK tool structure
 * Compatible with the `tool()` helper from the `ai` package
 */
export interface VercelTool<TInput, TOutput> {
  description: string;
  parameters: typeof execSchema | typeof readFileSchema | typeof writeFileSchema | typeof listDirSchema;
  execute: (args: TInput) => Promise<TOutput>;
}

/**
 * Exec tool output type
 */
export interface ExecOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Read file output type
 */
export interface ReadFileOutput {
  content: string;
}

/**
 * Write file output type
 */
export interface WriteFileOutput {
  success: boolean;
  path: string;
}

/**
 * List directory output type
 */
export interface ListDirOutput {
  listing: string;
}

/**
 * Tools record type for Vercel AI SDK
 */
export interface BashletVercelTools {
  bashlet_exec: VercelTool<ExecInput, ExecOutput>;
  bashlet_read_file: VercelTool<ReadFileInput, ReadFileOutput>;
  bashlet_write_file: VercelTool<WriteFileInput, WriteFileOutput>;
  bashlet_list_dir: VercelTool<ListDirInput, ListDirOutput>;
}

/**
 * Generate Vercel AI SDK-compatible tools.
 *
 * These tools are designed to work with the `ai` package's `generateText`
 * and `streamText` functions.
 *
 * @param client - Bashlet client instance
 * @returns Object with tool definitions
 *
 * @example
 * ```typescript
 * import { generateText } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 * import { Bashlet, generateVercelTools } from '@bashlet/sdk';
 *
 * const bashlet = new Bashlet({
 *   mounts: [{ hostPath: './project', guestPath: '/workspace' }],
 * });
 *
 * const result = await generateText({
 *   model: openai('gpt-4-turbo'),
 *   tools: generateVercelTools(bashlet),
 *   prompt: 'List files in /workspace and show the contents of package.json',
 * });
 * ```
 */
export function generateVercelTools(client: Bashlet): BashletVercelTools {
  return {
    bashlet_exec: {
      description:
        "Execute a shell command in a sandboxed bash environment. " +
        "Returns stdout, stderr, and exit code. " +
        "Use this for running shell commands, scripts, and system operations safely.",
      parameters: execSchema,
      execute: async ({ command, workdir }: ExecInput): Promise<ExecOutput> => {
        const result = await client.exec(command, { workdir });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        };
      },
    },

    bashlet_read_file: {
      description:
        "Read the contents of a file from the sandboxed environment. " +
        "Returns the file content as a string.",
      parameters: readFileSchema,
      execute: async ({ path }: ReadFileInput): Promise<ReadFileOutput> => {
        const content = await client.readFile(path);
        return { content };
      },
    },

    bashlet_write_file: {
      description:
        "Write content to a file in the sandboxed environment. " +
        "Creates the file if it doesn't exist, overwrites if it does.",
      parameters: writeFileSchema,
      execute: async ({ path, content }: WriteFileInput): Promise<WriteFileOutput> => {
        await client.writeFile(path, content);
        return { success: true, path };
      },
    },

    bashlet_list_dir: {
      description:
        "List the contents of a directory in the sandboxed environment. " +
        "Returns a detailed listing with file permissions, sizes, and names.",
      parameters: listDirSchema,
      execute: async ({ path }: ListDirInput): Promise<ListDirOutput> => {
        const listing = await client.listDir(path);
        return { listing };
      },
    },
  };
}
