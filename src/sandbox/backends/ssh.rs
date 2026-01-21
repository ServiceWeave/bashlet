use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;

use async_trait::async_trait;
use tokio::process::Command;
use tracing::{debug, info, warn};

use crate::config::types::SshConfig;
use crate::error::{BashletError, Result};
use crate::sandbox::traits::{BackendCapabilities, SandboxBackend, SandboxInfo};
use crate::sandbox::CommandResult;

/// SSH sandbox backend.
///
/// Executes commands on a remote server via SSH. Uses SSH ControlMaster
/// to maintain a persistent multiplexed connection throughout the session.
pub struct SshBackend {
    host: String,
    port: u16,
    user: String,
    key_file: Option<PathBuf>,
    use_control_master: bool,
    connect_timeout: u64,
    env_vars: Vec<(String, String)>,
    workdir: String,
    /// Path to the ControlMaster socket
    control_path: Mutex<Option<PathBuf>>,
    /// Whether the ControlMaster connection is established
    connected: Mutex<bool>,
}

impl SshBackend {
    /// Create a new SSH backend.
    pub async fn new(
        config: SshConfig,
        env_vars: Vec<(String, String)>,
        workdir: String,
    ) -> Result<Self> {
        // Validate required configuration
        if config.host.is_empty() {
            return Err(BashletError::BackendNotAvailable {
                backend: "ssh".to_string(),
                reason: "SSH host is not configured. Set ssh.host in config or environment."
                    .to_string(),
            });
        }

        if config.user.is_empty() {
            return Err(BashletError::BackendNotAvailable {
                backend: "ssh".to_string(),
                reason: "SSH user is not configured. Set ssh.user in config or environment."
                    .to_string(),
            });
        }

        // Verify SSH is available
        if !Self::is_available() {
            return Err(BashletError::BackendNotAvailable {
                backend: "ssh".to_string(),
                reason: "SSH client is not installed or not accessible.".to_string(),
            });
        }

        let backend = Self {
            host: config.host,
            port: config.port,
            user: config.user,
            key_file: config.key_file,
            use_control_master: config.use_control_master,
            connect_timeout: config.connect_timeout,
            env_vars,
            workdir,
            control_path: Mutex::new(None),
            connected: Mutex::new(false),
        };

        // Establish the ControlMaster connection if enabled
        if backend.use_control_master {
            backend.start_control_master().await?;
        } else {
            // Test connection without ControlMaster
            backend.test_connection().await?;
        }

        info!(
            host = %backend.host,
            port = backend.port,
            user = %backend.user,
            use_control_master = backend.use_control_master,
            "SSH backend initialized"
        );

        Ok(backend)
    }

    /// Check if SSH client is available on this system.
    pub fn is_available() -> bool {
        match std::process::Command::new("ssh")
            .arg("-V")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
        {
            Ok(status) => status.success(),
            Err(_) => false,
        }
    }

    /// Get the SSH destination string (user@host).
    fn destination(&self) -> String {
        format!("{}@{}", self.user, self.host)
    }

    /// Generate a unique control socket path.
    fn generate_control_path(&self) -> PathBuf {
        let tmp_dir = std::env::temp_dir();
        let socket_name = format!(
            "bashlet-ssh-{}-{}-{}.sock",
            self.user,
            self.host,
            std::process::id()
        );
        tmp_dir.join(socket_name)
    }

