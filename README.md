# Bashlet

Sandboxed bash execution for AI agents.

Bashlet provides a secure sandbox for AI agents to execute shell commands, with support for multiple isolation backends:
- **Wasmer** (WASM) - Cross-platform, lightweight sandbox
- **Firecracker** (microVM) - Full Linux VM isolation on Linux with KVM

## Installation

### Quick Install (macOS/Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/ServiceWeave/bashlet/main/install.sh | sh
```

This installs bashlet along with:
- **Wasmer** - For WASM sandbox (all platforms)
- **Firecracker** - For microVM sandbox (Linux only)

All dependencies are automatically downloaded if not present at runtime.

### From Source

```bash
git clone https://github.com/ServiceWeave/bashlet.git
cd bashlet
cargo build --release --features all-backends
```

The binary will be at `./target/release/bashlet`.

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

### Selecting a Backend

By default, bashlet automatically selects the best available backend (`auto`). You can explicitly choose a backend:

```bash
# Use Wasmer (WASM sandbox)
bashlet exec --backend wasmer "uname -a"

# Use Firecracker (microVM, Linux only)
bashlet exec --backend firecracker "uname -a"

# Auto-select (default)
bashlet exec --backend auto "uname -a"
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

#### Run and Create in One Step

Use `-C` / `--create` to automatically create the session if it doesn't exist:

```bash
# Creates 'dev' session if missing, then runs the command
bashlet run dev -C --mount ./src:/workspace "ls /workspace"

# Subsequent runs reuse the existing session
bashlet run dev "cat /workspace/README.md"
```

This is useful for scripts where you want idempotent behavior.

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

### Presets

Presets allow you to define reusable environment configurations with mounts, environment variables, and setup commands. This is ideal for creating consistent development environments.

#### Defining Presets

Add presets to your configuration file (`~/.config/bashlet/config.toml`):

```toml
[presets.kubectl]
mounts = [
  ["/usr/local/bin/kubectl", "/usr/local/bin/kubectl", true],
  ["~/.kube", "/home/.kube", true]
]
env_vars = [["KUBECONFIG", "/home/.kube/config"]]
setup_commands = ["kubectl version --client"]

[presets.nodejs]
mounts = [["~/.npm", "/home/.npm", false]]
env_vars = [["NODE_ENV", "development"]]
workdir = "/app"
```

#### Using Presets

Apply a preset when creating sessions or running commands:

```bash
# Create a session with a preset
bashlet create --name k8s-env --preset kubectl

# One-shot command with a preset
bashlet exec --preset kubectl "kubectl get pods"

# Run with auto-create and preset
bashlet run dev -C --preset nodejs "npm install"
```

#### Preset Configuration Options

| Field | Description |
|-------|-------------|
| `backend` | Backend override: `wasmer`, `firecracker`, or `auto` |
| `mounts` | Mount specifications: `[[host, guest, readonly], ...]` |
| `env_vars` | Environment variables: `[[KEY, VALUE], ...]` |
| `workdir` | Working directory inside sandbox |
| `setup_commands` | Commands to run when session is created |
| `rootfs_image` | Custom rootfs image path (Firecracker only) |

#### Persistent Storage with Presets

Mount a host directory for data that persists across sessions:

```toml
[presets.myenv]
mounts = [
  ["~/.bashlet/data/myenv", "/data", false]  # writable persistent storage
]
setup_commands = ["test -d /data/cache || mkdir -p /data/cache"]
```

#### Firecracker with Persistent Rootfs

For full Linux environment persistence, use Firecracker with a custom rootfs image:

```toml
[presets.dev-vm]
backend = "firecracker"
rootfs_image = "~/.bashlet/images/dev.ext4"
setup_commands = ["echo 'VM ready'"]
```

Changes to the rootfs (installed packages, modified files) persist across sessions.

## Command Reference

| Command | Description |
|---------|-------------|
| `bashlet exec "command"` | One-shot command execution in sandbox |
| `bashlet exec --preset NAME "command"` | One-shot with preset configuration |
| `bashlet create` | Create a new persistent session |
| `bashlet create --preset NAME` | Create session with preset |
| `bashlet run SESSION "command"` | Run command in an existing session |
| `bashlet run SESSION -C "command"` | Run command, creating session if missing |
| `bashlet run SESSION -C --preset NAME "command"` | Run with auto-create and preset |
| `bashlet list` | List all active sessions |
| `bashlet terminate SESSION` | Terminate a session |

### Exec Options

