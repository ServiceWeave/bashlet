import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool } from "ai";
import { z } from "zod";
import { createFileSearchBashlet } from "@/lib/bashlet";

// Initialize bashlet client for file access
const bashlet = createFileSearchBashlet();

// System prompt for the file search agent
const SYSTEM_PROMPT = `You are a helpful file search and retrieval assistant. You have access to a directory of files through a secure sandboxed environment.

Your capabilities:
- Search for files by name patterns using find and glob
- Search file contents using grep and ripgrep (rg)
- Read file contents to answer questions
- List directory structures
- Analyze code, documents, and data files
- Extract and summarize information from files

Search approach:
1. First understand what the user is looking for
2. Use appropriate search commands to locate relevant files
3. Read file contents when needed for detailed information
4. Provide clear, concise answers with relevant excerpts
5. Cite file paths when referencing specific content

Available tools in the sandbox:
- find: Search for files by name
- grep/rg: Search file contents
- cat/head/tail: Read file contents
- ls: List directories
- wc: Count lines/words
- file: Detect file types
- jq: Parse JSON files
- Standard Unix utilities

The files are mounted at /data. Always search within /data.

Be thorough but concise. Show relevant file paths and excerpts when answering questions.`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: SYSTEM_PROMPT,
    messages,
    maxSteps: 15,
    tools: {
      // Search for files by name pattern
      find_files: tool({
        description:
          "Search for files by name pattern. Uses 'find' command with glob patterns. " +
          "Examples: '*.ts' finds TypeScript files, '*test*' finds files with 'test' in name.",
        parameters: z.object({
          pattern: z
            .string()
            .describe("File name pattern to search for (e.g., '*.json', '*config*')"),
          path: z
            .string()
            .optional()
            .default("/data")
            .describe("Directory to search in (default: /data)"),
          type: z
            .enum(["f", "d", "l"])
            .optional()
            .describe("Type filter: 'f' for files, 'd' for directories, 'l' for links"),
          maxDepth: z
            .number()
            .optional()
            .describe("Maximum directory depth to search"),
        }),
        execute: async ({ pattern, path, type, maxDepth }) => {
          let cmd = `find ${path || "/data"}`;
          if (maxDepth) cmd += ` -maxdepth ${maxDepth}`;
          if (type) cmd += ` -type ${type}`;
          cmd += ` -name '${pattern}' 2>/dev/null | head -50`;

          const result = await bashlet.exec(cmd);
          return {
            files: result.stdout.trim().split("\n").filter(Boolean),
            truncated: result.stdout.split("\n").length >= 50,
          };
        },
      }),

      // Search file contents with grep
      search_content: tool({
        description:
          "Search for text patterns inside files. Uses ripgrep (rg) for fast searching. " +
          "Supports regex patterns. Returns matching lines with file paths.",
        parameters: z.object({
          pattern: z
            .string()
            .describe("Text or regex pattern to search for"),
          path: z
            .string()
            .optional()
            .default("/data")
            .describe("Directory or file to search in"),
          filePattern: z
            .string()
            .optional()
            .describe("Only search files matching this glob (e.g., '*.py')"),
          caseSensitive: z
            .boolean()
            .optional()
            .default(false)
            .describe("Whether the search is case-sensitive"),
          context: z
            .number()
            .optional()
            .default(0)
            .describe("Number of context lines before and after match"),
        }),
        execute: async ({ pattern, path, filePattern, caseSensitive, context }) => {
          let cmd = "rg";
          if (!caseSensitive) cmd += " -i";
          if (context && context > 0) cmd += ` -C ${context}`;
          if (filePattern) cmd += ` -g '${filePattern}'`;
          cmd += ` --max-count 100 '${pattern}' ${path || "/data"} 2>/dev/null | head -100`;

          const result = await bashlet.exec(cmd);
          return {
            matches: result.stdout.trim(),
            matchCount: result.stdout.trim().split("\n").filter(Boolean).length,
            truncated: result.stdout.split("\n").length >= 100,
          };
        },
      }),

      // Read file contents
      read_file: tool({
        description:
          "Read the contents of a file. Can read entire file or specific line ranges. " +
          "Use this to get full content of files found via search.",
        parameters: z.object({
          path: z.string().describe("Path to the file to read"),
          startLine: z
            .number()
            .optional()
            .describe("Starting line number (1-indexed)"),
          endLine: z
            .number()
            .optional()
            .describe("Ending line number (1-indexed)"),
          head: z
            .number()
            .optional()
            .describe("Only read first N lines"),
          tail: z
            .number()
            .optional()
            .describe("Only read last N lines"),
        }),
        execute: async ({ path, startLine, endLine, head, tail }) => {
          let cmd: string;

          if (startLine && endLine) {
            cmd = `sed -n '${startLine},${endLine}p' '${path}'`;
          } else if (head) {
            cmd = `head -n ${head} '${path}'`;
          } else if (tail) {
            cmd = `tail -n ${tail} '${path}'`;
          } else {
            // Read full file but limit to 500 lines
            cmd = `head -n 500 '${path}'`;
          }

          const result = await bashlet.exec(cmd);
          const lineCount = result.stdout.split("\n").length;

          return {
            content: result.stdout,
            lineCount,
            truncated: lineCount >= 500 && !head && !tail && !startLine,
          };
        },
      }),

      // List directory contents
      list_directory: tool({
        description:
          "List the contents of a directory with details. " +
          "Shows file sizes, permissions, and modification times.",
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
            .describe("List recursively (tree view)"),
          showHidden: z
            .boolean()
            .optional()
            .default(false)
            .describe("Show hidden files (starting with .)"),
        }),
        execute: async ({ path, recursive, showHidden }) => {
          let cmd: string;

          if (recursive) {
            cmd = `find ${path || "/data"} -type f ${showHidden ? "" : "! -name '.*'"} 2>/dev/null | head -200`;
          } else {
            cmd = `ls -lh${showHidden ? "a" : ""} ${path || "/data"} 2>/dev/null`;
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
          "Get detailed information about a file including type, size, and line count.",
        parameters: z.object({
          path: z.string().describe("Path to the file"),
        }),
        execute: async ({ path }) => {
          const result = await bashlet.exec(
            `file '${path}' && stat '${path}' 2>/dev/null && wc -l < '${path}' 2>/dev/null`
          );

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
