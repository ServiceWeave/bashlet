use std::path::PathBuf;

use tracing::{info, warn};

use crate::config::loader::get_cache_dir;
use crate::error::{BashletError, Result};

/// Firecracker release version to download.
const FIRECRACKER_VERSION: &str = "v1.10.1";

/// Default URLs for Firecracker quickstart assets.
/// These are the official AWS-provided minimal images.
const DEFAULT_KERNEL_URL: &str =
    "https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/kernels/vmlinux.bin";
const DEFAULT_ROOTFS_URL: &str =
    "https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/rootfs/bionic.rootfs.ext4";

/// Get the Firecracker binary download URL for the current architecture.
fn get_firecracker_url() -> Result<String> {
    let arch = std::env::consts::ARCH;
    let arch_str = match arch {
        "x86_64" => "x86_64",
        "aarch64" => "aarch64",
        _ => {
            return Err(BashletError::BackendNotAvailable {
                backend: "firecracker".to_string(),
                reason: format!("Unsupported architecture: {}", arch),
            });
        }
    };

    Ok(format!(
        "https://github.com/firecracker-microvm/firecracker/releases/download/{}/firecracker-{}-{}",
        FIRECRACKER_VERSION, FIRECRACKER_VERSION, arch_str
    ))
}

/// Manages kernel and rootfs assets for Firecracker VMs.
pub struct AssetManager {
    cache_dir: PathBuf,
}

impl AssetManager {
    /// Create a new asset manager.
    pub fn new() -> Self {
        Self {
            cache_dir: get_cache_dir().join("firecracker"),
        }
    }

    /// Get or download the Linux kernel image.
    pub async fn get_kernel(&self, custom_path: Option<&PathBuf>) -> Result<PathBuf> {
        if let Some(path) = custom_path {
            if path.exists() {
                return Ok(path.clone());
            }
            return Err(BashletError::AssetDownload {
                url: format!("Kernel not found: {}", path.display()),
            });
        }

        let kernel_path = self.cache_dir.join("vmlinux.bin");
        if kernel_path.exists() {
            info!(path = %kernel_path.display(), "Using cached kernel");
            return Ok(kernel_path);
        }

        info!("Downloading Firecracker kernel...");
        self.download_asset(DEFAULT_KERNEL_URL, &kernel_path)
            .await?;

        Ok(kernel_path)
    }

    /// Get or download the root filesystem image.
    pub async fn get_rootfs(&self, custom_path: Option<&PathBuf>) -> Result<PathBuf> {
        if let Some(path) = custom_path {
            if path.exists() {
                return Ok(path.clone());
            }
            return Err(BashletError::AssetDownload {
                url: format!("Rootfs not found: {}", path.display()),
            });
        }

        let rootfs_path = self.cache_dir.join("rootfs.ext4");
        if rootfs_path.exists() {
            info!(path = %rootfs_path.display(), "Using cached rootfs");
            return Ok(rootfs_path);
        }

        info!("Downloading Firecracker rootfs...");
        self.download_asset(DEFAULT_ROOTFS_URL, &rootfs_path)
            .await?;

        Ok(rootfs_path)
    }

    /// Get or download the Firecracker binary.
    ///
    /// Checks in order:
    /// 1. Custom path from config
    /// 2. System PATH
    /// 3. Cached download
    /// 4. Downloads from GitHub releases
    pub async fn get_firecracker_binary(&self, custom_path: Option<&PathBuf>) -> Result<PathBuf> {
        // 1. Check custom path from config
        if let Some(path) = custom_path {
            if path.exists() {
                info!(path = %path.display(), "Using configured Firecracker binary");
                return Ok(path.clone());
            }
            return Err(BashletError::AssetDownload {
                url: format!("Firecracker binary not found: {}", path.display()),
            });
        }

        // 2. Check if firecracker is in PATH
        if let Ok(output) = std::process::Command::new("firecracker")
            .arg("--version")
            .output()
        {
            if output.status.success() {
                if let Ok(path) = which::which("firecracker") {
                    info!(path = %path.display(), "Using system Firecracker binary");
                    return Ok(path);
                }
                // Fallback if which fails but command succeeded
                return Ok(PathBuf::from("firecracker"));
            }
        }

        // 3. Check cached binary
        let binary_path = self.cache_dir.join("firecracker");
        if binary_path.exists() {
            info!(path = %binary_path.display(), "Using cached Firecracker binary");
            return Ok(binary_path);
        }

        // 4. Download from GitHub
        info!("Downloading Firecracker binary...");
        let url = get_firecracker_url()?;
        self.download_asset(&url, &binary_path).await?;

        // Make executable
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&binary_path)?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&binary_path, perms)?;
        }

        info!(path = %binary_path.display(), "Firecracker binary ready");
        Ok(binary_path)
    }

    /// Create a writable copy of the rootfs for a VM instance.
    ///
    /// Each VM needs its own copy of the rootfs to allow writes.
    /// We use copy-on-write where supported.
    pub async fn create_rootfs_copy(&self, instance_id: &str) -> Result<PathBuf> {
        let source = self.get_rootfs(None).await?;
        let instances_dir = self.cache_dir.join("instances");
        let dest = instances_dir.join(format!("{}.rootfs.ext4", instance_id));

        tokio::fs::create_dir_all(&instances_dir).await?;

        // Try reflink copy first (copy-on-write), fall back to regular copy
        #[cfg(target_os = "linux")]
        {
            use std::process::Command;

            // Try cp --reflink=auto for COW copy
            let result = Command::new("cp")
                .arg("--reflink=auto")
                .arg(&source)
                .arg(&dest)
                .output();

            match result {
                Ok(output) if output.status.success() => {
                    info!(
                        source = %source.display(),
                        dest = %dest.display(),
                        "Created COW rootfs copy"
                    );
                    return Ok(dest);
                }
                _ => {
                    warn!("COW copy failed, falling back to regular copy");
                }
            }
        }

        // Regular copy
        tokio::fs::copy(&source, &dest).await?;
        info!(
            source = %source.display(),
            dest = %dest.display(),
            "Created rootfs copy"
        );

        Ok(dest)
    }

    /// Download an asset from a URL.
    async fn download_asset(&self, url: &str, dest: &PathBuf) -> Result<()> {
        tokio::fs::create_dir_all(&self.cache_dir).await?;

        let client =
            reqwest::Client::builder()
                .build()
                .map_err(|e| BashletError::AssetDownload {
                    url: format!("Failed to create HTTP client: {}", e),
                })?;

        info!(url = %url, "Downloading asset...");

        let response = client
            .get(url)
            .send()
            .await
            .map_err(|e| BashletError::AssetDownload {
                url: format!("{}: {}", url, e),
            })?;

        if !response.status().is_success() {
            return Err(BashletError::AssetDownload {
                url: format!("{}: HTTP {}", url, response.status()),
            });
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| BashletError::AssetDownload {
                url: format!("{}: Failed to read response: {}", url, e),
            })?;

        tokio::fs::write(dest, &bytes).await?;

        info!(
            path = %dest.display(),
            size = bytes.len(),
            "Downloaded asset"
        );

        Ok(())
    }

    /// Clean up instance rootfs copies.
    pub async fn cleanup_instance(&self, instance_id: &str) -> Result<()> {
        let instances_dir = self.cache_dir.join("instances");
        let rootfs_path = instances_dir.join(format!("{}.rootfs.ext4", instance_id));

        if rootfs_path.exists() {
            tokio::fs::remove_file(&rootfs_path).await?;
        }

        Ok(())
    }
}
