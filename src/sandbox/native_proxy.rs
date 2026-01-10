//! Native Tool Proxy
//!
//! This module provides a mechanism to execute native host tools from within the WASM sandbox.
//! It works by:
//! 1. Creating wrapper scripts that are mounted into the sandbox
//! 2. Running a background task that monitors for execution requests
//! 3. Executing the native tools on the host and returning results
//!
//! # Security Warning
//!
//! Using native tools can break the sandbox security model depending on isolation level:
//! - `none`: Native tools have full host access (DANGEROUS)
//! - `bwrap`: Uses bubblewrap to restrict filesystem access to mounted paths only
//! - `docker`: Uses Docker for complete isolation
//!
//! Only use this feature when you trust the commands being executed.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

use crate::cli::args::{NativeIsolation, NativeTool};
use crate::error::{BashletError, Result};

/// Request from sandbox to execute a native tool
#[derive(Debug, Serialize, Deserialize)]
struct ExecutionRequest {
    /// Unique request ID
    id: String,
    /// Tool name
    tool: String,
    /// Arguments
    args: Vec<String>,
    /// Working directory (inside sandbox, mapped to host)
    workdir: Option<String>,
    /// Environment variables
    env: HashMap<String, String>,
    /// Stdin content
    stdin: Option<String>,
}

/// Response from host after executing native tool
#[derive(Debug, Serialize, Deserialize)]
struct ExecutionResponse {
    /// Request ID this responds to
    id: String,
    /// Exit code
    exit_code: i32,
    /// Stdout
    stdout: String,
    /// Stderr
    stderr: String,
}

/// Native tool proxy configuration
#[derive(Debug, Clone)]
pub struct NativeProxyConfig {
    /// Native tools to make available
    pub tools: Vec<NativeTool>,
    /// Directory for communication (host path)
    pub comm_dir: PathBuf,
    /// Directory mappings (guest -> host) for resolving paths and bwrap mounts
    pub path_mappings: HashMap<String, PathBuf>,
    /// Isolation level for native tool execution
    pub isolation: NativeIsolation,
}

/// Handle to a running native proxy
pub struct NativeProxyHandle {
    /// Channel to signal shutdown
    shutdown_tx: mpsc::Sender<()>,
    /// Communication directory
    pub comm_dir: PathBuf,
    /// Wrapper scripts directory (to be mounted as /native-tools in sandbox)
    pub scripts_dir: PathBuf,
}

impl NativeProxyHandle {
    /// Stop the proxy
    pub async fn stop(self) {
        let _ = self.shutdown_tx.send(()).await;
        // Clean up directories
        let _ = fs::remove_dir_all(&self.comm_dir).await;
    }
}

/// Start the native tool proxy
pub async fn start_proxy(config: NativeProxyConfig) -> Result<NativeProxyHandle> {
    // Print security warning based on isolation level
    match config.isolation {
        NativeIsolation::None => {
            warn!("⚠️  SECURITY WARNING: Native tools enabled with NO ISOLATION!");
            warn!("⚠️  The following tools will execute on the HOST with FULL permissions:");
            for tool in &config.tools {
                warn!("⚠️    - {}", tool.name);
            }
            warn!("⚠️  This BREAKS sandbox isolation. Only use with trusted commands.");
        }
        NativeIsolation::Bwrap => {
            // Check if bwrap is available
            if !check_bwrap_available().await {
                return Err(BashletError::Config(
                    "bwrap (bubblewrap) not found. Install it or use --native-isolation=none".to_string()
                ));
            }
            info!("Native tools enabled with bwrap filesystem isolation");
            info!("Tools will only have access to mounted directories:");
            for (guest, host) in &config.path_mappings {
                info!("  {} -> {:?}", guest, host);
            }
        }
        NativeIsolation::Docker => {
            // Check if docker is available
            if !check_docker_available().await {
                return Err(BashletError::Config(
                    "Docker not found. Install it or use --native-isolation=bwrap".to_string()
                ));
            }
            info!("Native tools enabled with Docker isolation");
        }
    }

    // Create communication directories
    let requests_dir = config.comm_dir.join("requests");
    let responses_dir = config.comm_dir.join("responses");
    let scripts_dir = config.comm_dir.join("bin");

    fs::create_dir_all(&requests_dir).await?;
    fs::create_dir_all(&responses_dir).await?;
    fs::create_dir_all(&scripts_dir).await?;

    // Generate wrapper scripts for each tool
    for tool in &config.tools {
        generate_wrapper_script(&scripts_dir, tool).await?;
    }

    // Create shutdown channel
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

    // Clone values for the background task
    let tools = config.tools.clone();
    let path_mappings = config.path_mappings.clone();
    let isolation = config.isolation;
    let req_dir = requests_dir.clone();
    let resp_dir = responses_dir.clone();

    // Spawn background task to process requests
    tokio::spawn(async move {
        info!("Native proxy started, monitoring {:?}", req_dir);

        loop {
            tokio::select! {
                _ = shutdown_rx.recv() => {
                    info!("Native proxy shutting down");
                    break;
                }
                _ = sleep(Duration::from_millis(50)) => {
                    // Poll for new requests
                    if let Err(e) = process_requests(&req_dir, &resp_dir, &tools, &path_mappings, isolation).await {
                        error!("Error processing native tool requests: {}", e);
                    }
                }
            }
        }
    });

    Ok(NativeProxyHandle {
        shutdown_tx,
        comm_dir: config.comm_dir,
        scripts_dir,
    })
}

