use std::path::PathBuf;
use std::process::{Child, Stdio};
use std::time::Duration;

use tokio::process::Command;
use tracing::{debug, info, warn};

use crate::cli::args::Mount;
use crate::error::{BashletError, Result};

use super::api::FirecrackerApiClient;

/// Configuration for a Firecracker VM.
pub struct VMConfig {
    pub kernel_path: PathBuf,
    pub rootfs_path: PathBuf,
    pub vcpu_count: u8,
    pub memory_mb: u64,
    pub boot_args: String,
}

/// Manages the lifecycle of a Firecracker microVM.
pub struct FirecrackerVM {
    /// Handle to the Firecracker process
    process: std::process::Child,
    /// Path to the API socket
    socket_path: PathBuf,
    /// Path to the vsock UDS
    vsock_path: PathBuf,
    /// API client for configuration
    api: Option<FirecrackerApiClient>,
    /// Whether the VM has been started
    started: bool,
    /// Mounts to pass to guest agent
    mounts: Vec<Mount>,
    /// Environment variables to pass to guest agent
    env_vars: Vec<(String, String)>,
}

impl FirecrackerVM {
    /// Spawn a new Firecracker process.
    pub async fn spawn(binary_path: &PathBuf, socket_path: &PathBuf) -> Result<Self> {
        info!(socket = %socket_path.display(), "Spawning Firecracker process");

        // Remove existing socket if present
        let _ = std::fs::remove_file(socket_path);

        // Spawn firecracker with API socket
        let process = std::process::Command::new(binary_path)
            .arg("--api-sock")
            .arg(socket_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                BashletError::VMBootFailed(format!("Failed to spawn Firecracker: {}", e))
            })?;

        // Wait for socket to be ready
        Self::wait_for_socket(socket_path).await?;

        // Create API client
        let api = FirecrackerApiClient::new(socket_path).await?;

        let vsock_path = socket_path.with_extension("vsock");

        Ok(Self {
            process,
            socket_path: socket_path.clone(),
            vsock_path,
            api: Some(api),
            started: false,
            mounts: Vec::new(),
            env_vars: Vec::new(),
        })
    }

    /// Wait for the API socket to become available.
    async fn wait_for_socket(socket_path: &PathBuf) -> Result<()> {
        let max_attempts = 50;
        let delay = Duration::from_millis(100);

        for attempt in 1..=max_attempts {
            if socket_path.exists() {
                debug!(attempt = attempt, "Socket ready");
                return Ok(());
            }
            tokio::time::sleep(delay).await;
        }

        Err(BashletError::VMBootFailed(format!(
            "Timeout waiting for socket: {}",
            socket_path.display()
        )))
    }

    /// Configure the VM with kernel, rootfs, and resources.
    pub async fn configure(&mut self, config: VMConfig) -> Result<()> {
        let api = self
            .api
            .as_ref()
            .ok_or_else(|| BashletError::VMBootFailed("API client not initialized".to_string()))?;

        info!(
            kernel = %config.kernel_path.display(),
            rootfs = %config.rootfs_path.display(),
            vcpus = config.vcpu_count,
            memory_mb = config.memory_mb,
            "Configuring VM"
        );

        // Configure boot source
        api.put_boot_source(&config.kernel_path, &config.boot_args)
            .await?;

        // Configure machine
        api.put_machine_config(config.vcpu_count, config.memory_mb)
            .await?;

        // Add root drive
        api.put_drive("rootfs", &config.rootfs_path, false).await?;

        // Configure vsock for guest-host communication
        // Guest CID 3 is conventional (0, 1, 2 are reserved)
        api.put_vsock(3, &self.vsock_path).await?;

        Ok(())
    }

    /// Set mounts to be configured via guest agent.
    pub fn set_mounts(&mut self, mounts: Vec<Mount>) {
        self.mounts = mounts;
    }

    /// Set environment variables to be configured via guest agent.
    pub fn set_env_vars(&mut self, env_vars: Vec<(String, String)>) {
        self.env_vars = env_vars;
    }

    /// Start the VM.
    pub async fn start(&mut self) -> Result<()> {
        let api = self
            .api
            .as_ref()
            .ok_or_else(|| BashletError::VMBootFailed("API client not initialized".to_string()))?;

        info!("Starting VM");
        api.put_actions("InstanceStart").await?;

        self.started = true;

        // Wait for VM to boot and agent to be ready
        self.wait_for_boot().await?;

        Ok(())
    }

    /// Wait for the VM to boot and the guest agent to be ready.
    async fn wait_for_boot(&self) -> Result<()> {
        let max_attempts = 100;
        let delay = Duration::from_millis(100);

        info!("Waiting for VM to boot...");

        for attempt in 1..=max_attempts {
            // Check if vsock socket exists (agent will create it)
            if self.vsock_path.exists() {
                debug!(attempt = attempt, "VM booted, vsock ready");
                return Ok(());
            }
            tokio::time::sleep(delay).await;
        }

        Err(BashletError::VMBootFailed(
            "Timeout waiting for VM to boot".to_string(),
        ))
    }

    /// Shutdown the VM gracefully.
    pub async fn shutdown(&mut self) -> Result<()> {
        if self.started {
            if let Some(api) = &self.api {
                // Try graceful shutdown
                if let Err(e) = api.put_actions("SendCtrlAltDel").await {
                    warn!(error = %e, "Graceful shutdown failed, forcing");
                }
            }

            // Give it a moment to shutdown gracefully
            tokio::time::sleep(Duration::from_millis(500)).await;
        }

        // Kill the process if still running
        let _ = self.process.kill();

        // Cleanup sockets
        let _ = std::fs::remove_file(&self.socket_path);
        let _ = std::fs::remove_file(&self.vsock_path);

        self.started = false;
        Ok(())
    }

    /// Get the vsock path for connecting to the guest agent.
    pub fn vsock_path(&self) -> &PathBuf {
        &self.vsock_path
    }
}

impl Drop for FirecrackerVM {
    fn drop(&mut self) {
        // Best-effort cleanup
        let _ = self.process.kill();
        let _ = std::fs::remove_file(&self.socket_path);
        let _ = std::fs::remove_file(&self.vsock_path);
    }
}
