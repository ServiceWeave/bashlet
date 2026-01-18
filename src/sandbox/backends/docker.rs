use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;

use async_trait::async_trait;
use tokio::process::Command;
use tracing::{debug, info, warn};

use crate::cli::args::Mount;
use crate::config::types::DockerConfig;
use crate::error::{BashletError, Result};
use crate::sandbox::traits::{BackendCapabilities, SandboxBackend, SandboxInfo};
use crate::sandbox::CommandResult;

/// Default Docker image name for the sandbox
const DEFAULT_IMAGE: &str = "bashlet-sandbox:latest";

/// Path to the Dockerfile relative to the crate root
const DOCKERFILE_PATH: &str = "docker/Dockerfile.sandbox";

/// Docker sandbox backend.
///
/// Uses Docker containers to execute commands in an isolated environment.
/// Supports two execution modes:
/// - Stateless mode: Each command runs in a fresh container that is automatically removed.
/// - Session mode: A persistent container stays running and commands are executed via `docker exec`.
pub struct DockerBackend {
    image: String,
    mounts: Vec<Mount>,
    env_vars: Vec<(String, String)>,
    workdir: String,
    memory_limit_mb: u64,
    enable_networking: bool,
    /// Whether session mode is enabled (persistent container)
    session_mode: bool,
    /// Container ID when running in session mode (protected by Mutex for interior mutability)
    container_id: Mutex<Option<String>>,
}

impl DockerBackend {
    /// Create a new Docker backend.
    pub async fn new(
        config: DockerConfig,
        mounts: Vec<Mount>,
        env_vars: Vec<(String, String)>,
        workdir: String,
        memory_limit_mb: u64,
    ) -> Result<Self> {
        // Verify Docker is available
        if !Self::is_available() {
            return Err(BashletError::BackendNotAvailable {
                backend: "docker".to_string(),
                reason: "Docker daemon is not accessible. Ensure Docker is installed and running."
                    .to_string(),
            });
        }

        let image = config.image.unwrap_or_else(|| DEFAULT_IMAGE.to_string());

        // Check if image exists, build if configured to do so
        if config.build_image && !Self::image_exists(&image).await {
            Self::build_image(&image).await?;
        } else if !Self::image_exists(&image).await {
            return Err(BashletError::BackendNotAvailable {
                backend: "docker".to_string(),
                reason: format!(
                    "Docker image '{}' not found. Set build_image=true to auto-build, or build manually with: docker build -t {} -f {} .",
                    image, image, DOCKERFILE_PATH
                ),
            });
        }

        let session_mode = config.session_mode;
        let backend = Self {
            image,
            mounts,
            env_vars,
            workdir,
            memory_limit_mb,
            enable_networking: config.enable_networking,
            session_mode,
            container_id: Mutex::new(None),
        };

        // If session mode is enabled, start a persistent container
        if session_mode {
            backend.start_session().await?;
        }

        info!(
            image = %backend.image,
            session_mode = session_mode,
            "Docker backend initialized"
        );

        Ok(backend)
    }

