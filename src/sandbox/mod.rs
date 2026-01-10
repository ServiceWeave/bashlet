mod executor;

use std::path::PathBuf;

pub use executor::SandboxExecutor;

use crate::cli::args::Mount;

#[derive(Debug, Clone)]
pub struct SandboxConfig {
    pub wasm_binary: Option<PathBuf>,
    pub mounts: Vec<Mount>,
    /// CLI tools from Wasmer registry to include (e.g., "python", "cowsay")
    pub tools: Vec<String>,
    pub env_vars: Vec<(String, String)>,
    pub workdir: String,
    pub memory_limit_mb: u64,
    pub timeout_seconds: u64,
}

#[derive(Debug)]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}
