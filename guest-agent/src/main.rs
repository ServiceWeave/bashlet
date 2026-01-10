//! Bashlet Guest Agent
//!
//! This agent runs inside the Firecracker microVM and handles commands
//! from the host via vsock (Virtio Socket).
//!
//! Protocol:
//! - Agent listens on vsock port 5000
//! - Host sends JSON requests (one per line)
//! - Agent sends JSON responses (one per line)

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::Path;
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};

/// Default vsock port for the agent
#[cfg(target_os = "linux")]
const VSOCK_PORT: u32 = 5000;

/// Path to the vsock UDS that Firecracker creates
const VSOCK_UDS_PATH: &str = "/tmp/bashlet-agent.sock";

/// Request types from the host
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Request {
    Execute { command: String, workdir: String },
    ReadFile { path: String },
    WriteFile { path: String, content: String },
    Ping,
}

/// Response types to the host
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Response {
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

fn main() {
    eprintln!("bashlet-agent: starting...");

    // Try vsock first, fall back to Unix socket for testing
    #[cfg(target_os = "linux")]
    {
        if let Err(e) = run_vsock_server() {
            eprintln!("bashlet-agent: vsock failed: {}, trying UDS", e);
            if let Err(e) = run_uds_server() {
                eprintln!("bashlet-agent: UDS failed: {}", e);
                std::process::exit(1);
            }
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        if let Err(e) = run_uds_server() {
            eprintln!("bashlet-agent: UDS failed: {}", e);
            std::process::exit(1);
        }
    }
}

/// Run the agent using vsock (production mode in Firecracker)
#[cfg(target_os = "linux")]
fn run_vsock_server() -> Result<(), Box<dyn std::error::Error>> {
    use vsock::{VsockAddr, VsockListener, VMADDR_CID_ANY};

    eprintln!("bashlet-agent: listening on vsock port {}", VSOCK_PORT);

    let listener = VsockListener::bind(&VsockAddr::new(VMADDR_CID_ANY, VSOCK_PORT))?;

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                eprintln!("bashlet-agent: new vsock connection");
                if let Err(e) = handle_connection_vsock(stream) {
                    eprintln!("bashlet-agent: connection error: {}", e);
                }
            }
            Err(e) => {
                eprintln!("bashlet-agent: accept error: {}", e);
            }
        }
    }

    Ok(())
}

/// Handle a vsock connection
#[cfg(target_os = "linux")]
fn handle_connection_vsock(stream: vsock::VsockStream) -> Result<(), Box<dyn std::error::Error>> {
    use std::io::{BufRead, BufReader, Write};

    let mut reader = BufReader::new(stream.try_clone()?);
    let mut writer = stream;
    let mut line = String::new();

    loop {
        line.clear();
        let bytes_read = reader.read_line(&mut line)?;

        if bytes_read == 0 {
            break; // Connection closed
        }

        let response = process_request(&line);
        let response_json = serde_json::to_string(&response)?;

        writeln!(writer, "{}", response_json)?;
        writer.flush()?;
    }

    Ok(())
}

/// Run the agent using Unix domain socket (for testing without vsock)
fn run_uds_server() -> Result<(), Box<dyn std::error::Error>> {
    // Remove existing socket
    let _ = std::fs::remove_file(VSOCK_UDS_PATH);

    eprintln!("bashlet-agent: listening on UDS {}", VSOCK_UDS_PATH);

    let listener = UnixListener::bind(VSOCK_UDS_PATH)?;

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                eprintln!("bashlet-agent: new UDS connection");
                if let Err(e) = handle_connection_uds(stream) {
                    eprintln!("bashlet-agent: connection error: {}", e);
                }
            }
            Err(e) => {
                eprintln!("bashlet-agent: accept error: {}", e);
            }
        }
    }

    Ok(())
}

/// Handle a Unix socket connection
fn handle_connection_uds(stream: UnixStream) -> Result<(), Box<dyn std::error::Error>> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut writer = stream;
    let mut line = String::new();

    loop {
        line.clear();
        let bytes_read = reader.read_line(&mut line)?;

        if bytes_read == 0 {
            break; // Connection closed
        }

        let response = process_request(&line);
        let response_json = serde_json::to_string(&response)?;

        writeln!(writer, "{}", response_json)?;
        writer.flush()?;
    }

    Ok(())
}

/// Process a request and return a response
fn process_request(request_line: &str) -> Response {
    let request: Request = match serde_json::from_str(request_line.trim()) {
        Ok(req) => req,
        Err(e) => {
            return Response::Error {
                message: format!("Invalid request: {}", e),
            };
        }
    };

    match request {
        Request::Execute { command, workdir } => execute_command(&command, &workdir),
        Request::ReadFile { path } => read_file(&path),
        Request::WriteFile { path, content } => write_file(&path, &content),
        Request::Ping => Response::Pong,
    }
}

/// Execute a shell command
fn execute_command(command: &str, workdir: &str) -> Response {
    eprintln!("bashlet-agent: executing: {}", command);

    // Ensure workdir exists
    if !workdir.is_empty() {
        let _ = std::fs::create_dir_all(workdir);
    }

    let result = Command::new("/bin/sh")
        .arg("-c")
        .arg(command)
        .current_dir(if workdir.is_empty() { "/" } else { workdir })
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code().unwrap_or(-1);

            eprintln!(
                "bashlet-agent: command finished with exit code {}",
                exit_code
            );

            Response::Execute {
                exit_code,
                stdout,
                stderr,
            }
        }
        Err(e) => Response::Error {
            message: format!("Failed to execute command: {}", e),
        },
    }
}

/// Read a file from the filesystem
fn read_file(path: &str) -> Response {
    eprintln!("bashlet-agent: reading file: {}", path);

    match std::fs::read_to_string(path) {
        Ok(content) => Response::ReadFile { content },
        Err(e) => Response::Error {
            message: format!("Failed to read file: {}", e),
        },
    }
}

/// Write a file to the filesystem
fn write_file(path: &str, content: &str) -> Response {
    eprintln!("bashlet-agent: writing file: {}", path);

    // Create parent directories if needed
    if let Some(parent) = Path::new(path).parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return Response::Error {
                message: format!("Failed to create directory: {}", e),
            };
        }
    }

    match std::fs::write(path, content) {
        Ok(_) => Response::WriteFile { success: true },
        Err(e) => Response::Error {
            message: format!("Failed to write file: {}", e),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ping_pong() {
        let response = process_request(r#"{"type": "ping"}"#);
        match response {
            Response::Pong => {}
            _ => panic!("Expected Pong response"),
        }
    }

    #[test]
    fn test_execute_echo() {
        let response =
            process_request(r#"{"type": "execute", "command": "echo hello", "workdir": ""}"#);
        match response {
            Response::Execute {
                exit_code,
                stdout,
                stderr: _,
            } => {
                assert_eq!(exit_code, 0);
                assert_eq!(stdout.trim(), "hello");
            }
            _ => panic!("Expected Execute response"),
        }
    }

    #[test]
    fn test_invalid_request() {
        let response = process_request(r#"{"invalid": "json"}"#);
        match response {
            Response::Error { message } => {
                assert!(message.contains("Invalid request"));
            }
            _ => panic!("Expected Error response"),
        }
    }
}