    /// Start a persistent container for session mode.
    async fn start_session(&self) -> Result<()> {
        info!("Starting Docker session container...");

        let mut cmd = Command::new("docker");
        cmd.args(["run", "-d"]); // detached mode

        // Network isolation
        if !self.enable_networking {
            cmd.arg("--network=none");
        }

        // Memory limit
        cmd.arg(format!("--memory={}m", self.memory_limit_mb));

        // Mount directories
        for mount in &self.mounts {
            if !mount.host_path.exists() {
                return Err(BashletError::MountPathNotFound {
                    path: mount.host_path.display().to_string(),
                });
            }
            let mode = if mount.readonly { "ro" } else { "rw" };
            cmd.arg("-v");
            cmd.arg(format!(
                "{}:{}:{}",
                mount.host_path.display(),
                mount.guest_path,
                mode
            ));
        }

        // Environment variables
        for (key, value) in &self.env_vars {
            cmd.arg("-e");
            cmd.arg(format!("{}={}", key, value));
        }

        // Working directory
        cmd.args(["-w", &self.workdir]);

        // Image and command to keep container running
        cmd.arg(&self.image);
        cmd.args(["tail", "-f", "/dev/null"]);

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let output = cmd.output().await.map_err(|e| {
            BashletError::SandboxInit(format!("Failed to start Docker session: {}", e))
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(BashletError::SandboxInit(format!(
                "Failed to start Docker session: {}",
                stderr
            )));
        }

        let container_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        info!(container_id = %container_id, "Docker session container started");

        // Store the container ID
        let mut id_lock = self.container_id.lock().map_err(|e| {
            BashletError::SandboxInit(format!("Failed to acquire lock: {}", e))
        })?;
        *id_lock = Some(container_id);

        Ok(())
    }

    /// Check if the Docker backend is available on this system.
    ///
    /// Returns true if Docker daemon is accessible.
    pub fn is_available() -> bool {
        // Check if docker command exists and daemon is responsive
        match std::process::Command::new("docker")
            .args(["info"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
        {
            Ok(status) => status.success(),
            Err(_) => false,
        }
    }

    /// Check if a Docker image exists locally.
    async fn image_exists(image: &str) -> bool {
        match Command::new("docker")
            .args(["image", "inspect", image])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await
        {
            Ok(status) => status.success(),
            Err(_) => false,
        }
    }

    /// Build the Docker image from the Dockerfile.
    async fn build_image(image: &str) -> Result<()> {
        info!(image = %image, "Building Docker sandbox image...");

        // Find the Dockerfile and determine the build context directory
        let dockerfile = Self::find_dockerfile()?;

        // Canonicalize to get absolute path, then determine project root
        let dockerfile_abs = dockerfile.canonicalize().map_err(|e| {
            BashletError::SandboxInit(format!("Cannot resolve Dockerfile path: {}", e))
        })?;

        // Project root is parent of "docker" directory
        let project_root = dockerfile_abs
            .parent() // docker/
            .and_then(|p| p.parent()) // project root
            .ok_or_else(|| {
                BashletError::SandboxInit("Cannot determine project root".to_string())
            })?;

        let output = Command::new("docker")
            .args([
                "build",
                "-t",
                image,
                "-f",
                dockerfile_abs.to_str().unwrap_or(DOCKERFILE_PATH),
                ".",
            ])
            .current_dir(project_root)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| BashletError::SandboxInit(format!("Failed to run docker build: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(BashletError::SandboxInit(format!(
                "Failed to build Docker image: {}",
                stderr
            )));
        }

        info!(image = %image, "Docker sandbox image built successfully");
        Ok(())
    }

    /// Find the Dockerfile in common locations.
    fn find_dockerfile() -> Result<PathBuf> {
        // Check relative to current directory
        let local_path = PathBuf::from(DOCKERFILE_PATH);
        if local_path.exists() {
            return Ok(local_path);
        }

        // Check relative to executable location
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                // Check in same directory as executable
                let exe_dockerfile = exe_dir.join(DOCKERFILE_PATH);
                if exe_dockerfile.exists() {
                    return Ok(exe_dockerfile);
                }

                // Check parent directories (for development)
                let mut parent = exe_dir.to_path_buf();
                for _ in 0..5 {
                    let candidate = parent.join(DOCKERFILE_PATH);
                    if candidate.exists() {
                        return Ok(candidate);
                    }
                    if let Some(p) = parent.parent() {
                        parent = p.to_path_buf();
                    } else {
                        break;
                    }
                }
            }
        }

