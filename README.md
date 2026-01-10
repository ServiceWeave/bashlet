# Bashlet

Sandboxed bash execution environment using WebAssembly.

Bashlet runs shell commands inside a secure WASM sandbox powered by Wasmer. It supports both one-shot command execution and persistent sessions with mounted directories.

## Prerequisites

### Wasmer

Bashlet requires [Wasmer](https://wasmer.io/) to be installed:

```bash
curl https://get.wasmer.io -sSfL | sh
```

Verify installation:

```bash
wasmer --version
```

## Installation

### From Source

```bash
git clone https://github.com/ServiceWeave/bashlet.git
cd bashlet
cargo build --release
```

The binary will be at `./target/release/bashlet`.

### Quick Install (macOS/Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/ServiceWeave/bashlet/main/install.sh | sh
```

## Usage

### One-Shot Command Execution

Run a single command in an isolated sandbox:

```bash
bashlet exec "echo hello world"
```

With a mounted directory:

```bash
bashlet exec --mount ./src:/workspace "ls /workspace"
```

With environment variables:

```bash
bashlet exec --env MESSAGE="Hello" "echo $MESSAGE"
```

### Session Management

Sessions allow you to create persistent sandbox environments that maintain their configuration across multiple commands.

#### Create a Session

```bash
bashlet create --name my-session --mount ./src:/workspace
```

With TTL (time-to-live):

```bash
bashlet create --name temp-session --mount ./data:/data --ttl 1h
```

#### Run Commands in a Session

```bash
bashlet run my-session "ls /workspace"
bashlet run my-session "cat /workspace/README.md"
```

#### List Active Sessions

```bash
bashlet list
```

Output:

```
ID           NAME             CREATED              TTL        MOUNTS
----------------------------------------------------------------------
abc123       my-session       2024-01-10 15:20     -          ./src:/workspace
def456       temp-session     2024-01-10 15:25     1h         ./data:/data
```

#### Terminate a Session

```bash
bashlet terminate my-session
```

### AI Agent Mode

Run an AI agent that executes commands in the sandbox:

```bash
bashlet agent "analyze the code and find potential bugs" --mount ./src:/workspace
```

Requires an API key:

```bash
export ANTHROPIC_API_KEY="your-api-key"
# or
export OPENAI_API_KEY="your-api-key"
```

## Command Reference

| Command | Description |
|---------|-------------|
| `bashlet exec "command"` | One-shot command execution in sandbox |
| `bashlet create` | Create a new persistent session |
| `bashlet run SESSION "command"` | Run command in an existing session |
| `bashlet list` | List all active sessions |
| `bashlet terminate SESSION` | Terminate a session |
| `bashlet agent "task"` | Run AI agent with sandbox access |

### Exec Options

```
bashlet exec [OPTIONS] <COMMAND>

Arguments:
  <COMMAND>  The shell command to execute

Options:
  -m, --mount <MOUNT>   Mount host directories (host_path:guest_path[:ro])
  -e, --env <ENV>       Environment variables (KEY=VALUE)
  -w, --workdir <DIR>   Working directory in sandbox [default: /workspace]
      --wasm <WASM>     Custom WASM binary for sandbox
  -v, --verbose         Enable verbose output
  -h, --help            Print help
```

### Create Options

```
bashlet create [OPTIONS]

Options:
  -n, --name <NAME>     Session name (auto-generated if not provided)
  -m, --mount <MOUNT>   Mount host directories (host_path:guest_path[:ro])
  -e, --env <ENV>       Environment variables (KEY=VALUE)
  -w, --workdir <DIR>   Working directory in sandbox [default: /workspace]
      --wasm <WASM>     Custom WASM binary for sandbox
      --ttl <TTL>       Time-to-live (e.g., 30m, 1h, 2d)
  -h, --help            Print help
```

### Mount Syntax

Mounts follow Docker-style syntax:

| Format | Description |
|--------|-------------|
| `./src:/workspace` | Mount `./src` to `/workspace` (read-write) |
| `./src:/workspace:ro` | Mount `./src` to `/workspace` (read-only) |

### TTL Syntax

| Format | Description |
|--------|-------------|
| `30m` | 30 minutes |
| `1h` | 1 hour |
| `2d` | 2 days |

## How It Works

1. **WEBC Download**: On first run, bashlet downloads the bash WEBC package from the Wasmer CDN and caches it locally

2. **Wasmer Execution**: Commands are executed via `wasmer run` with:
   - `--mapdir` for mount points
   - `--env` for environment variables
   - The cached WEBC package

3. **Session Persistence**: Sessions are stored as JSON files and can be resumed across CLI invocations

### Cache Locations

| Platform | Cache Directory |
|----------|-----------------|
| macOS | `~/Library/Caches/com.bashlet.bashlet/` |
| Linux | `~/.cache/bashlet/` |
| Windows | `%LOCALAPPDATA%\bashlet\cache\` |

### Session Storage

| Platform | Sessions Directory |
|----------|-------------------|
| macOS | `~/Library/Application Support/com.bashlet.bashlet/sessions/` |
| Linux | `~/.local/share/bashlet/sessions/` |
| Windows | `%APPDATA%\bashlet\sessions\` |

## Configuration

Configuration is stored in `~/.config/bashlet/config.toml` (or platform equivalent).

Example configuration:

```toml
[agent]
default_provider = "anthropic"
max_iterations = 50
temperature = 0.0
max_tokens = 4096

[sandbox]
default_workdir = "/workspace"
memory_limit_mb = 256
timeout_seconds = 300

[providers.anthropic]
api_key_env = "ANTHROPIC_API_KEY"
default_model = "claude-sonnet-4-20250514"

[providers.openai]
api_key_env = "OPENAI_API_KEY"
default_model = "gpt-4o"
```

## Why Wasmer?

Bashlet uses the Wasmer runtime because the bash WEBC package uses [WASIX](https://wasix.org/) extensions. WASIX extends WASI with additional POSIX-like functionality (file descriptors, process spawning, etc.) that standard WASI runtimes like wasmtime don't support.

## License

MIT
