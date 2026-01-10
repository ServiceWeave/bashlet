use std::collections::HashMap;

use async_trait::async_trait;

use crate::error::Result;
use crate::sandbox::CommandResult;

/// Capability flags indicating what the backend supports
#[derive(Debug, Clone, Default)]
pub struct BackendCapabilities {
    /// Supports full Linux environment (native binaries, not WASM)
    pub native_linux: bool,
    /// Supports networking inside the sandbox
    pub networking: bool,
    /// Supports persistent filesystem across commands
    pub persistent_fs: bool,
}

/// Information about the running sandbox instance
#[derive(Debug, Clone)]
pub struct SandboxInfo {
    /// Backend type identifier
    pub backend_type: String,
    /// Instance identifier (VM ID, container ID, etc.)
    pub instance_id: Option<String>,
    /// Whether the sandbox is currently running
    pub running: bool,
    /// Additional backend-specific metadata
    pub metadata: HashMap<String, String>,
}

/// Trait for sandbox execution backends.
///
/// This trait abstracts the execution environment, allowing different backends
/// (Wasmer WASM, Firecracker microVMs, etc.) to be used interchangeably.
#[async_trait]
pub trait SandboxBackend: Send + Sync {
    /// Returns the backend name (e.g., "wasmer", "firecracker")
    fn name(&self) -> &str;

    /// Returns the capabilities of this backend
    fn capabilities(&self) -> BackendCapabilities;

    /// Execute a shell command inside the sandbox
    async fn execute(&self, command: &str) -> Result<CommandResult>;

    /// Write a file inside the sandbox
    async fn write_file(&self, path: &str, content: &str) -> Result<()>;

    /// Read a file from the sandbox
    async fn read_file(&self, path: &str) -> Result<String>;

    /// List directory contents
    async fn list_dir(&self, path: &str) -> Result<String>;

    /// Get information about the sandbox instance
    fn info(&self) -> SandboxInfo;

    /// Gracefully shutdown the sandbox.
    /// Default implementation is a no-op for stateless backends.
    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    /// Check if the backend is healthy and ready to accept commands.
    /// Default implementation tries a simple echo command.
    async fn health_check(&self) -> Result<bool> {
        match self.execute("echo ok").await {
            Ok(result) => Ok(result.exit_code == 0),
            Err(_) => Ok(false),
        }
    }
}