        // Check CARGO_MANIFEST_DIR if set (development)
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let cargo_dockerfile = PathBuf::from(manifest_dir).join(DOCKERFILE_PATH);
            if cargo_dockerfile.exists() {
                return Ok(cargo_dockerfile);
            }
        }

        Err(BashletError::SandboxInit(format!(
            "Dockerfile not found at {}. Build the image manually with: docker build -t {} -f {} .",
            DOCKERFILE_PATH, DEFAULT_IMAGE, DOCKERFILE_PATH
        )))
    }

    /// Execute a command in session mode using docker exec.
    async fn execute_in_session(&self, container_id: &str, command: &str) -> Result<CommandResult> {
        debug!(container_id = %container_id, command = %command, "Executing via docker exec");

        let mut cmd = Command::new("docker");
        cmd.args(["exec"]);

        // Working directory
        cmd.args(["-w", &self.workdir]);

        // Environment variables
        for (key, value) in &self.env_vars {
            cmd.arg("-e");
            cmd.arg(format!("{}={}", key, value));
        }

        // Container ID and command
        cmd.arg(container_id);
        cmd.args(["sh", "-c", command]);

        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let output = cmd.output().await.map_err(|e| {
            BashletError::SandboxExecution(format!("Failed to execute docker exec: {}", e))
        })?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(1);

        debug!(
            exit_code = exit_code,
            stdout_len = stdout.len(),
            stderr_len = stderr.len(),
            "Command completed (session mode)"
        );

        Ok(CommandResult {
            stdout,
            stderr,
            exit_code,
        })
    }

    /// Execute a command in stateless mode using docker run --rm.
    async fn execute_stateless(&self, command: &str) -> Result<CommandResult> {
        let mut cmd = Command::new("docker");
        cmd.args(["run", "--rm"]);

        // Network isolation
        if !self.enable_networking {
            cmd.arg("--network=none");
        }

        // Memory limit
        cmd.arg(format!("--memory={}m", self.memory_limit_mb));

        // Mount directories
        for mount in &self.mounts {
            if !mount.host_path.exists() {
                return Err(BashletError::MountPathNotFound {
                    path: mount.host_path.display().to_string(),
                });
            }
            let mode = if mount.readonly { "ro" } else { "rw" };
            cmd.arg("-v");
            cmd.arg(format!(
                "{}:{}:{}",
                mount.host_path.display(),
                mount.guest_path,
                mode
            ));
        }

        // Environment variables
        for (key, value) in &self.env_vars {
            cmd.arg("-e");
            cmd.arg(format!("{}={}", key, value));
        }

        // Working directory
        cmd.args(["-w", &self.workdir]);

        // Image and command
        cmd.arg(&self.image);
        cmd.arg(command);

        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let output = cmd.output().await.map_err(|e| {
            BashletError::SandboxExecution(format!("Failed to execute docker run: {}", e))
        })?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(1);

        debug!(
            exit_code = exit_code,
            stdout_len = stdout.len(),
            stderr_len = stderr.len(),
            "Command completed (stateless mode)"
        );

        Ok(CommandResult {
            stdout,
            stderr,
            exit_code,
        })
    }

    /// Get the current container ID if in session mode.
    fn get_container_id(&self) -> Option<String> {
        self.container_id.lock().ok().and_then(|guard| guard.clone())
    }

    /// Stop and remove the session container.
    async fn stop_container(&self, container_id: &str) -> Result<()> {
        info!(container_id = %container_id, "Stopping Docker session container...");

        // Stop the container
        let stop_output = Command::new("docker")
            .args(["stop", container_id])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| {
                BashletError::SandboxExecution(format!("Failed to stop container: {}", e))
            })?;

        if !stop_output.status.success() {
            let stderr = String::from_utf8_lossy(&stop_output.stderr);
            warn!(container_id = %container_id, error = %stderr, "Failed to stop container");
        }

        // Remove the container (in case --rm wasn't effective)
        let rm_output = Command::new("docker")
            .args(["rm", "-f", container_id])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| {
                BashletError::SandboxExecution(format!("Failed to remove container: {}", e))
            })?;

        if !rm_output.status.success() {
            let stderr = String::from_utf8_lossy(&rm_output.stderr);
            warn!(container_id = %container_id, error = %stderr, "Failed to remove container");
        }

        info!(container_id = %container_id, "Docker session container stopped");
        Ok(())
    }
}

#[async_trait]
impl SandboxBackend for DockerBackend {
    fn name(&self) -> &str {
        "docker"
    }

    fn capabilities(&self) -> BackendCapabilities {
        BackendCapabilities {
            native_linux: true, // Full Linux environment
            networking: self.enable_networking,
            persistent_fs: self.session_mode, // Persistent when in session mode
        }
    }

    async fn execute(&self, command: &str) -> Result<CommandResult> {
        debug!(command = %command, "Executing command in Docker sandbox");

        // Check if we're in session mode with an active container
        let container_id = self.get_container_id();

        if let Some(ref cid) = container_id {
            // Session mode: use docker exec
            self.execute_in_session(cid, command).await
        } else {
            // Stateless mode: use docker run --rm
            self.execute_stateless(command).await
        }
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
        let container_id = self.get_container_id();
        SandboxInfo {
            backend_type: "docker".to_string(),
            instance_id: container_id.clone(),
            running: !self.session_mode || container_id.is_some(),
            metadata: HashMap::from([
                ("image".to_string(), self.image.clone()),
                ("workdir".to_string(), self.workdir.clone()),
                (
                    "networking".to_string(),
                    self.enable_networking.to_string(),
                ),
                ("session_mode".to_string(), self.session_mode.to_string()),
            ]),
        }
    }

    async fn shutdown(&self) -> Result<()> {
        if let Some(container_id) = self.get_container_id() {
            self.stop_container(&container_id).await?;

            // Clear the container ID
            if let Ok(mut lock) = self.container_id.lock() {
                *lock = None;
            }
        }
        Ok(())
    }
}