    /// Start the SSH ControlMaster connection.
    async fn start_control_master(&self) -> Result<()> {
        let control_path = self.generate_control_path();

        info!(
            control_path = %control_path.display(),
            "Starting SSH ControlMaster connection..."
        );

        let mut cmd = Command::new("ssh");

        // ControlMaster options
        cmd.args(["-M", "-S", control_path.to_str().unwrap()]);
        cmd.args(["-o", "ControlPersist=yes"]);

        // Connection options
        cmd.args(["-o", &format!("ConnectTimeout={}", self.connect_timeout)]);
        cmd.args(["-o", "BatchMode=yes"]);
        cmd.args(["-o", "StrictHostKeyChecking=accept-new"]);

        // Port
        cmd.args(["-p", &self.port.to_string()]);

        // Key file if specified
        if let Some(ref key_file) = self.key_file {
            cmd.args(["-i", key_file.to_str().unwrap_or_default()]);
        }

        // Destination
        cmd.arg(&self.destination());

        // Run a simple command to establish the connection
        cmd.args(["exit", "0"]);

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let output = cmd.output().await.map_err(|e| {
            BashletError::SandboxInit(format!("Failed to start SSH ControlMaster: {}", e))
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(BashletError::SandboxInit(format!(
                "Failed to establish SSH connection to {}@{}:{}: {}",
                self.user, self.host, self.port, stderr
            )));
        }

        // Store the control path
        let mut path_lock = self.control_path.lock().map_err(|e| {
            BashletError::SandboxInit(format!("Failed to acquire lock: {}", e))
        })?;
        *path_lock = Some(control_path);

        let mut connected_lock = self.connected.lock().map_err(|e| {
            BashletError::SandboxInit(format!("Failed to acquire lock: {}", e))
        })?;
        *connected_lock = true;

        info!("SSH ControlMaster connection established");

        Ok(())
    }

    /// Test connection without ControlMaster.
    async fn test_connection(&self) -> Result<()> {
        let result = self.execute_ssh("echo ok").await?;
        if result.exit_code != 0 {
            return Err(BashletError::SandboxInit(format!(
                "SSH connection test failed: {}",
                result.stderr
            )));
        }

        let mut connected_lock = self.connected.lock().map_err(|e| {
            BashletError::SandboxInit(format!("Failed to acquire lock: {}", e))
        })?;
        *connected_lock = true;

        Ok(())
    }

    /// Get the current control path if set.
    fn get_control_path(&self) -> Option<PathBuf> {
        self.control_path.lock().ok().and_then(|guard| guard.clone())
    }

    /// Execute a command via SSH.
    async fn execute_ssh(&self, command: &str) -> Result<CommandResult> {
        debug!(command = %command, "Executing via SSH");

        let mut cmd = Command::new("ssh");

        // Use ControlMaster socket if available
        if let Some(ref control_path) = self.get_control_path() {
            cmd.args(["-S", control_path.to_str().unwrap()]);
        }

        // Connection options
        cmd.args(["-o", &format!("ConnectTimeout={}", self.connect_timeout)]);
        cmd.args(["-o", "BatchMode=yes"]);
        cmd.args(["-o", "StrictHostKeyChecking=accept-new"]);

        // Port
        cmd.args(["-p", &self.port.to_string()]);

        // Key file if specified
        if let Some(ref key_file) = self.key_file {
            cmd.args(["-i", key_file.to_str().unwrap_or_default()]);
        }

        // Destination
        cmd.arg(&self.destination());

        // Build the remote command with environment variables and working directory
        let remote_command = self.build_remote_command(command);
        cmd.arg(&remote_command);

        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let output = cmd.output().await.map_err(|e| {
            BashletError::SandboxExecution(format!("Failed to execute SSH command: {}", e))
        })?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(1);

        debug!(
            exit_code = exit_code,
            stdout_len = stdout.len(),
            stderr_len = stderr.len(),
            "SSH command completed"
        );

        Ok(CommandResult {
            stdout,
            stderr,
            exit_code,
        })
    }

    /// Build the remote command with environment variables and working directory.
    fn build_remote_command(&self, command: &str) -> String {
        let mut parts = Vec::new();

        // Set environment variables
        for (key, value) in &self.env_vars {
            // Escape single quotes in the value
            let escaped_value = value.replace('\'', "'\"'\"'");
            parts.push(format!("export {}='{}'", key, escaped_value));
        }

        // Change to working directory
        parts.push(format!("cd '{}' 2>/dev/null || true", self.workdir));

        // Execute the actual command
        parts.push(command.to_string());

        // Join with semicolons
        parts.join("; ")
    }

    /// Close the ControlMaster connection.
    async fn close_control_master(&self) -> Result<()> {
        let control_path = match self.get_control_path() {
            Some(path) => path,
            None => return Ok(()),
        };

        info!(
            control_path = %control_path.display(),
            "Closing SSH ControlMaster connection..."
        );

        let mut cmd = Command::new("ssh");
        cmd.args(["-S", control_path.to_str().unwrap()]);
        cmd.args(["-O", "exit"]);
        cmd.arg(&self.destination());

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let output = cmd.output().await.map_err(|e| {
            BashletError::SandboxExecution(format!("Failed to close SSH connection: {}", e))
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            warn!(error = %stderr, "Failed to cleanly close SSH ControlMaster");
        }

        // Remove the socket file if it exists
        if control_path.exists() {
            if let Err(e) = std::fs::remove_file(&control_path) {
                warn!(error = %e, "Failed to remove ControlMaster socket file");
            }
        }

        // Clear the control path
        if let Ok(mut lock) = self.control_path.lock() {
            *lock = None;
        }

        if let Ok(mut lock) = self.connected.lock() {
            *lock = false;
        }

        info!("SSH ControlMaster connection closed");

        Ok(())
    }
}

#[async_trait]
impl SandboxBackend for SshBackend {
    fn name(&self) -> &str {
        "ssh"
    }

    fn capabilities(&self) -> BackendCapabilities {
        BackendCapabilities {
            native_linux: true, // Assumes remote is Linux, but could be anything
            networking: true,   // Remote server typically has networking
            persistent_fs: true, // Remote filesystem persists
        }
    }

    async fn execute(&self, command: &str) -> Result<CommandResult> {
        self.execute_ssh(command).await
    }

    async fn write_file(&self, path: &str, content: &str) -> Result<()> {
        // Escape content for shell
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
        let connected = self.connected.lock().ok().map(|g| *g).unwrap_or(false);
        let control_path = self.get_control_path();

        SandboxInfo {
            backend_type: "ssh".to_string(),
            instance_id: Some(format!("{}@{}:{}", self.user, self.host, self.port)),
            running: connected,
            metadata: HashMap::from([
                ("host".to_string(), self.host.clone()),
                ("port".to_string(), self.port.to_string()),
                ("user".to_string(), self.user.clone()),
                ("workdir".to_string(), self.workdir.clone()),
                (
                    "use_control_master".to_string(),
                    self.use_control_master.to_string(),
                ),
                (
                    "control_path".to_string(),
                    control_path
                        .map(|p| p.display().to_string())
                        .unwrap_or_else(|| "none".to_string()),
                ),
            ]),
        }
    }

    async fn shutdown(&self) -> Result<()> {
        if self.use_control_master {
            self.close_control_master().await?;
        }
        Ok(())
    }

    async fn health_check(&self) -> Result<bool> {
        match self.execute("echo ok").await {
            Ok(result) => Ok(result.exit_code == 0 && result.stdout.trim() == "ok"),
            Err(_) => Ok(false),
        }
    }
}
