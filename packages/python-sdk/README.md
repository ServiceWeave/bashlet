# bashlet

Python SDK for [bashlet](https://github.com/anthropics/bashlet) - a sandboxed bash execution environment. This SDK allows you to create bashlet instances and provide them as tools for AI agents.

## Features

- **Sandboxed Execution**: Run shell commands in isolated environments
- **Sync & Async**: Both synchronous and asynchronous clients
- **Multi-Framework Support**: Generate tools for LangChain, OpenAI, Anthropic, and MCP
- **Session Management**: Create persistent sessions for stateful operations
- **File Operations**: Read, write, and list files in the sandbox
- **Type-Safe**: Full type hints with py.typed marker

## Installation

```bash
pip install bashlet
```

Make sure you have [bashlet](https://github.com/anthropics/bashlet) installed:

```bash
cargo install bashlet
```

### Optional Dependencies

Install with framework support:

```bash
# For LangChain
pip install bashlet[langchain]

# For OpenAI
pip install bashlet[openai]

# For Anthropic
pip install bashlet[anthropic]

# For MCP
pip install bashlet[mcp]

# For all frameworks
pip install bashlet[all]
```

## Quick Start

### Synchronous Client

```python
from bashlet import Bashlet, Mount

bashlet = Bashlet(
    mounts=[Mount("./src", "/workspace")],
)

# Execute a command
result = bashlet.exec("ls -la /workspace")
print(result.stdout)
print(f"Exit code: {result.exit_code}")
```

### Asynchronous Client

```python
import asyncio
from bashlet import AsyncBashlet

async def main():
    bashlet = AsyncBashlet()
    result = await bashlet.exec("echo hello")
    print(result.stdout)

asyncio.run(main())
```

## Usage with AI Frameworks

### LangChain

```python
from langchain_openai import ChatOpenAI
from bashlet import Bashlet

bashlet = Bashlet(
    mounts=[{"host_path": "./project", "guest_path": "/workspace"}],
)

# Get LangChain tools
tools = bashlet.to_langchain_tools()

# Bind tools to LLM
llm = ChatOpenAI(model="gpt-4-turbo")
llm_with_tools = llm.bind_tools(tools.all())

# Use in agent
response = llm_with_tools.invoke("List files in /workspace")
```

### OpenAI Function Calling

```python
from openai import OpenAI
from bashlet import Bashlet

client = OpenAI()
bashlet = Bashlet()

# Get OpenAI tools
handler = bashlet.to_openai_tools()

# Create completion with tools
response = client.chat.completions.create(
    model="gpt-4-turbo",
    tools=handler.definitions,
    messages=[{"role": "user", "content": "List files in current directory"}],
)

# Handle tool calls
for tool_call in response.choices[0].message.tool_calls or []:
    result = handler.handle(
        tool_call.function.name,
        tool_call.function.arguments  # JSON string or dict
    )
    print(result)
```

### Anthropic Tool Use

```python
from anthropic import Anthropic
from bashlet import Bashlet

client = Anthropic()
bashlet = Bashlet()

# Get Anthropic tools
handler = bashlet.to_anthropic_tools()

# Create message with tools
response = client.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    tools=handler.definitions,
    messages=[{"role": "user", "content": "List files in current directory"}],
)

# Handle tool use
for block in response.content:
    if block.type == "tool_use":
        result = handler.handle(block.name, block.input)
        print(result)
```

### MCP (Model Context Protocol)

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server
from bashlet import Bashlet

bashlet = Bashlet()
handler = bashlet.to_mcp_tools()

server = Server("bashlet-server")

@server.list_tools()
async def list_tools():
    return handler.definitions

@server.call_tool()
async def call_tool(name: str, arguments: dict):
    result = handler.handle(name, arguments)
    return result.content

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream)
```

### Generic/Framework-Agnostic

```python
from bashlet import Bashlet, create_generic_tools

bashlet = Bashlet()
tools = create_generic_tools(bashlet)

# Use with any framework
for tool in tools:
    print(f"Tool: {tool.name}")
    print(f"Description: {tool.description}")
    print(f"Parameters: {tool.parameters}")

# Execute a tool
exec_tool = next(t for t in tools if t.name == "bashlet_exec")
result = exec_tool.execute(command="echo hello")
print(result)
```

## API Reference

### Bashlet / AsyncBashlet

```python
bashlet = Bashlet(
    binary_path="bashlet",      # Path to bashlet binary
    preset=None,                # Default preset name
    mounts=None,                # Default mounts
    env_vars=None,              # Default environment variables
    workdir=None,               # Default working directory
    timeout=300,                # Command timeout in seconds
    config_path=None,           # Path to config file
)
```

### Methods

| Method | Description |
|--------|-------------|
| `exec(command, **options)` | Execute a one-shot command |
| `create_session(**options)` | Create a persistent session |
| `run_in_session(id, command)` | Run command in session |
| `terminate(session_id)` | Terminate a session |
| `list_sessions()` | List all sessions |
| `read_file(path)` | Read file contents |
| `write_file(path, content)` | Write to file |
| `list_dir(path)` | List directory |

### Tool Generators

| Method | Returns | Framework |
|--------|---------|-----------|
| `to_langchain_tools()` | `BashletLangChainTools` | LangChain |
| `to_openai_tools()` | `OpenAIToolHandler` | OpenAI |
| `to_anthropic_tools()` | `AnthropicToolHandler` | Anthropic |
| `to_mcp_tools()` | `MCPToolHandler` | MCP |
| `to_generic_tools()` | `list[GenericTool]` | Any |

### Available Tools

| Tool Name | Description |
|-----------|-------------|
| `bashlet_exec` | Execute shell commands |
| `bashlet_read_file` | Read file contents |
| `bashlet_write_file` | Write to files |
| `bashlet_list_dir` | List directory contents |

## Session Management

```python
from bashlet import Bashlet

bashlet = Bashlet()

# Create a session
session_id = bashlet.create_session(
    name="my-session",
    ttl="1h",
    mounts=[{"host_path": "./data", "guest_path": "/data"}],
)

# Run commands in session (state persists)
bashlet.run_in_session(session_id, "cd /data && npm init -y")
bashlet.run_in_session(session_id, "npm install express")
result = bashlet.run_in_session(session_id, "cat package.json")
print(result.stdout)

# List sessions
sessions = bashlet.list_sessions()
for s in sessions:
    print(f"{s.id}: {s.name or 'unnamed'}")

# Terminate session
bashlet.terminate(session_id)
```

## Error Handling

```python
from bashlet import (
    Bashlet,
    BashletError,
    CommandExecutionError,
    BinaryNotFoundError,
    TimeoutError,
)

bashlet = Bashlet()

try:
    result = bashlet.exec("some-command")
except CommandExecutionError as e:
    print(f"Command failed with exit code {e.exit_code}")
    print(f"stderr: {e.stderr}")
except TimeoutError as e:
    print(f"Command timed out after {e.timeout_seconds}s")
except BinaryNotFoundError as e:
    print(f"Bashlet not found at: {e.binary_path}")
except BashletError as e:
    print(f"Bashlet error: {e}")
```

## License

MIT
