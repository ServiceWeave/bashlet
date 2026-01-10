use clap::ValueEnum;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct BashletConfig {
    pub agent: AgentConfig,
    pub sandbox: SandboxConfig,
    pub providers: HashMap<String, ProviderConfig>,
}

/// The type of sandbox backend to use.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ValueEnum)]
#[serde(rename_all = "lowercase")]
pub enum BackendType {
    /// WebAssembly sandbox using Wasmer (cross-platform)
    Wasmer,
    /// Firecracker microVM (Linux with KVM only)
    Firecracker,
    /// Automatically select the best available backend
    #[default]
    Auto,
}

impl Default for BashletConfig {
    fn default() -> Self {
        Self {
            agent: AgentConfig::default(),
            sandbox: SandboxConfig::default(),
            providers: HashMap::from([
                ("anthropic".to_string(), ProviderConfig::anthropic_default()),
                ("openai".to_string(), ProviderConfig::openai_default()),
            ]),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AgentConfig {
    pub default_provider: String,
    pub default_model: Option<String>,
    pub max_iterations: u32,
    pub temperature: f32,
    pub max_tokens: u32,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            default_provider: "anthropic".to_string(),
            default_model: None,
            max_iterations: 50,
            temperature: 0.0,
            max_tokens: 4096,
        }
    }
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub api_key_env: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    pub default_model: String,
    pub models: Vec<String>,
}

impl ProviderConfig {
    pub fn anthropic_default() -> Self {
        Self {
            api_key_env: "ANTHROPIC_API_KEY".to_string(),
            base_url: None,
            default_model: "claude-sonnet-4-20250514".to_string(),
            models: vec![
                "claude-sonnet-4-20250514".to_string(),
                "claude-opus-4-20250514".to_string(),
            ],
        }
    }

    pub fn openai_default() -> Self {
        Self {
            api_key_env: "OPENAI_API_KEY".to_string(),
            base_url: None,
            default_model: "gpt-4o".to_string(),
            models: vec!["gpt-4o".to_string(), "gpt-4o-mini".to_string()],
        }
    }
}
