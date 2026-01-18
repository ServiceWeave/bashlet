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
    /// Wasmer-specific configuration
    pub wasmer: WasmerConfig,
    /// Firecracker-specific configuration
    pub firecracker: FirecrackerConfig,
    /// Docker-specific configuration
    pub docker: DockerConfig,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            backend: BackendType::default(),
            default_workdir: "/workspace".to_string(),
            memory_limit_mb: 256,
            timeout_seconds: 300,
            wasmer: WasmerConfig::default(),
            firecracker: FirecrackerConfig::default(),
            docker: DockerConfig::default(),
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
