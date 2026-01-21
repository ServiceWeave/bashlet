use clap::ValueEnum;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct BashletConfig {
    pub sandbox: SandboxConfig,
    pub presets: HashMap<String, PresetConfig>,
}

/// Configuration for a preset environment.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct PresetConfig {
    /// Backend override (wasmer, firecracker, auto)
    pub backend: Option<BackendType>,
    /// Setup commands to run on session creation
    pub setup_commands: Vec<String>,
    /// Environment variables [(KEY, VALUE), ...]
    pub env_vars: Vec<(String, String)>,
    /// Mount specifications [(host_path, guest_path, readonly), ...]
    pub mounts: Vec<(String, String, bool)>,
    /// Working directory override
    pub workdir: Option<String>,
    /// Custom rootfs image path (Firecracker only)
    pub rootfs_image: Option<PathBuf>,
}

/// The type of sandbox backend to use.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ValueEnum)]
#[serde(rename_all = "lowercase")]
pub enum BackendType {
    /// WebAssembly sandbox using Wasmer (cross-platform)
    Wasmer,
    /// Firecracker microVM (Linux with KVM only)
    Firecracker,
    /// Docker container sandbox
    Docker,
    /// Remote server via SSH
    Ssh,
    /// Automatically select the best available backend
    #[default]
    Auto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SandboxConfig {
    /// Which backend to use
    pub backend: BackendType,
    /// Default working directory
    pub default_workdir: String,
    /// Memory limit in MB
    pub memory_limit_mb: u64,
    /// Command timeout in seconds
    pub timeout_seconds: u64,
    /// Default idle timeout for sessions (e.g., "30m", "1h", "2d")
    /// Sessions will automatically expire after this duration of no command execution.
    /// If not set, sessions have no expiration unless --ttl is specified.
    pub default_idle_timeout: Option<String>,
    /// Wasmer-specific configuration
    pub wasmer: WasmerConfig,
    /// Firecracker-specific configuration
    pub firecracker: FirecrackerConfig,
    /// Docker-specific configuration
    pub docker: DockerConfig,
    /// SSH-specific configuration
    pub ssh: SshConfig,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            backend: BackendType::default(),
            default_workdir: "/workspace".to_string(),
            memory_limit_mb: 256,
            timeout_seconds: 300,
            default_idle_timeout: None,
            wasmer: WasmerConfig::default(),
            firecracker: FirecrackerConfig::default(),
            docker: DockerConfig::default(),
            ssh: SshConfig::default(),
        }
    }
}

/// Wasmer-specific configuration.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct WasmerConfig {
    /// Path to custom WASM binary (bash.wasm)
    pub wasm_binary: Option<PathBuf>,
}

/// Firecracker-specific configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct FirecrackerConfig {
    /// Path to Firecracker binary (auto-detected if not set)
    pub binary_path: Option<PathBuf>,
    /// Path to Linux kernel image
    pub kernel_path: Option<PathBuf>,
    /// Path to root filesystem image
    pub rootfs_path: Option<PathBuf>,
    /// Number of vCPUs for the microVM
    pub vcpu_count: u8,
    /// Enable networking in the microVM
    pub enable_networking: bool,
}

impl Default for FirecrackerConfig {
    fn default() -> Self {
        Self {
            binary_path: None,
            kernel_path: None,
            rootfs_path: None,
            vcpu_count: 1,
            enable_networking: false,
        }
    }
}

/// Docker-specific configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DockerConfig {
    /// Custom Docker image name (default: bashlet-sandbox:latest)
    pub image: Option<String>,
    /// Automatically build the image if it doesn't exist (default: true)
    pub build_image: bool,
    /// Enable networking in the container (default: false)
    pub enable_networking: bool,
    /// Enable session mode for persistent container (default: false)
    /// When enabled, a single container stays running and commands are executed via docker exec.
    /// The container is only terminated when shutdown() is called.
    pub session_mode: bool,
}

impl Default for DockerConfig {
    fn default() -> Self {
        Self {
            image: None,
            build_image: true,
            enable_networking: false,
            session_mode: false,
        }
    }
}

/// SSH-specific configuration for remote execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SshConfig {
    /// Remote host to connect to (hostname or IP address)
    pub host: String,
    /// SSH port (default: 22)
    pub port: u16,
    /// Username for SSH connection
    pub user: String,
    /// Path to SSH private key file (optional, uses ssh-agent or default keys if not set)
    pub key_file: Option<PathBuf>,
    /// Use SSH ControlMaster for persistent connections (default: true)
    pub use_control_master: bool,
    /// Timeout for SSH connection in seconds (default: 30)
    pub connect_timeout: u64,
}

impl Default for SshConfig {
    fn default() -> Self {
        Self {
            host: String::new(),
            port: 22,
            user: String::new(),
            key_file: None,
            use_control_master: true,
            connect_timeout: 30,
        }
    }
}
