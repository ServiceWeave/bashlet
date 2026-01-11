use clap::{Args, Parser, Subcommand, ValueEnum};
use std::path::PathBuf;

use crate::config::types::BackendType;

#[derive(Parser, Debug)]
#[clap(name = "bashlet")]
#[clap(version, about = "Sandboxed bash execution environment")]
#[clap(propagate_version = true)]
pub struct Cli {
    #[clap(flatten)]
    pub global_opts: GlobalOpts,

    #[clap(subcommand)]
    pub command: Commands,
}

#[derive(Args, Debug)]
pub struct GlobalOpts {
    /// Configuration file path
    #[clap(short, long, global = true, env = "BASHLET_CONFIG")]
    pub config: Option<PathBuf>,

    /// Verbosity level (-v, -vv, -vvv)
    #[clap(short, long, global = true, action = clap::ArgAction::Count)]
    pub verbose: u8,

    /// Output format
    #[clap(long, global = true, default_value = "text", value_enum)]
    pub format: OutputFormat,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Create a new sandbox session
    Create(CreateArgs),

    /// Execute a command in an existing session
    Run(SessionRunArgs),

    /// Terminate a session
    Terminate(TerminateArgs),

    /// Execute a one-shot command (create, run, terminate in one step)
    Exec(ExecArgs),

    /// List all active sessions
    List(ListArgs),

    /// Initialize a new bashlet configuration
    Init(InitArgs),

    /// Manage configuration
    Config(ConfigArgs),
}

// ============================================================================
// Session Commands
// ============================================================================

#[derive(Args, Debug)]
pub struct CreateArgs {
    /// Session name (optional, auto-generated if not provided)
    #[clap(long, short = 'n')]
    pub name: Option<String>,

    /// Mount host directories into sandbox (host_path:guest_path[:ro])
    #[clap(long = "mount", short = 'm', value_parser = parse_mount)]
    pub mounts: Vec<Mount>,

    /// Environment variables to set in sandbox (KEY=VALUE)
    #[clap(long = "env", short = 'e', value_parser = parse_env_var)]
    pub env_vars: Vec<(String, String)>,

    /// Working directory inside sandbox
    #[clap(long, default_value = "/workspace")]
    pub workdir: String,

    /// WASM binary to use as sandbox environment
    #[clap(long)]
    pub wasm: Option<PathBuf>,

    /// Session time-to-live (e.g., "5m", "1h", "30s"). Session expires after this idle time.
    #[clap(long)]
    pub ttl: Option<String>,
}

#[derive(Args, Debug)]
pub struct SessionRunArgs {
    /// Session ID or name
    pub session: String,

    /// Command to execute
    pub command: String,
}

#[derive(Args, Debug)]
pub struct TerminateArgs {
    /// Session ID or name
    pub session: String,
}

#[derive(Args, Debug)]
pub struct ExecArgs {
    /// Command to execute
    pub command: String,

    /// Sandbox backend to use (wasmer, firecracker, auto)
    #[clap(long, short = 'b', value_enum)]
    pub backend: Option<BackendType>,

    /// Mount host directories into sandbox (host_path:guest_path[:ro])
    #[clap(long = "mount", short = 'm', value_parser = parse_mount)]
    pub mounts: Vec<Mount>,

    /// Environment variables to set in sandbox (KEY=VALUE)
    #[clap(long = "env", short = 'e', value_parser = parse_env_var)]
    pub env_vars: Vec<(String, String)>,

    /// Working directory inside sandbox
    #[clap(long, default_value = "/workspace")]
    pub workdir: String,

    /// WASM binary to use as sandbox environment (deprecated, use --backend wasmer)
    #[clap(long)]
    pub wasm: Option<PathBuf>,
}

#[derive(Args, Debug)]
pub struct ListArgs {
    /// Show all sessions including expired (for debugging)
    #[clap(long)]
    pub all: bool,
}

// ============================================================================
// Config Commands
// ============================================================================

#[derive(Args, Debug)]
pub struct InitArgs {
    /// Force overwrite existing configuration
    #[clap(short, long)]
    pub force: bool,
}

#[derive(Args, Debug)]
pub struct ConfigArgs {
    #[clap(subcommand)]
    pub action: ConfigAction,
}

#[derive(Subcommand, Debug)]
pub enum ConfigAction {
    /// Show current configuration
    Show,
    /// Show configuration file path
    Path,
}

// ============================================================================
// Common Types
// ============================================================================

#[derive(Debug, Clone)]
pub struct Mount {
    pub host_path: PathBuf,
    pub guest_path: String,
    pub readonly: bool,
}

fn parse_mount(s: &str) -> Result<Mount, String> {
    // Format: host_path:guest_path[:ro]
    let parts: Vec<&str> = s.split(':').collect();
    match parts.len() {
        2 => Ok(Mount {
            host_path: PathBuf::from(parts[0]),
            guest_path: parts[1].to_string(),
            readonly: false,
        }),
        3 if parts[2] == "ro" => Ok(Mount {
            host_path: PathBuf::from(parts[0]),
            guest_path: parts[1].to_string(),
            readonly: true,
        }),
        _ => Err("Mount format: host_path:guest_path[:ro]".to_string()),
    }
}

fn parse_env_var(s: &str) -> Result<(String, String), String> {
    s.split_once('=')
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .ok_or_else(|| "Environment variable format: KEY=VALUE".to_string())
}

#[derive(Debug, Clone, Default, ValueEnum)]
pub enum OutputFormat {
    #[default]
    Text,
    Json,
}
