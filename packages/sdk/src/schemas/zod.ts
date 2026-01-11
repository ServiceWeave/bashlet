import { z } from "zod";

/**
 * Schema for bashlet_exec tool input
 */
export const execSchema = z.object({
  command: z.string().describe("The shell command to execute in the sandbox"),
  workdir: z
    .string()
    .optional()
    .describe("Working directory inside the sandbox (default: /workspace)"),
});

/**
 * Schema for bashlet_read_file tool input
 */
export const readFileSchema = z.object({
  path: z.string().describe("Absolute path to the file inside the sandbox"),
});

/**
 * Schema for bashlet_write_file tool input
 */
export const writeFileSchema = z.object({
  path: z.string().describe("Absolute path to the file inside the sandbox"),
  content: z.string().describe("Content to write to the file"),
});

/**
 * Schema for bashlet_list_dir tool input
 */
export const listDirSchema = z.object({
  path: z.string().describe("Absolute path to the directory inside the sandbox"),
});

// Type exports for TypeScript inference
export type ExecInput = z.infer<typeof execSchema>;
export type ReadFileInput = z.infer<typeof readFileSchema>;
export type WriteFileInput = z.infer<typeof writeFileSchema>;
export type ListDirInput = z.infer<typeof listDirSchema>;
