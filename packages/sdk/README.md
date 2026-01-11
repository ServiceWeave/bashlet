# @bashlet/sdk

TypeScript SDK for [bashlet](https://github.com/anthropics/bashlet) - a sandboxed bash execution environment. This SDK allows you to create bashlet instances and provide them as tools for AI agents.

## Features

- **Sandboxed Execution**: Run shell commands in isolated environments
- **Multi-Framework Support**: Generate tools for MCP, Vercel AI SDK, OpenAI, and custom frameworks
- **Session Management**: Create persistent sessions for stateful operations
- **File Operations**: Read, write, and list files in the sandbox
- **Type-Safe**: Full TypeScript support with comprehensive types

## Installation

```bash
npm install @bashlet/sdk
```

Make sure you have [bashlet](https://github.com/anthropics/bashlet) installed:

```bash
cargo install bashlet
```

## Quick Start

```typescript
import { Bashlet } from '@bashlet/sdk';

const bashlet = new Bashlet({
  mounts: [{ hostPath: './src', guestPath: '/workspace' }],
});

// Execute a command
const result = await bashlet.exec('ls -la /workspace');
console.log(result.stdout);
```

## Usage with AI Frameworks

### Vercel AI SDK

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { Bashlet } from '@bashlet/sdk';

const bashlet = new Bashlet({
  mounts: [{ hostPath: './project', guestPath: '/workspace' }],
});

const result = await generateText({
  model: openai('gpt-4-turbo'),
  tools: bashlet.toVercelTools(),
  prompt: 'List files in /workspace and show the contents of package.json',
});
```

### OpenAI Function Calling

```typescript
import OpenAI from 'openai';
import { Bashlet, createOpenAIToolHandler } from '@bashlet/sdk';

const openai = new OpenAI();
const bashlet = new Bashlet();

const tools = bashlet.toOpenAITools();
const handleToolCall = createOpenAIToolHandler(bashlet);

const response = await openai.chat.completions.create({
  model: 'gpt-4-turbo',
  tools: tools.map(t => ({ type: t.type, function: t.function })),
  messages: [{ role: 'user', content: 'List files in the current directory' }],
});

// Handle tool calls
for (const toolCall of response.choices[0].message.tool_calls ?? []) {
  const result = await handleToolCall(
    toolCall.function.name,
    JSON.parse(toolCall.function.arguments)
  );
  console.log(result);
}
```

### MCP (Model Context Protocol)

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Bashlet, createMCPServer } from '@bashlet/sdk';

const bashlet = new Bashlet();
const { tools, handleToolCall } = createMCPServer(bashlet);

const server = new Server(
  { name: 'bashlet-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler('tools/list', async () => ({ tools }));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args);
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Generic/Framework-Agnostic

```typescript
import { Bashlet, createToolRegistry } from '@bashlet/sdk';

const bashlet = new Bashlet();
const registry = createToolRegistry(bashlet);

// List available tools
console.log(registry.names()); // ['bashlet_exec', 'bashlet_read_file', ...]

// Execute a tool
const result = await registry.execute('bashlet_exec', {
  command: 'echo "Hello World"',
});
```

## API Reference

### Bashlet Class

```typescript
const bashlet = new Bashlet(options?: BashletOptions);
```

#### Options

| Option | Type | Description |
|--------|------|-------------|
| `binaryPath` | `string` | Path to bashlet binary (default: `'bashlet'`) |
| `preset` | `string` | Default preset to apply |
| `mounts` | `Mount[]` | Default mounts |
| `envVars` | `EnvVar[]` | Default environment variables |
| `workdir` | `string` | Default working directory |
| `timeout` | `number` | Command timeout in seconds (default: `300`) |
| `configPath` | `string` | Path to config file |

#### Methods

##### `exec(command, options?)`

Execute a one-shot command in an isolated sandbox.

```typescript
const result = await bashlet.exec('echo "Hello"');
// { stdout: 'Hello\n', stderr: '', exitCode: 0 }
```

##### `createSession(options?)`

Create a new persistent session.

```typescript
const sessionId = await bashlet.createSession({
  name: 'my-session',
  ttl: '1h',
  mounts: [{ hostPath: './data', guestPath: '/data' }],
});
```

##### `runInSession(sessionId, command, options?)`

Run a command in an existing session.

```typescript
const result = await bashlet.runInSession('my-session', 'npm install');
```

##### `terminate(sessionId)`

Terminate a session.

```typescript
await bashlet.terminate('my-session');
```

##### `listSessions()`

List all active sessions.

```typescript
const sessions = await bashlet.listSessions();
```

##### `readFile(path, options?)`

Read a file from the sandbox.

```typescript
const content = await bashlet.readFile('/workspace/config.json');
```

##### `writeFile(path, content, options?)`

Write content to a file in the sandbox.

```typescript
await bashlet.writeFile('/workspace/output.txt', 'Hello World');
```

##### `listDir(path, options?)`

List directory contents.

```typescript
const listing = await bashlet.listDir('/workspace');
```

### Tool Generators

| Method | Returns | Use Case |
|--------|---------|----------|
| `toMCPTools()` | `MCPToolHandler[]` | Model Context Protocol servers |
| `toVercelTools()` | `BashletVercelTools` | Vercel AI SDK |
| `toOpenAITools()` | `OpenAIToolWithHandler[]` | OpenAI function calling |
| `toGenericTools()` | `GenericTool[]` | Custom implementations |

### Available Tools

| Tool Name | Description |
|-----------|-------------|
| `bashlet_exec` | Execute shell commands in the sandbox |
| `bashlet_read_file` | Read file contents |
| `bashlet_write_file` | Write content to a file |
| `bashlet_list_dir` | List directory contents |

## Error Handling

The SDK provides typed errors for different failure scenarios:

```typescript
import {
  BashletError,
  CommandExecutionError,
  SessionError,
  BinaryNotFoundError,
  TimeoutError,
} from '@bashlet/sdk';

try {
  await bashlet.exec('some-command');
} catch (error) {
  if (error instanceof CommandExecutionError) {
    console.log(`Command failed with exit code ${error.exitCode}`);
    console.log(`stderr: ${error.stderr}`);
  } else if (error instanceof TimeoutError) {
    console.log('Command timed out');
  } else if (error instanceof BinaryNotFoundError) {
    console.log('Bashlet binary not found');
  }
}
```

## Schemas

The SDK exports both Zod schemas (for Vercel AI SDK) and JSON schemas (for MCP/OpenAI):

```typescript
import {
  // Zod schemas
  execSchema,
  readFileSchema,
  writeFileSchema,
  listDirSchema,
  // JSON schemas
  execJsonSchema,
  readFileJsonSchema,
  writeFileJsonSchema,
  listDirJsonSchema,
} from '@bashlet/sdk/schemas';
```

## License

MIT
