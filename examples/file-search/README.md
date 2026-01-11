# File Search

An AI-powered file search and retrieval assistant built with:

- **Bashlet** - Sandboxed bash execution for safe file access
- **Vercel AI SDK** - Streaming chat with tool calling
- **Claude** - Anthropic's AI model for intelligent search
- **Next.js 15** - React framework with App Router

## How It Works

The AI agent has access to your files through Bashlet's sandboxed environment. When you ask questions about your files, the agent:

1. Searches for relevant files using find, grep, and ripgrep
2. Reads file contents to extract information
3. Analyzes and summarizes the findings
4. Provides clear answers with file references

All operations run in an isolated sandbox with read-only access.

## Prerequisites

- Node.js 18+
- [Bashlet](https://github.com/anthropics/bashlet) installed and in PATH
- Anthropic API key

## Setup

1. Install dependencies:

```bash
cd examples/file-search
npm install
```

2. Set environment variables:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export SEARCH_PATH=/path/to/your/files  # Optional, defaults to cwd
```

3. Start the development server:

```bash
npm run dev
```

4. Open http://localhost:3000

## Example Queries

**Finding files:**
- "Find all Python files in the project"
- "Show me all config files"
- "List all files in the src directory"

**Searching content:**
- "Search for 'TODO' comments"
- "Find all functions that handle errors"
- "Which files import the 'utils' module?"

**Reading and analyzing:**
- "What does the package.json contain?"
- "Summarize the README file"
- "Show me the main function in app.py"

**Complex queries:**
- "How many lines of code are in each TypeScript file?"
- "Find all API endpoints defined in the codebase"
- "What dependencies does this project have?"

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js Frontend                      │
│                   (React + Tailwind)                     │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP/Streaming
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  API Route (/api/chat)                   │
│                                                          │
│  ┌─────────────┐    ┌────────────┐    ┌──────────────┐  │
│  │ Vercel AI   │───▶│   Claude   │───▶│   Bashlet    │  │
│  │    SDK      │◀───│  (Tools)   │◀───│   (search)   │  │
│  └─────────────┘    └────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │    Sandbox       │
                                    │  ┌────────────┐  │
                                    │  │   /data    │  │
                                    │  │   (r/o)    │  │
                                    │  └────────────┘  │
                                    │  ┌────────────┐  │
                                    │  │ find, grep │  │
                                    │  │ rg, cat... │  │
                                    │  └────────────┘  │
                                    └──────────────────┘
```

## Available Tools

The agent has access to these tools:

| Tool | Description |
|------|-------------|
| `find_files` | Search for files by name pattern using glob |
| `search_content` | Search file contents with grep/ripgrep |
| `read_file` | Read file contents (full or line range) |
| `list_directory` | List directory contents with details |
| `file_info` | Get file type, size, and metadata |
| `shell` | Execute custom shell commands |

## SDK Integration

```typescript
import { Bashlet } from "@bashlet/sdk";
import { streamText, tool } from "ai";
import { z } from "zod";

const bashlet = new Bashlet({
  mounts: [
    { hostPath: "/path/to/files", guestPath: "/data", readonly: true },
  ],
  workdir: "/data",
  timeout: 30,
});

// Search for files
const result = streamText({
  model: anthropic("claude-sonnet-4-20250514"),
  tools: {
    find_files: tool({
      description: "Search for files by pattern",
      parameters: z.object({
        pattern: z.string(),
      }),
      execute: async ({ pattern }) => {
        const result = await bashlet.exec(`find /data -name '${pattern}'`);
        return { files: result.stdout.split("\n").filter(Boolean) };
      },
    }),

    search_content: tool({
      description: "Search file contents",
      parameters: z.object({
        pattern: z.string(),
      }),
      execute: async ({ pattern }) => {
        const result = await bashlet.exec(`rg '${pattern}' /data`);
        return { matches: result.stdout };
      },
    }),
  },
  messages,
});
```

## Security

- **Read-only mounts**: Files are mounted read-only
- **Sandboxed execution**: All commands run in isolation
- **No modifications**: The agent cannot modify your files
- **Timeout limits**: Commands timeout after 30 seconds
- **Output limits**: Results are truncated to prevent memory issues

## Customization

### Changing the search directory

Set the `SEARCH_PATH` environment variable:

```bash
SEARCH_PATH=/home/user/projects npm run dev
```

Or modify `lib/bashlet.ts`:

```typescript
export function createFileSearchBashlet() {
  return new Bashlet({
    mounts: [
      {
        hostPath: "/your/custom/path",
        guestPath: "/data",
        readonly: true,
      },
    ],
  });
}
```

### Adding file type filters

Extend the tools to filter by file type:

```typescript
find_files: tool({
  parameters: z.object({
    pattern: z.string(),
    extensions: z.array(z.string()).optional(),
  }),
  execute: async ({ pattern, extensions }) => {
    let cmd = `find /data -name '${pattern}'`;
    if (extensions?.length) {
      const extFilter = extensions.map(e => `-name '*.${e}'`).join(" -o ");
      cmd = `find /data \\( ${extFilter} \\) -name '${pattern}'`;
    }
    return await bashlet.exec(cmd);
  },
}),
```

### Increasing limits

For large codebases, increase the result limits:

```typescript
// In the tool execute functions
const result = await bashlet.exec(
  `rg '${pattern}' /data | head -500`  // Increase from 100
);
```

## Troubleshooting

### "Binary not found" error

Ensure bashlet is installed:

```bash
bashlet --version
```

### "Permission denied" for files

Check that the search path is readable:

```bash
ls -la /path/to/your/files
```

### Search is slow

For large directories, consider:
- Using more specific patterns
- Limiting search depth with `maxDepth`
- Excluding certain directories (node_modules, .git)

## License

MIT