```
bashlet exec [OPTIONS] <COMMAND>

Arguments:
  <COMMAND>  The shell command to execute

Options:
  -p, --preset <PRESET>    Apply a preset configuration
  -m, --mount <MOUNT>      Mount host directories (host_path:guest_path[:ro])
  -e, --env <ENV>          Environment variables (KEY=VALUE)
  -w, --workdir <DIR>      Working directory in sandbox [default: /workspace]
  -b, --backend <BACKEND>  Sandbox backend: auto, wasmer, firecracker [default: auto]
  -v, --verbose            Enable verbose output
  -h, --help               Print help
```

### Create Options

```
bashlet create [OPTIONS]

Options:
  -n, --name <NAME>        Session name (auto-generated if not provided)
  -p, --preset <PRESET>    Apply a preset configuration
  -m, --mount <MOUNT>      Mount host directories (host_path:guest_path[:ro])
  -e, --env <ENV>          Environment variables (KEY=VALUE)
  -w, --workdir <DIR>      Working directory in sandbox [default: /workspace]
      --ttl <TTL>          Time-to-live (e.g., 30m, 1h, 2d)
  -h, --help               Print help
```

### Run Options

```
bashlet run [OPTIONS] <SESSION> <COMMAND>

Arguments:
  <SESSION>  Session ID or name
  <COMMAND>  The shell command to execute

Options:
  -C, --create             Create the session if it doesn't exist
  -p, --preset <PRESET>    Apply a preset configuration (requires --create)
  -m, --mount <MOUNT>      Mount host directories (requires --create)
  -e, --env <ENV>          Environment variables (requires --create)
      --workdir <DIR>      Working directory in sandbox (requires --create)
      --ttl <TTL>          Time-to-live (requires --create)
  -h, --help               Print help
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

## Backends

### Auto (Default)

Automatically selects the best available backend:
- Uses **Firecracker** on Linux with KVM support
- Falls back to **Wasmer** on other platforms

### Wasmer

WASM-based sandbox using [Wasmer](https://wasmer.io/) runtime.

| Feature | Support |
|---------|---------|
| Platforms | macOS, Linux, Windows |
| Startup time | ~50ms |
| Isolation | WASM sandbox |
| Native Linux commands | Limited (WASI/WASIX) |
| Networking | No |

### Firecracker

MicroVM-based sandbox using [Firecracker](https://firecracker-microvm.github.io/).

| Feature | Support |
|---------|---------|
| Platforms | Linux with KVM |
| Startup time | ~125ms (VM boot) |
| Isolation | Hardware-level VM |
| Native Linux commands | Full support |
| Networking | Optional |

**Requirements for Firecracker:**
- Linux kernel with KVM support
- Access to `/dev/kvm` (add user to `kvm` group)

```bash
# Check KVM support
ls -la /dev/kvm

# Add user to kvm group if needed
sudo usermod -aG kvm $USER
```

## How It Works

### Wasmer Backend

1. **Auto-download**: Downloads Wasmer binary and bash WEBC package on first run
2. **Execution**: Commands run via `wasmer run` with directory mounts and env vars
3. **Isolation**: WASM sandbox provides memory and filesystem isolation

### Firecracker Backend

1. **Auto-download**: Downloads Firecracker binary, Linux kernel, and rootfs on first run
2. **VM Boot**: Starts a lightweight microVM (~5MB memory overhead)
3. **Guest Agent**: Communicates with VM via vsock for command execution
4. **Isolation**: Hardware-level isolation via KVM

### Session Persistence

Sessions are stored as JSON files and can be resumed across CLI invocations.

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
[sandbox]
backend = "auto"  # auto, wasmer, or firecracker
default_workdir = "/workspace"
memory_limit_mb = 256
timeout_seconds = 300

[sandbox.firecracker]
vcpu_count = 1
enable_networking = false

# Presets for reusable environment configurations
[presets.kubectl]
mounts = [
  ["/usr/local/bin/kubectl", "/usr/local/bin/kubectl", true],
  ["~/.kube", "/home/.kube", true]
]
env_vars = [["KUBECONFIG", "/home/.kube/config"]]
setup_commands = ["kubectl version --client"]

[presets.python]
mounts = [["~/.bashlet/data/python", "/data", false]]
env_vars = [["PYTHONUNBUFFERED", "1"]]
workdir = "/app"

[presets.dev-vm]
backend = "firecracker"
rootfs_image = "~/.bashlet/images/dev.ext4"
env_vars = [["EDITOR", "vim"]]
```

## License

MIT
