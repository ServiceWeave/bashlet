use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;

use async_trait::async_trait;
use tokio::process::Command;
use tracing::{debug, info, warn};

use crate::cli::args::Mount;
use crate::config::loader::get_cache_dir;
use crate::config::types::WasmerConfig;
use crate::error::{BashletError, Result};
use crate::sandbox::traits::{BackendCapabilities, SandboxBackend, SandboxInfo};
use crate::sandbox::CommandResult;

/// Wasmer version to download if not installed
const WASMER_VERSION: &str = "v6.0.0";

/// Wasmer registry WEBC download URL for bash
const WASMER_BASH_WEBC_URL: &str =
    "https://cdn.wasmer.io/webcimages/6616eee914dd95cb9751a0ef1d17a908055176781bc0b6090e33da5bbc325417.webc";

/// Get the Wasmer binary download URL for the current platform.
fn get_wasmer_download_url() -> Result<String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    let os_str = match os {
        "linux" => "linux",
        "macos" => "darwin",
        "windows" => "windows",
        _ => {
            return Err(BashletError::BackendNotAvailable {
                backend: "wasmer".to_string(),
                reason: format!("Unsupported OS: {}", os),
            });
        }
    };

    let arch_str = match arch {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        _ => {
            return Err(BashletError::BackendNotAvailable {
                backend: "wasmer".to_string(),
                reason: format!("Unsupported architecture: {}", arch),
            });
        }
    };

    Ok(format!(
        "https://github.com/wasmerio/wasmer/releases/download/{}/wasmer-{}-{}.tar.gz",
        WASMER_VERSION, os_str, arch_str
    ))
}

/// Wasmer WASM sandbox backend.
///
/// Uses the Wasmer CLI to execute commands in a WebAssembly sandbox.
/// This provides cross-platform sandboxing with good security isolation.
pub struct WasmerBackend {
    wasmer_binary: PathBuf,
    webc_path: PathBuf,
    mounts: Vec<Mount>,
    env_vars: Vec<(String, String)>,
    workdir: String,
}

impl WasmerBackend {
    /// Create a new Wasmer backend.
    pub async fn new(
        config: WasmerConfig,
        mounts: Vec<Mount>,
        env_vars: Vec<(String, String)>,
        workdir: String,
    ) -> Result<Self> {
        // Get or download wasmer binary
        let wasmer_binary = get_or_download_wasmer().await?;

        // Get or download the WEBC package
        let webc_path = match &config.wasm_binary {
            Some(path) => {
                if !path.exists() {
                    return Err(BashletError::WasmNotFound {
                        path: path.display().to_string(),
                    });
                }
                path.clone()
            }
            None => get_or_download_webc().await?,
        };

        info!(webc = %webc_path.display(), "Using WEBC package");

        Ok(Self {
            wasmer_binary,
            webc_path,
            mounts,
            env_vars,
            workdir,
        })
    }

    /// Check if the Wasmer backend is available on this system.
    ///
    /// Returns true since wasmer can be auto-downloaded at runtime.
    pub fn is_available() -> bool {
        // Wasmer is always "available" since we can download it at runtime
        true
    }
}

#[async_trait]
impl SandboxBackend for WasmerBackend {
    fn name(&self) -> &str {
        "wasmer"
    }

    fn capabilities(&self) -> BackendCapabilities {
        BackendCapabilities {
            native_linux: false,  // WASM, not native Linux
            networking: false,    // No network access in WASM sandbox
            persistent_fs: false, // Each command is stateless
        }
    }

