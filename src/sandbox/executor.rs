use std::process::Stdio;

use tokio::process::Command;
use tracing::{debug, info, warn};

use crate::config::loader::get_cache_dir;
use crate::error::{BashletError, Result};
use crate::sandbox::{CommandResult, SandboxConfig};

/// Wasmer registry WEBC download URL for bash
const WASMER_BASH_WEBC_URL: &str =
    "https://cdn.wasmer.io/webcimages/6616eee914dd95cb9751a0ef1d17a908055176781bc0b6090e33da5bbc325417.webc";

pub struct SandboxExecutor {
    config: SandboxConfig,
    webc_path: std::path::PathBuf,
}

impl SandboxExecutor {
    pub async fn new(config: SandboxConfig) -> Result<Self> {
        // Check if wasmer is installed
        check_wasmer_installed().await?;

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

        Ok(Self { config, webc_path })
    }

    /// Execute a shell command inside the sandbox using wasmer CLI
    pub async fn execute(&self, command: &str) -> Result<CommandResult> {
        debug!(command = %command, "Executing command in sandbox");

        let mut cmd = Command::new("wasmer");
        cmd.arg("run");

        // Add directory mappings
        for mount in &self.config.mounts {
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
        for (key, value) in &self.config.env_vars {
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

    /// Write a file inside the sandbox
    pub async fn write_file(&self, path: &str, content: &str) -> Result<()> {
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

    /// Read a file from the sandbox
    pub async fn read_file(&self, path: &str) -> Result<String> {
        let result = self.execute(&format!("cat '{}'", path)).await?;

        if result.exit_code != 0 {
            return Err(BashletError::SandboxExecution(format!(
                "Failed to read file: {}",
                result.stderr
            )));
        }

        Ok(result.stdout)
    }

    /// List directory contents
    pub async fn list_dir(&self, path: &str) -> Result<String> {
        let result = self.execute(&format!("ls -la '{}'", path)).await?;

        if result.exit_code != 0 {
            return Err(BashletError::SandboxExecution(format!(
                "Failed to list directory: {}",
                result.stderr
            )));
        }

        Ok(result.stdout)
    }
}

/// Check if wasmer CLI is installed
async fn check_wasmer_installed() -> Result<()> {
    let output = Command::new("wasmer")
        .arg("--version")
        .output()
        .await
        .map_err(|_| {
            BashletError::SandboxInit(
                "wasmer is not installed. Install it with: curl https://get.wasmer.io -sSfL | sh"
                    .to_string(),
            )
        })?;

    if !output.status.success() {
        return Err(BashletError::SandboxInit(
            "wasmer is not working properly".to_string(),
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout);
    info!(version = %version.trim(), "Found wasmer");

    Ok(())
}

/// Get the cached WEBC package or download it from wasmer registry
async fn get_or_download_webc() -> Result<std::path::PathBuf> {
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
