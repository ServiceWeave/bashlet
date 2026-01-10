mod backends;
mod factory;
mod traits;

#[cfg(feature = "wasmer")]
pub use backends::WasmerBackend;

#[cfg(all(feature = "firecracker", target_os = "linux"))]
pub use backends::FirecrackerBackend;

pub use factory::{available_backends, create_backend, BackendInfo, RuntimeConfig};
pub use traits::{BackendCapabilities, SandboxBackend, SandboxInfo};

/// Result of executing a command in the sandbox.
#[derive(Debug)]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}