    async fn execute(&self, command: &str) -> Result<CommandResult> {
        debug!(command = %command, "Executing command in Wasmer sandbox");

        let mut cmd = Command::new(&self.wasmer_binary);
        cmd.arg("run");

        // Add directory mappings
        for mount in &self.mounts {
            if !mount.host_path.exists() {
                return Err(BashletError::MountPathNotFound {
                    path: mount.host_path.display().to_string(),
                });
            }
            cmd.arg("--mapdir");
            cmd.arg(format!(
                "{}:{}",
                mount.guest_path,
                mount.host_path.display()
            ));
        }

        // Add environment variables
        for (key, value) in &self.env_vars {
            cmd.arg("--env");
            cmd.arg(format!("{}={}", key, value));
        }

        // Set the WEBC package and command
        cmd.arg(&self.webc_path);
        cmd.arg("--");
        cmd.arg("-c");
        cmd.arg(command);

        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let output = cmd.output().await.map_err(|e| {
            BashletError::SandboxExecution(format!("Failed to execute wasmer: {}", e))
        })?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(1);

        debug!(
            exit_code = exit_code,
            stdout_len = stdout.len(),
            stderr_len = stderr.len(),
            "Command completed"
        );

        Ok(CommandResult {
            stdout,
            stderr,
            exit_code,
        })
    }

    async fn write_file(&self, path: &str, content: &str) -> Result<()> {
        let escaped = content.replace('\\', "\\\\").replace('\'', "'\"'\"'");
        let cmd = format!("printf '%s' '{}' > '{}'", escaped, path);
        let result = self.execute(&cmd).await?;

        if result.exit_code != 0 {
            return Err(BashletError::SandboxExecution(format!(
                "Failed to write file: {}",
                result.stderr
            )));
        }

        Ok(())
    }

    async fn read_file(&self, path: &str) -> Result<String> {
        let result = self.execute(&format!("cat '{}'", path)).await?;

        if result.exit_code != 0 {
            return Err(BashletError::SandboxExecution(format!(
                "Failed to read file: {}",
                result.stderr
            )));
        }

        Ok(result.stdout)
    }

    async fn list_dir(&self, path: &str) -> Result<String> {
        let result = self.execute(&format!("ls -la '{}'", path)).await?;

        if result.exit_code != 0 {
            return Err(BashletError::SandboxExecution(format!(
                "Failed to list directory: {}",
                result.stderr
            )));
        }

        Ok(result.stdout)
    }

    fn info(&self) -> SandboxInfo {
        SandboxInfo {
            backend_type: "wasmer".to_string(),
            instance_id: None, // Wasmer is stateless
            running: true,
            metadata: HashMap::from([
                (
                    "webc_path".to_string(),
                    self.webc_path.display().to_string(),
                ),
                ("workdir".to_string(), self.workdir.clone()),
            ]),
        }
    }

    // shutdown() uses default no-op implementation since Wasmer is stateless
}

