import { B as Bashlet } from '../client-B-jVT1DT.cjs';
import { e as execSchema, r as readFileSchema, w as writeFileSchema, l as listDirSchema, E as ExecInput, R as ReadFileInput, W as WriteFileInput, L as ListDirInput } from '../zod-BlfQ35iM.cjs';
import 'zod';

/**
 * Vercel AI SDK tool structure
 * Compatible with the `tool()` helper from the `ai` package
 */
interface VercelTool<TInput, TOutput> {
    description: string;
    parameters: typeof execSchema | typeof readFileSchema | typeof writeFileSchema | typeof listDirSchema;
    execute: (args: TInput) => Promise<TOutput>;
}
/**
 * Exec tool output type
 */
interface ExecOutput {
    stdout: string;
    stderr: string;
    exitCode: number;
}
/**
 * Read file output type
 */
interface ReadFileOutput {
    content: string;
}
/**
 * Write file output type
 */
interface WriteFileOutput {
    success: boolean;
    path: string;
}
/**
 * List directory output type
 */
interface ListDirOutput {
    listing: string;
}
/**
 * Tools record type for Vercel AI SDK
 */
interface BashletVercelTools {
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
declare function generateVercelTools(client: Bashlet): BashletVercelTools;

export { type BashletVercelTools, type ExecOutput, type ListDirOutput, type ReadFileOutput, type VercelTool, type WriteFileOutput, generateVercelTools };
