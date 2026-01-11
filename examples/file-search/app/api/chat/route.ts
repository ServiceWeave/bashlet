import { openai } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { z } from "zod";
import { createFileSearchBashlet } from "@/lib/bashlet";

// Initialize bashlet client for file access
const bashlet = createFileSearchBashlet();

// System prompt for the file search agent
const SYSTEM_PROMPT = `You are a helpful file search and retrieval assistant. You have access to a directory of files through a secure sandboxed environment.

Your capabilities:
- List directory contents and browse file structure
- Read file contents to answer questions
- Analyze code, documents, and data files
- Extract and summarize information from files

Search approach:
1. First understand what the user is looking for
2. List directories to explore file structure
3. Read file contents when needed for detailed information
4. Provide clear, concise answers with relevant excerpts
5. Cite file paths when referencing specific content

Available tools in the sandbox:
- ls: List directories (with -R for recursive, -la for details)
- cat/head/tail: Read file contents
- wc: Count lines/words
- stat: Get file information
- Standard coreutils (cp, mv, echo, etc.)

Note: This is a WASM sandbox with limited commands. Commands like find, grep, and rg are NOT available.

The files are mounted at /data. Always work within /data.

Be thorough but concise. Show relevant file paths and excerpts when answering questions.`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    system: SYSTEM_PROMPT,
    messages,
    maxSteps: 15,
    tools: {
      // List files matching a pattern
      find_files: tool({
        description:
          "List files in a directory, optionally matching a shell glob pattern. " +
          "Uses 'ls' command. Examples: '*.ts' lists TypeScript files.",
        parameters: z.object({
          pattern: z
            .string()
            .optional()
            .describe("File name pattern to match (e.g., '*.json', '*config*')"),
          path: z
            .string()
            .optional()
            .default("/data")
            .describe("Directory to list (default: /data)"),
        }),
        execute: async ({ pattern, path }) => {
          const targetPath = path || "/data";
          const cmd = pattern
            ? `ls -la ${targetPath}/${pattern} 2>/dev/null || echo 'No matches found'`
            : `ls -la ${targetPath} 2>/dev/null`;

          const result = await bashlet.exec(cmd);
          return {
            files: result.stdout.trim(),
          };
        },
      }),

      // Read file contents
      read_file: tool({
        description:
          "Read the contents of a file. Can read entire file or first/last N lines. " +
          "Use this to get full content of files.",
        parameters: z.object({
          path: z.string().describe("Path to the file to read"),
          head: z
            .number()
            .optional()
            .describe("Only read first N lines"),
          tail: z
            .number()
            .optional()
            .describe("Only read last N lines"),
        }),
        execute: async ({ path, head, tail }) => {
          let cmd: string;

          if (head) {
            cmd = `head -n ${head} '${path}'`;
          } else if (tail) {
            cmd = `tail -n ${tail} '${path}'`;
          } else {
            cmd = `head -n 500 '${path}'`;
          }

          const result = await bashlet.exec(cmd);
          const lineCount = result.stdout.split("\n").length;

          return {
            content: result.stdout,
            lineCount,
            truncated: lineCount >= 500 && !head && !tail,
          };
        },
      }),

      // List directory contents
      list_directory: tool({
        description:
          "List the contents of a directory with details. " +
          "Shows file sizes and modification times.",
        parameters: z.object({
          path: z
            .string()
            .optional()
            .default("/data")
            .describe("Directory path to list"),
          recursive: z
            .boolean()
            .optional()
            .default(false)
            .describe("List recursively"),
          showHidden: z
            .boolean()
            .optional()
            .default(false)
            .describe("Show hidden files (starting with .)"),
        }),
        execute: async ({ path, recursive, showHidden }) => {
          const targetPath = path || "/data";
          let cmd: string;

          if (recursive) {
            cmd = `ls -R${showHidden ? "a" : ""} ${targetPath} 2>/dev/null | head -200`;
          } else {
            cmd = `ls -lh${showHidden ? "a" : ""} ${targetPath} 2>/dev/null`;
          }

          const result = await bashlet.exec(cmd);
          return {
            listing: result.stdout,
            truncated: result.stdout.split("\n").length >= 200,
          };
        },
      }),

      // Get file information
      file_info: tool({
        description:
          "Get detailed information about a file including size and line count.",
        parameters: z.object({
          path: z.string().describe("Path to the file"),
        }),
        execute: async ({ path }) => {
          const cmd = `stat '${path}' 2>/dev/null && echo "Lines:" && wc -l < '${path}' 2>/dev/null`;
          const result = await bashlet.exec(cmd);
          return {
            info: result.stdout,
          };
        },
      }),

      // Execute custom shell command
      shell: tool({
        description:
          "Execute a custom shell command for advanced file operations. " +
          "Use this for complex queries like combining multiple tools. " +
          "Examples: 'wc -l *.py', 'du -sh *', 'sort file.txt | uniq -c'",
        parameters: z.object({
          command: z
            .string()
            .describe("Shell command to execute"),
          workdir: z
            .string()
            .optional()
            .default("/data")
            .describe("Working directory for the command"),
        }),
        execute: async ({ command, workdir }) => {
          const result = await bashlet.exec(command, { workdir });
          return {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
          };
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
