mod api;
mod assets;
mod vm;
mod vsock;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::Mutex;
use tracing::{debug, info};

use crate::cli::args::Mount;
use crate::config::types::FirecrackerConfig;
use crate::error::{BashletError, Result};
use crate::sandbox::traits::{BackendCapabilities, SandboxBackend, SandboxInfo};
use crate::sandbox::CommandResult;

use self::assets::AssetManager;
use self::vm::FirecrackerVM;
use self::vsock::VsockClient;

/// Firecracker microVM sandbox backend.
///
/// Uses Firecracker to run commands in a lightweight microVM, providing
/// full native Linux environment support with hardware-level isolation.
pub struct FirecrackerBackend {
    /// The running Firecracker VM
    vm: Arc<Mutex<FirecrackerVM>>,
    /// Client for communicating with the guest agent via vsock
    client: Arc<Mutex<VsockClient>>,
    /// Configuration
    config: FirecrackerConfig,
    /// Unique instance identifier
    instance_id: String,
    /// Working directory inside the VM
    workdir: String,
}

impl FirecrackerBackend {
    /// Create a new Firecracker backend.
    pub async fn new(
        config: FirecrackerConfig,
        mounts: Vec<Mount>,
        env_vars: Vec<(String, String)>,
        workdir: String,
        memory_mb: u64,
    ) -> Result<Self> {
        // Check platform availability
        Self::check_availability()?;

        let instance_id = generate_instance_id();
        info!(instance_id = %instance_id, "Starting Firecracker VM");

        let assets = AssetManager::new();

        // Get or download kernel, rootfs, and firecracker binary
        let kernel_path = assets.get_kernel(config.kernel_path.as_ref()).await?;
        let rootfs_path = assets.create_rootfs_copy(&instance_id).await?;
        let binary_path = assets
            .get_firecracker_binary(config.binary_path.as_ref())
            .await?;

        // Generate socket path
        let socket_path = std::env::temp_dir().join(format!("firecracker-{}.sock", instance_id));

        // Spawn and configure VM
        let mut vm = FirecrackerVM::spawn(&binary_path, &socket_path).await?;

        vm.configure(vm::VMConfig {
            kernel_path,
            rootfs_path: rootfs_path.clone(),
            vcpu_count: config.vcpu_count,
            memory_mb,
            boot_args: "console=ttyS0 reboot=k panic=1 pci=off".to_string(),
        })
        .await?;

        // Configure mounts and environment (will be handled by guest agent)
        vm.set_mounts(mounts);
        vm.set_env_vars(env_vars);

        // Start the VM
        vm.start().await?;

        // Connect to guest agent via vsock
        let vsock_path = socket_path.with_extension("vsock");
        let client = VsockClient::connect(&vsock_path).await?;

        Ok(Self {
            vm: Arc::new(Mutex::new(vm)),
            client: Arc::new(Mutex::new(client)),
            config,
            instance_id,
            workdir,
        })
    }

    /// Check if Firecracker is available on this system.
    pub fn is_available() -> bool {
        Self::check_availability().is_ok()
    }

    /// Check platform requirements for Firecracker.
    ///
    /// Only checks for KVM availability since the Firecracker binary
    /// can be automatically downloaded at runtime if not present.
    fn check_availability() -> Result<()> {
        #[cfg(not(target_os = "linux"))]
        {
            return Err(BashletError::BackendNotAvailable {
                backend: "firecracker".to_string(),
                reason: "Firecracker is only available on Linux".to_string(),
            });
        }

        #[cfg(target_os = "linux")]
        {
            // Check KVM availability
            if !std::path::Path::new("/dev/kvm").exists() {
                return Err(BashletError::BackendNotAvailable {
                    backend: "firecracker".to_string(),
                    reason: "KVM is not available (/dev/kvm not found)".to_string(),
                });
            }

            // Check if we can access KVM
            use std::os::unix::fs::MetadataExt;
            match std::fs::metadata("/dev/kvm") {
                Ok(metadata) => {
                    let mode = metadata.mode();
                    // Check if readable (we need at least read access)
                    if mode & 0o004 == 0 && mode & 0o040 == 0 && mode & 0o400 == 0 {
                        return Err(BashletError::BackendNotAvailable {
                            backend: "firecracker".to_string(),
                            reason: "No permission to access /dev/kvm. Add user to 'kvm' group."
                                .to_string(),
                        });
                    }
                }
                Err(e) => {
                    return Err(BashletError::BackendNotAvailable {
                        backend: "firecracker".to_string(),
                        reason: format!("Cannot access /dev/kvm: {}", e),
                    });
                }
            }

            // Note: We don't check for the firecracker binary here because
            // it can be automatically downloaded at runtime by AssetManager

            Ok(())
        }
    }
}

#[async_trait]
impl SandboxBackend for FirecrackerBackend {
    fn name(&self) -> &str {
        "firecracker"
    }

    fn capabilities(&self) -> BackendCapabilities {
        BackendCapabilities {
            native_linux: true,
            networking: self.config.enable_networking,
            persistent_fs: true,
        }
    }

    async fn execute(&self, command: &str) -> Result<CommandResult> {
        debug!(command = %command, "Executing command in Firecracker VM");
        let mut client = self.client.lock().await;
        client.execute(command, &self.workdir).await
    }

    async fn write_file(&self, path: &str, content: &str) -> Result<()> {
        let mut client = self.client.lock().await;
        client.write_file(path, content).await
    }

    async fn read_file(&self, path: &str) -> Result<String> {
        let mut client = self.client.lock().await;
        client.read_file(path).await
    }

    async fn list_dir(&self, path: &str) -> Result<String> {
        // Use execute to run ls command
        self.execute(&format!("ls -la '{}'", path))
            .await
            .map(|r| r.stdout)
    }

    fn info(&self) -> SandboxInfo {
        SandboxInfo {
            backend_type: "firecracker".to_string(),
            instance_id: Some(self.instance_id.clone()),
            running: true,
            metadata: HashMap::from([
                ("vcpu_count".to_string(), self.config.vcpu_count.to_string()),
                (
                    "networking".to_string(),
                    self.config.enable_networking.to_string(),
                ),
            ]),
        }
    }

    async fn shutdown(&self) -> Result<()> {
        info!(instance_id = %self.instance_id, "Shutting down Firecracker VM");
        let mut vm = self.vm.lock().await;
        vm.shutdown().await
    }
}

impl Drop for FirecrackerBackend {
    fn drop(&mut self) {
        // Best-effort cleanup - we can't await in drop
        // The VM process should be cleaned up when the socket is closed
    }
}

fn generate_instance_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("fc-{:x}", timestamp)
}