/// Get or download the Wasmer binary.
///
/// Checks in order:
/// 1. System PATH
/// 2. Cached download
/// 3. Downloads from GitHub releases
async fn get_or_download_wasmer() -> Result<PathBuf> {
    // 1. Check if wasmer is in PATH
    if let Ok(output) = std::process::Command::new("wasmer")
        .arg("--version")
        .output()
    {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout);
            info!(version = %version.trim(), "Using system wasmer");
            return Ok(PathBuf::from("wasmer"));
        }
    }

    // 2. Check cached binary
    let cache_dir = get_cache_dir().join("wasmer");
    let binary_path = cache_dir.join("wasmer");

    #[cfg(windows)]
    let binary_path = cache_dir.join("wasmer.exe");

    if binary_path.exists() {
        // Verify it works
        if let Ok(output) = std::process::Command::new(&binary_path)
            .arg("--version")
            .output()
        {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout);
                info!(version = %version.trim(), path = %binary_path.display(), "Using cached wasmer");
                return Ok(binary_path);
            }
        }
    }

    // 3. Download from GitHub
    info!("Downloading Wasmer {}...", WASMER_VERSION);

    tokio::fs::create_dir_all(&cache_dir).await?;

    let url = get_wasmer_download_url()?;
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| BashletError::SandboxInit(format!("Failed to create HTTP client: {}", e)))?;

    info!(url = %url, "Downloading Wasmer...");

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| BashletError::SandboxInit(format!("Failed to download Wasmer: {}", e)))?;

    if !response.status().is_success() {
        return Err(BashletError::SandboxInit(format!(
            "Failed to download Wasmer: HTTP {}",
            response.status()
        )));
    }

    let archive_bytes = response
        .bytes()
        .await
        .map_err(|e| BashletError::SandboxInit(format!("Failed to read Wasmer archive: {}", e)))?;

    // Extract the tarball
    info!("Extracting Wasmer...");
    let tar_gz = std::io::Cursor::new(archive_bytes);
    let tar = flate2::read::GzDecoder::new(tar_gz);
    let mut archive = tar::Archive::new(tar);

    // Extract to cache directory
    let temp_extract = cache_dir.join("extract_temp");
    tokio::fs::create_dir_all(&temp_extract).await?;

    archive
        .unpack(&temp_extract)
        .map_err(|e| BashletError::SandboxInit(format!("Failed to extract Wasmer: {}", e)))?;

    // Find and move the wasmer binary
    let extracted_binary = temp_extract.join("bin").join("wasmer");
    #[cfg(windows)]
    let extracted_binary = temp_extract.join("bin").join("wasmer.exe");

    if !extracted_binary.exists() {
        // Try without bin directory
        let alt_binary = temp_extract.join("wasmer");
        #[cfg(windows)]
        let alt_binary = temp_extract.join("wasmer.exe");

        if alt_binary.exists() {
            tokio::fs::rename(&alt_binary, &binary_path).await?;
        } else {
            return Err(BashletError::SandboxInit(
                "Could not find wasmer binary in archive".to_string(),
            ));
        }
    } else {
        tokio::fs::rename(&extracted_binary, &binary_path).await?;
    }

    // Clean up temp directory
    let _ = tokio::fs::remove_dir_all(&temp_extract).await;

    // Make executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&binary_path)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&binary_path, perms)?;
    }

    // Verify it works
    let output = std::process::Command::new(&binary_path)
        .arg("--version")
        .output()
        .map_err(|e| BashletError::SandboxInit(format!("Wasmer binary not working: {}", e)))?;

    if !output.status.success() {
        return Err(BashletError::SandboxInit(
            "Downloaded Wasmer binary not working".to_string(),
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout);
    info!(version = %version.trim(), path = %binary_path.display(), "Wasmer ready");

    Ok(binary_path)
}

/// Get the cached WEBC package or download it from wasmer registry
async fn get_or_download_webc() -> Result<PathBuf> {
    let cache_dir = get_cache_dir();
    let webc_path = cache_dir.join("bash.webc");

    // Check cache first
    if webc_path.exists() {
        info!(path = %webc_path.display(), "Using cached WEBC package");
        return Ok(webc_path);
    }

    info!("Downloading bash WEBC from wasmer registry...");

    // Create cache directory
    tokio::fs::create_dir_all(&cache_dir).await?;

    // Download the WEBC container from wasmer CDN
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| BashletError::SandboxInit(format!("Failed to create HTTP client: {}", e)))?;

    let response = client
        .get(WASMER_BASH_WEBC_URL)
        .send()
        .await
        .map_err(|e| BashletError::SandboxInit(format!("Failed to download: {}", e)))?;

    if !response.status().is_success() {
        return Err(BashletError::SandboxInit(format!(
            "Failed to download WEBC: HTTP {}",
            response.status()
        )));
    }

    let webc_bytes = response
        .bytes()
        .await
        .map_err(|e| BashletError::SandboxInit(format!("Failed to read response: {}", e)))?;

    // Validate WEBC magic
    if webc_bytes.len() < 8 || &webc_bytes[0..4] != b"\0web" {
        warn!("Downloaded file might not be a valid WEBC (unexpected header)");
    }

    // Cache the WEBC
    tokio::fs::write(&webc_path, &webc_bytes).await?;
    info!(
        path = %webc_path.display(),
        size = webc_bytes.len(),
        "Cached WEBC package"
    );

    Ok(webc_path)
}