/// Generate a wrapper script for a native tool
async fn generate_wrapper_script(scripts_dir: &Path, tool: &NativeTool) -> Result<()> {
    let script_path = scripts_dir.join(&tool.name);

    // The wrapper script:
    // 1. Generates a unique request ID
    // 2. Writes a JSON request file
    // 3. Waits for a response file
    // 4. Outputs the result and exits with the correct code
    let script = format!(
        r#"#!/bin/bash
# Native tool wrapper for: {name}
# WARNING: This executes on the HOST, not in the sandbox!

COMM_DIR="/native-comm"
REQ_DIR="$COMM_DIR/requests"
RESP_DIR="$COMM_DIR/responses"

# Generate unique request ID
REQ_ID="$$-$(date +%s%N)"

# Collect arguments as JSON array
ARGS_JSON="["
FIRST=1
for arg in "$@"; do
    if [ $FIRST -eq 1 ]; then
        FIRST=0
    else
        ARGS_JSON="$ARGS_JSON,"
    fi
    # Escape special characters in argument
    escaped=$(echo "$arg" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g; s/\n/\\n/g')
    ARGS_JSON="$ARGS_JSON\"$escaped\""
done
ARGS_JSON="$ARGS_JSON]"

# Read stdin if available
STDIN_CONTENT=""
if [ ! -t 0 ]; then
    STDIN_CONTENT=$(cat | base64 -w 0 2>/dev/null || cat | base64)
fi

# Create request JSON
cat > "$REQ_DIR/$REQ_ID.json" << REQEOF
{{
    "id": "$REQ_ID",
    "tool": "{name}",
    "args": $ARGS_JSON,
    "workdir": "$(pwd)",
    "env": {{}},
    "stdin": "$STDIN_CONTENT"
}}
REQEOF

# Wait for response (with timeout)
TIMEOUT=300
ELAPSED=0
while [ ! -f "$RESP_DIR/$REQ_ID.json" ]; do
    sleep 0.05
    ELAPSED=$((ELAPSED + 1))
    if [ $ELAPSED -gt $((TIMEOUT * 20)) ]; then
        echo "Error: Native tool execution timed out" >&2
        rm -f "$REQ_DIR/$REQ_ID.json"
        exit 124
    fi
done

# Parse response
RESP_FILE="$RESP_DIR/$REQ_ID.json"

# Extract fields (basic JSON parsing with sed/grep)
EXIT_CODE=$(grep -o '"exit_code":[0-9-]*' "$RESP_FILE" | cut -d: -f2)
STDOUT=$(grep -o '"stdout":"[^"]*"' "$RESP_FILE" | cut -d: -f2- | sed 's/^"//;s/"$//' | sed 's/\\n/\n/g; s/\\t/\t/g; s/\\"/"/g; s/\\\\/\\/g')
STDERR=$(grep -o '"stderr":"[^"]*"' "$RESP_FILE" | cut -d: -f2- | sed 's/^"//;s/"$//' | sed 's/\\n/\n/g; s/\\t/\t/g; s/\\"/"/g; s/\\\\/\\/g')

# Output results
echo -n "$STDOUT"
echo -n "$STDERR" >&2

# Cleanup
rm -f "$REQ_DIR/$REQ_ID.json" "$RESP_FILE"

exit ${{EXIT_CODE:-1}}
"#,
        name = tool.name
    );

    let mut file = fs::File::create(&script_path).await?;
    file.write_all(script.as_bytes()).await?;

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&script_path).await?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&script_path, perms).await?;
    }

    debug!("Generated wrapper script for {} at {:?}", tool.name, script_path);
    Ok(())
}

