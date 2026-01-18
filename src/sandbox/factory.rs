use crate::cli::args::Mount;
use crate::config::types::{BackendType, SandboxConfig as ConfigSandboxConfig};
use crate::error::{BashletError, Result};
use crate::sandbox::traits::SandboxBackend;

#[cfg(feature = "wasmer")]
use crate::sandbox::backends::WasmerBackend;

#[cfg(all(feature = "firecracker", target_os = "linux"))]
use crate::sandbox::backends::FirecrackerBackend;

use crate::sandbox::backends::DockerBackend;

/// Runtime configuration for creating a sandbox backend.
///
/// This combines the persistent configuration from the config file
/// with the runtime parameters (mounts, env vars, etc.) from the CLI.
pub struct RuntimeConfig {
    pub mounts: Vec<Mount>,
    pub env_vars: Vec<(String, String)>,
    pub workdir: String,
    pub memory_limit_mb: u64,
    #[allow(dead_code)]
    pub timeout_seconds: u64,
}

/// Create a sandbox backend based on the configuration.
///
/// This factory function selects and instantiates the appropriate backend
/// based on the configured backend type and platform availability.
pub async fn create_backend(
    config: &ConfigSandboxConfig,
    runtime: RuntimeConfig,
) -> Result<Box<dyn SandboxBackend>> {
    let backend_type = resolve_backend_type(&config.backend)?;

    match backend_type {
        #[cfg(feature = "wasmer")]
        BackendType::Wasmer => {
            let backend = WasmerBackend::new(
                config.wasmer.clone(),
                runtime.mounts,
                runtime.env_vars,
                runtime.workdir,
            )
            .await?;
            Ok(Box::new(backend))
        }
        #[cfg(not(feature = "wasmer"))]
        BackendType::Wasmer => Err(BashletError::BackendNotAvailable {
            backend: "wasmer".to_string(),
            reason: "Wasmer support was not compiled in".to_string(),
        }),

        #[cfg(all(feature = "firecracker", target_os = "linux"))]
        BackendType::Firecracker => {
            let backend = FirecrackerBackend::new(
                config.firecracker.clone(),
                runtime.mounts,
                runtime.env_vars,
                runtime.workdir,
                runtime.memory_limit_mb,
            )
            .await?;
            Ok(Box::new(backend))
        }
        #[cfg(not(all(feature = "firecracker", target_os = "linux")))]
        BackendType::Firecracker => Err(BashletError::BackendNotAvailable {
            backend: "firecracker".to_string(),
            reason: if cfg!(target_os = "linux") {
                "Firecracker support was not compiled in. Rebuild with --features firecracker"
                    .to_string()
            } else {
                "Firecracker is only available on Linux".to_string()
            },
        }),

        BackendType::Docker => {
            let backend = DockerBackend::new(
                config.docker.clone(),
                runtime.mounts,
                runtime.env_vars,
                runtime.workdir,
                runtime.memory_limit_mb,
            )
            .await?;
            Ok(Box::new(backend))
        }

        BackendType::Auto => {
            // Already resolved by resolve_backend_type
            unreachable!()
        }
    }
}

/// Resolve the backend type, handling Auto selection.
fn resolve_backend_type(requested: &BackendType) -> Result<BackendType> {
    match requested {
        BackendType::Auto => {
            // Priority: Firecracker (Linux + KVM) > Docker > Wasmer
            #[cfg(all(feature = "firecracker", target_os = "linux"))]
            {
                if FirecrackerBackend::is_available() {
                    return Ok(BackendType::Firecracker);
                }
            }

            if DockerBackend::is_available() {
                return Ok(BackendType::Docker);
            }

            #[cfg(feature = "wasmer")]
            {
                return Ok(BackendType::Wasmer);
            }

            #[cfg(not(feature = "wasmer"))]
            {
                return Err(BashletError::BackendNotAvailable {
                    backend: "auto".to_string(),
                    reason: "No sandbox backends available".to_string(),
                });
            }
        }
        BackendType::Firecracker => {
            #[cfg(all(feature = "firecracker", target_os = "linux"))]
            {
                if !FirecrackerBackend::is_available() {
                    return Err(BashletError::BackendNotAvailable {
                        backend: "firecracker".to_string(),
                        reason: "Firecracker requires Linux with KVM support (/dev/kvm)"
                            .to_string(),
                    });
                }
            }
            Ok(BackendType::Firecracker)
        }
        BackendType::Docker => {
            if !DockerBackend::is_available() {
                return Err(BashletError::BackendNotAvailable {
                    backend: "docker".to_string(),
                    reason: "Docker daemon is not accessible. Ensure Docker is installed and running."
                        .to_string(),
                });
            }
            Ok(BackendType::Docker)
        }
        other => Ok(other.clone()),
    }
}

/// Get information about available backends on this system.
pub fn available_backends() -> Vec<BackendInfo> {
    let mut backends = Vec::new();

    #[cfg(feature = "wasmer")]
    {
        backends.push(BackendInfo {
            name: "wasmer",
            available: WasmerBackend::is_available(),
            description: "WebAssembly sandbox (cross-platform)",
            unavailable_reason: if WasmerBackend::is_available() {
                None
            } else {
                Some("Wasmer CLI not installed")
            },
        });
    }

    #[cfg(not(feature = "wasmer"))]
    {
        backends.push(BackendInfo {
            name: "wasmer",
            available: false,
            description: "WebAssembly sandbox (cross-platform)",
            unavailable_reason: Some("Not compiled in (use --features wasmer)"),
        });
    }

    #[cfg(all(feature = "firecracker", target_os = "linux"))]
    {
        backends.push(BackendInfo {
            name: "firecracker",
            available: FirecrackerBackend::is_available(),
            description: "MicroVM sandbox (Linux with KVM only)",
            unavailable_reason: if FirecrackerBackend::is_available() {
                None
            } else {
                Some("Requires Linux with KVM (/dev/kvm)")
            },
        });
    }

    #[cfg(not(all(feature = "firecracker", target_os = "linux")))]
    {
        backends.push(BackendInfo {
            name: "firecracker",
            available: false,
            description: "MicroVM sandbox (Linux with KVM only)",
            unavailable_reason: Some(if cfg!(target_os = "linux") {
                "Not compiled in (use --features firecracker)"
            } else {
                "Only available on Linux"
            }),
        });
    }

    backends.push(BackendInfo {
        name: "docker",
        available: DockerBackend::is_available(),
        description: "Docker container sandbox",
        unavailable_reason: if DockerBackend::is_available() {
            None
        } else {
            Some("Docker daemon not accessible")
        },
    });

    backends
}

/// Information about a sandbox backend.
pub struct BackendInfo {
    pub name: &'static str,
    pub available: bool,
    pub description: &'static str,
    pub unavailable_reason: Option<&'static str>,
}
