use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use tracing::debug;

use crate::error::{BashletError, Result};
use crate::sandbox::CommandResult;

/// Protocol messages for the guest agent.
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AgentRequest {
    Execute { command: String, workdir: String },
    ReadFile { path: String },
    WriteFile { path: String, content: String },
    Ping,
}

/// Response from the guest agent.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AgentResponse {
    Execute {
        exit_code: i32,
        stdout: String,
        stderr: String,
    },
    ReadFile {
        content: String,
    },
    WriteFile {
        success: bool,
    },
    Pong,
    Error {
        message: String,
    },
}

/// Client for communicating with the guest agent via vsock.
///
/// The guest agent runs inside the Firecracker VM and handles
/// command execution and file operations.
pub struct VsockClient {
    socket_path: PathBuf,
}

impl VsockClient {
    /// Connect to the guest agent via the vsock UDS proxy.
    pub async fn connect(socket_path: &PathBuf) -> Result<Self> {
        // Wait for socket to be available
        let max_attempts = 100;
        let delay = std::time::Duration::from_millis(100);

        for attempt in 1..=max_attempts {
            if socket_path.exists() {
                debug!(attempt = attempt, "Vsock socket ready");
                // Verify we can connect
                match UnixStream::connect(socket_path).await {
                    Ok(stream) => {
                        drop(stream);
                        return Ok(Self {
                            socket_path: socket_path.clone(),
                        });
                    }
                    Err(_) if attempt < max_attempts => {
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                    Err(e) => {
                        return Err(BashletError::VMCommunication(format!(
                            "Failed to connect to vsock: {}",
                            e
                        )));
                    }
                }
            }
            tokio::time::sleep(delay).await;
        }

        Err(BashletError::VMCommunication(
            "Timeout waiting for vsock socket".to_string(),
        ))
    }

    /// Send a request and receive a response.
    async fn send_request(&self, request: &AgentRequest) -> Result<AgentResponse> {
        let mut stream = UnixStream::connect(&self.socket_path)
            .await
            .map_err(|e| BashletError::VMCommunication(format!("Connection failed: {}", e)))?;

        // Serialize and send request
        let request_json = serde_json::to_string(request)
            .map_err(|e| BashletError::VMCommunication(format!("Serialization failed: {}", e)))?;

        stream
            .write_all(request_json.as_bytes())
            .await
            .map_err(|e| BashletError::VMCommunication(format!("Write failed: {}", e)))?;

        stream
            .write_all(b"\n")
            .await
            .map_err(|e| BashletError::VMCommunication(format!("Write failed: {}", e)))?;

        stream
            .flush()
            .await
            .map_err(|e| BashletError::VMCommunication(format!("Flush failed: {}", e)))?;

        // Read response
        let mut reader = BufReader::new(stream);
        let mut response_line = String::new();
        reader
            .read_line(&mut response_line)
            .await
            .map_err(|e| BashletError::VMCommunication(format!("Read failed: {}", e)))?;

        // Parse response
        let response: AgentResponse = serde_json::from_str(&response_line).map_err(|e| {
            BashletError::VMCommunication(format!("Failed to parse response: {}", e))
        })?;

        Ok(response)
    }

    /// Execute a command in the guest.
    pub async fn execute(&mut self, command: &str, workdir: &str) -> Result<CommandResult> {
        let request = AgentRequest::Execute {
            command: command.to_string(),
            workdir: workdir.to_string(),
        };

        let response = self.send_request(&request).await?;

        match response {
            AgentResponse::Execute {
                exit_code,
                stdout,
                stderr,
            } => Ok(CommandResult {
                exit_code,
                stdout,
                stderr,
            }),
            AgentResponse::Error { message } => Err(BashletError::SandboxExecution(format!(
                "Agent error: {}",
                message
            ))),
            _ => Err(BashletError::VMCommunication(
                "Unexpected response type".to_string(),
            )),
        }
    }

    /// Read a file from the guest.
    pub async fn read_file(&mut self, path: &str) -> Result<String> {
        let request = AgentRequest::ReadFile {
            path: path.to_string(),
        };

        let response = self.send_request(&request).await?;

        match response {
            AgentResponse::ReadFile { content } => Ok(content),
            AgentResponse::Error { message } => Err(BashletError::SandboxExecution(format!(
                "Failed to read file: {}",
                message
            ))),
            _ => Err(BashletError::VMCommunication(
                "Unexpected response type".to_string(),
            )),
        }
    }

    /// Write a file to the guest.
    pub async fn write_file(&mut self, path: &str, content: &str) -> Result<()> {
        let request = AgentRequest::WriteFile {
            path: path.to_string(),
            content: content.to_string(),
        };

        let response = self.send_request(&request).await?;

        match response {
            AgentResponse::WriteFile { success } if success => Ok(()),
            AgentResponse::WriteFile { success: false } => Err(BashletError::SandboxExecution(
                "Failed to write file".to_string(),
            )),
            AgentResponse::Error { message } => Err(BashletError::SandboxExecution(format!(
                "Failed to write file: {}",
                message
            ))),
            _ => Err(BashletError::VMCommunication(
                "Unexpected response type".to_string(),
            )),
        }
    }

    /// Ping the agent to check connectivity.
    pub async fn ping(&mut self) -> Result<bool> {
        let request = AgentRequest::Ping;

        match self.send_request(&request).await {
            Ok(AgentResponse::Pong) => Ok(true),
            Ok(_) => Ok(false),
            Err(_) => Ok(false),
        }
    }
}