/// Check if bwrap (bubblewrap) is available
async fn check_bwrap_available() -> bool {
    Command::new("bwrap")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Check if Docker is available
async fn check_docker_available() -> bool {
    Command::new("docker")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Process pending execution requests
async fn process_requests(
    requests_dir: &Path,
    responses_dir: &Path,
    tools: &[NativeTool],
    path_mappings: &HashMap<String, PathBuf>,
    isolation: NativeIsolation,
) -> Result<()> {
    let mut entries = fs::read_dir(requests_dir).await?;

    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().map(|e| e == "json").unwrap_or(false) {
            match process_single_request(&path, responses_dir, tools, path_mappings, isolation).await {
                Ok(_) => {
                    // Request file is cleaned up by the wrapper script
                }
                Err(e) => {
                    error!("Failed to process request {:?}: {}", path, e);
                    // Write error response
                    if let Ok(content) = fs::read_to_string(&path).await {
                        if let Ok(req) = serde_json::from_str::<ExecutionRequest>(&content) {
                            let response = ExecutionResponse {
                                id: req.id.clone(),
                                exit_code: 1,
                                stdout: String::new(),
                                stderr: format!("Native proxy error: {}", e),
                            };
                            let resp_path = responses_dir.join(format!("{}.json", req.id));
                            let _ = fs::write(&resp_path, serde_json::to_string(&response)?).await;
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

/// Process a single execution request
async fn process_single_request(
    request_path: &Path,
    responses_dir: &Path,
    tools: &[NativeTool],
    path_mappings: &HashMap<String, PathBuf>,
    isolation: NativeIsolation,
) -> Result<()> {
    let content = fs::read_to_string(request_path).await?;
    let request: ExecutionRequest = serde_json::from_str(&content)?;

    debug!("Processing native tool request: {} {:?}", request.tool, request.args);

    // Find the tool configuration
    let tool = tools
        .iter()
        .find(|t| t.name == request.tool)
        .ok_or_else(|| BashletError::Config(format!("Unknown native tool: {}", request.tool)))?;

    // Determine the actual binary to execute
    let binary = tool
        .host_path
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| request.tool.clone());

    // Build the command based on isolation level
    let output = match isolation {
        NativeIsolation::None => {
            execute_direct(&binary, &request).await?
        }
        NativeIsolation::Bwrap => {
            execute_with_bwrap(&binary, &request, path_mappings).await?
        }
        NativeIsolation::Docker => {
            execute_with_docker(&binary, &request, path_mappings).await?
        }
    };

    // Create response
    let response = ExecutionResponse {
        id: request.id.clone(),
        exit_code: output.0,
        stdout: escape_json_string(&output.1),
        stderr: escape_json_string(&output.2),
    };

    // Write response
    let resp_path = responses_dir.join(format!("{}.json", request.id));
    fs::write(&resp_path, serde_json::to_string(&response)?).await?;

    debug!("Native tool {} completed with exit code {}", request.tool, response.exit_code);
    Ok(())
}

/// Execute a command directly on the host (no isolation)
async fn execute_direct(binary: &str, request: &ExecutionRequest) -> Result<(i32, String, String)> {
    let mut cmd = Command::new(binary);
    cmd.args(&request.args);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    for (key, value) in &request.env {
        cmd.env(key, value);
    }

    let mut child: tokio::process::Child = cmd.spawn().map_err(|e| {
        BashletError::SandboxExecution(format!("Failed to spawn native tool '{}': {}", binary, e))
    })?;

    // Write stdin if provided
    if let Some(stdin_b64) = &request.stdin {
        if !stdin_b64.is_empty() {
            if let Some(mut stdin) = child.stdin.take() {
                if let Ok(decoded) = base64_decode(stdin_b64) {
                    let _ = tokio::io::AsyncWriteExt::write_all(&mut stdin, &decoded).await;
                }
            }
        }
    }

    let output: std::process::Output = child.wait_with_output().await.map_err(|e| {
        BashletError::SandboxExecution(format!("Failed to wait for native tool '{}': {}", binary, e))
    })?;

    Ok((
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    ))
}

/// Execute a command with bwrap filesystem isolation
async fn execute_with_bwrap(
    binary: &str,
    request: &ExecutionRequest,
    path_mappings: &HashMap<String, PathBuf>,
) -> Result<(i32, String, String)> {
    let mut cmd = Command::new("bwrap");

    // Basic isolation: new namespaces
    cmd.arg("--unshare-all");
    cmd.arg("--share-net"); // Allow network (needed for tools like kubectl)

    // Mount minimal system directories read-only
    cmd.args(["--ro-bind", "/usr", "/usr"]);
    cmd.args(["--ro-bind", "/lib", "/lib"]);
    cmd.args(["--ro-bind", "/lib64", "/lib64"]);
    cmd.args(["--ro-bind", "/bin", "/bin"]);
    cmd.args(["--ro-bind", "/sbin", "/sbin"]);
    cmd.args(["--ro-bind", "/etc", "/etc"]);

    // Mount proc and dev
    cmd.args(["--proc", "/proc"]);
    cmd.args(["--dev", "/dev"]);

    // Mount only the explicitly allowed paths (from mounts)
    for (guest_path, host_path) in path_mappings {
        if host_path.exists() {
            cmd.args(["--bind", &host_path.to_string_lossy(), guest_path]);
        }
    }

    // Create a tmpfs for /tmp
    cmd.args(["--tmpfs", "/tmp"]);

    // Set working directory if provided
    if let Some(workdir) = &request.workdir {
        // Map sandbox workdir to host workdir if it exists in path_mappings
        if let Some(host_workdir) = path_mappings.get(workdir) {
            cmd.args(["--chdir", &host_workdir.to_string_lossy()]);
        }
    }

    // The actual command to run
    cmd.arg("--");
    cmd.arg(binary);
    cmd.args(&request.args);

    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    debug!("Running bwrap command: {:?}", cmd);

    let mut child: tokio::process::Child = cmd.spawn().map_err(|e| {
        BashletError::SandboxExecution(format!("Failed to spawn bwrap for '{}': {}", binary, e))
    })?;

    // Write stdin if provided
    if let Some(stdin_b64) = &request.stdin {
        if !stdin_b64.is_empty() {
            if let Some(mut stdin) = child.stdin.take() {
                if let Ok(decoded) = base64_decode(stdin_b64) {
                    let _ = tokio::io::AsyncWriteExt::write_all(&mut stdin, &decoded).await;
                }
            }
        }
    }

    let output: std::process::Output = child.wait_with_output().await.map_err(|e| {
        BashletError::SandboxExecution(format!("Failed to wait for bwrap '{}': {}", binary, e))
    })?;

    Ok((
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    ))
}

/// Execute a command with Docker isolation
async fn execute_with_docker(
    binary: &str,
    request: &ExecutionRequest,
    path_mappings: &HashMap<String, PathBuf>,
) -> Result<(i32, String, String)> {
    let mut cmd = Command::new("docker");
    cmd.arg("run");
    cmd.arg("--rm"); // Remove container after exit
    cmd.arg("-i");   // Interactive for stdin

    // Mount only the explicitly allowed paths
    for (guest_path, host_path) in path_mappings {
        if host_path.exists() {
            cmd.arg("-v");
            cmd.arg(format!("{}:{}", host_path.display(), guest_path));
        }
    }

    // Set working directory if provided
    if let Some(workdir) = &request.workdir {
        cmd.arg("-w");
        cmd.arg(workdir);
    }

    // Use a minimal image that has common tools
    // Users can configure this via environment or config
    let image = std::env::var("BASHLET_DOCKER_IMAGE").unwrap_or_else(|_| "alpine:latest".to_string());
    cmd.arg(&image);

    // The actual command
    cmd.arg(binary);
    cmd.args(&request.args);

    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    debug!("Running docker command: {:?}", cmd);

    let mut child: tokio::process::Child = cmd.spawn().map_err(|e| {
        BashletError::SandboxExecution(format!("Failed to spawn docker for '{}': {}", binary, e))
    })?;

    // Write stdin if provided
    if let Some(stdin_b64) = &request.stdin {
        if !stdin_b64.is_empty() {
            if let Some(mut stdin) = child.stdin.take() {
                if let Ok(decoded) = base64_decode(stdin_b64) {
                    let _ = tokio::io::AsyncWriteExt::write_all(&mut stdin, &decoded).await;
                }
            }
        }
    }

    let output: std::process::Output = child.wait_with_output().await.map_err(|e| {
        BashletError::SandboxExecution(format!("Failed to wait for docker '{}': {}", binary, e))
    })?;

    Ok((
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    ))
}

/// Decode base64 string
fn base64_decode(s: &str) -> std::result::Result<Vec<u8>, base64::DecodeError> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(s)
}

/// Escape a string for JSON (handling newlines, tabs, etc.)
fn escape_json_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}
