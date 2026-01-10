use std::path::PathBuf;

use http_body_util::{BodyExt, Full};
use hyper::body::Bytes;
use hyper::{Method, Request, StatusCode};
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;
use serde::{Deserialize, Serialize};
use tracing::debug;

use crate::error::{BashletError, Result};

/// Client for the Firecracker REST API.
///
/// Firecracker exposes a REST API over a Unix domain socket for
/// configuring and controlling the microVM.
pub struct FirecrackerApiClient {
    socket_path: PathBuf,
    #[cfg(target_os = "linux")]
    client: Client<hyperlocal::UnixConnector, Full<Bytes>>,
}

impl FirecrackerApiClient {
    /// Create a new API client connected to the Firecracker socket.
    #[cfg(target_os = "linux")]
    pub async fn new(socket_path: &PathBuf) -> Result<Self> {
        let client = Client::builder(TokioExecutor::new()).build(hyperlocal::UnixConnector);

        Ok(Self {
            socket_path: socket_path.clone(),
            client,
        })
    }

    #[cfg(not(target_os = "linux"))]
    pub async fn new(_socket_path: &PathBuf) -> Result<Self> {
        Err(BashletError::BackendNotAvailable {
            backend: "firecracker".to_string(),
            reason: "Firecracker is only available on Linux".to_string(),
        })
    }

    /// Make a request to the Firecracker API.
    #[cfg(target_os = "linux")]
    async fn request<T: Serialize>(
        &self,
        method: Method,
        path: &str,
        body: Option<&T>,
    ) -> Result<()> {
        let uri = hyperlocal::Uri::new(&self.socket_path, path);

        let body_bytes = match body {
            Some(b) => serde_json::to_vec(b)
                .map_err(|e| BashletError::FirecrackerApi {
                    message: format!("Failed to serialize request: {}", e),
                    status: None,
                })?
                .into(),
            None => Bytes::new(),
        };

        let req = Request::builder()
            .method(method)
            .uri(uri.to_string())
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .body(Full::new(body_bytes))
            .map_err(|e| BashletError::FirecrackerApi {
                message: format!("Failed to build request: {}", e),
                status: None,
            })?;

        debug!(path = %path, "Firecracker API request");

        let response =
            self.client
                .request(req)
                .await
                .map_err(|e| BashletError::FirecrackerApi {
                    message: format!("Request failed: {}", e),
                    status: None,
                })?;

        let status = response.status();
        if !status.is_success() {
            let body = response
                .collect()
                .await
                .map_err(|e| BashletError::FirecrackerApi {
                    message: format!("Failed to read error response: {}", e),
                    status: Some(status.as_u16()),
                })?;
            let error_body = String::from_utf8_lossy(&body.to_bytes());
            return Err(BashletError::FirecrackerApi {
                message: format!("API error: {}", error_body),
                status: Some(status.as_u16()),
            });
        }

        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    async fn request<T: Serialize>(
        &self,
        _method: Method,
        _path: &str,
        _body: Option<&T>,
    ) -> Result<()> {
        Err(BashletError::BackendNotAvailable {
            backend: "firecracker".to_string(),
            reason: "Firecracker is only available on Linux".to_string(),
        })
    }

    /// Configure the boot source (kernel image).
    pub async fn put_boot_source(&self, kernel_path: &PathBuf, boot_args: &str) -> Result<()> {
        #[derive(Serialize)]
        struct BootSource {
            kernel_image_path: String,
            boot_args: String,
        }

        self.request(
            Method::PUT,
            "/boot-source",
            Some(&BootSource {
                kernel_image_path: kernel_path.display().to_string(),
                boot_args: boot_args.to_string(),
            }),
        )
        .await
    }

    /// Configure the machine (vCPUs, memory).
    pub async fn put_machine_config(&self, vcpu_count: u8, mem_size_mib: u64) -> Result<()> {
        #[derive(Serialize)]
        struct MachineConfig {
            vcpu_count: u8,
            mem_size_mib: u64,
        }

        self.request(
            Method::PUT,
            "/machine-config",
            Some(&MachineConfig {
                vcpu_count,
                mem_size_mib,
            }),
        )
        .await
    }

    /// Add a drive (rootfs or data disk).
    pub async fn put_drive(
        &self,
        drive_id: &str,
        path: &PathBuf,
        is_read_only: bool,
    ) -> Result<()> {
        #[derive(Serialize)]
        struct Drive {
            drive_id: String,
            path_on_host: String,
            is_root_device: bool,
            is_read_only: bool,
        }

        self.request(
            Method::PUT,
            &format!("/drives/{}", drive_id),
            Some(&Drive {
                drive_id: drive_id.to_string(),
                path_on_host: path.display().to_string(),
                is_root_device: drive_id == "rootfs",
                is_read_only,
            }),
        )
        .await
    }

    /// Configure vsock device for guest-host communication.
    pub async fn put_vsock(&self, guest_cid: u32, uds_path: &PathBuf) -> Result<()> {
        #[derive(Serialize)]
        struct Vsock {
            guest_cid: u32,
            uds_path: String,
        }

        self.request(
            Method::PUT,
            "/vsock",
            Some(&Vsock {
                guest_cid,
                uds_path: uds_path.display().to_string(),
            }),
        )
        .await
    }

    /// Perform an action (start, stop, etc.).
    pub async fn put_actions(&self, action_type: &str) -> Result<()> {
        #[derive(Serialize)]
        struct Actions {
            action_type: String,
        }

        self.request(
            Method::PUT,
            "/actions",
            Some(&Actions {
                action_type: action_type.to_string(),
            }),
        )
        .await
    }

    /// Get instance information.
    #[cfg(target_os = "linux")]
    pub async fn get_info(&self) -> Result<InstanceInfo> {
        let uri = hyperlocal::Uri::new(&self.socket_path, "/");

        let req = Request::builder()
            .method(Method::GET)
            .uri(uri.to_string())
            .header("Accept", "application/json")
            .body(Full::new(Bytes::new()))
            .map_err(|e| BashletError::FirecrackerApi {
                message: format!("Failed to build request: {}", e),
                status: None,
            })?;

        let response =
            self.client
                .request(req)
                .await
                .map_err(|e| BashletError::FirecrackerApi {
                    message: format!("Request failed: {}", e),
                    status: None,
                })?;

        let body = response
            .collect()
            .await
            .map_err(|e| BashletError::FirecrackerApi {
                message: format!("Failed to read response: {}", e),
                status: None,
            })?;

        serde_json::from_slice(&body.to_bytes()).map_err(|e| BashletError::FirecrackerApi {
            message: format!("Failed to parse response: {}", e),
            status: None,
        })
    }

    #[cfg(not(target_os = "linux"))]
    pub async fn get_info(&self) -> Result<InstanceInfo> {
        Err(BashletError::BackendNotAvailable {
            backend: "firecracker".to_string(),
            reason: "Firecracker is only available on Linux".to_string(),
        })
    }
}

/// Instance information from Firecracker.
#[derive(Debug, Deserialize)]
pub struct InstanceInfo {
    pub id: String,
    pub state: String,
    pub vmm_version: String,
}
