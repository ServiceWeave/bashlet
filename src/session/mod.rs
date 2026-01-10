use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tokio::fs;
use tracing::{debug, info};

use crate::cli::args::Mount;
use crate::config::loader::get_data_dir;
use crate::error::{BashletError, Result};

/// Session state that persists between commands
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    /// Unique session identifier
    pub id: String,
    /// Optional human-readable name
    pub name: Option<String>,
    /// Mount configurations
    pub mounts: Vec<SerializableMount>,
    /// Environment variables
    pub env_vars: Vec<(String, String)>,
    /// Working directory inside sandbox
    pub workdir: String,
    /// Custom WASM binary path
    pub wasm_binary: Option<PathBuf>,
    /// Creation timestamp (Unix epoch seconds)
    pub created_at: u64,
    /// Last activity timestamp (Unix epoch seconds)
    pub last_activity: u64,
    /// Time-to-live in seconds (None = no expiration)
    pub ttl_seconds: Option<u64>,
}

/// Serializable version of Mount (PathBuf needs special handling)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializableMount {
    pub host_path: String,
    pub guest_path: String,
    pub readonly: bool,
}

impl From<&Mount> for SerializableMount {
    fn from(mount: &Mount) -> Self {
        Self {
            host_path: mount.host_path.display().to_string(),
            guest_path: mount.guest_path.clone(),
            readonly: mount.readonly,
        }
    }
}

impl From<&SerializableMount> for Mount {
    fn from(mount: &SerializableMount) -> Self {
        Self {
            host_path: PathBuf::from(&mount.host_path),
            guest_path: mount.guest_path.clone(),
            readonly: mount.readonly,
        }
    }
}

impl Session {
    /// Create a new session with a unique ID
    pub fn new(
        name: Option<String>,
        mounts: Vec<Mount>,
        env_vars: Vec<(String, String)>,
        workdir: String,
        wasm_binary: Option<PathBuf>,
        ttl_seconds: Option<u64>,
    ) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // Generate a short unique ID
        let id = generate_session_id();

        Self {
            id,
            name,
            mounts: mounts.iter().map(SerializableMount::from).collect(),
            env_vars,
            workdir,
            wasm_binary,
            created_at: now,
            last_activity: now,
            ttl_seconds,
        }
    }

    /// Check if session has expired based on TTL
    pub fn is_expired(&self) -> bool {
        if let Some(ttl) = self.ttl_seconds {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            now > self.last_activity + ttl
        } else {
            false
        }
    }

    /// Update last activity timestamp
    pub fn touch(&mut self) {
        self.last_activity = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
    }

    /// Get mounts as Mount structs
    pub fn get_mounts(&self) -> Vec<Mount> {
        self.mounts.iter().map(Mount::from).collect()
    }

    /// Get display identifier (name or id)
    pub fn display_id(&self) -> &str {
        self.name.as_deref().unwrap_or(&self.id)
    }
}

/// Session manager handles persistence and lifecycle
pub struct SessionManager {
    sessions_dir: PathBuf,
}

impl SessionManager {
    /// Create a new session manager
    pub fn new() -> Self {
        let sessions_dir = get_data_dir().join("sessions");
        Self { sessions_dir }
    }

    /// Ensure sessions directory exists
    async fn ensure_dir(&self) -> Result<()> {
        fs::create_dir_all(&self.sessions_dir).await?;
        Ok(())
    }

    /// Get session file path
    fn session_path(&self, id: &str) -> PathBuf {
        self.sessions_dir.join(format!("{}.json", id))
    }

    /// Save a session to disk
    pub async fn save(&self, session: &Session) -> Result<()> {
        self.ensure_dir().await?;
        let path = self.session_path(&session.id);
        let json = serde_json::to_string_pretty(session)?;
        fs::write(&path, json).await?;
        debug!(id = %session.id, path = %path.display(), "Saved session");
        Ok(())
    }

    /// Load a session by ID or name
    pub async fn get(&self, id_or_name: &str) -> Result<Session> {
        // First try direct ID lookup
        let path = self.session_path(id_or_name);
        if path.exists() {
            let json = fs::read_to_string(&path).await?;
            let session: Session = serde_json::from_str(&json)?;

            if session.is_expired() {
                // Clean up expired session
                self.delete(id_or_name).await?;
                return Err(BashletError::SessionExpired {
                    id: id_or_name.to_string(),
                });
            }

            return Ok(session);
        }

        // Try to find by name
        let sessions = self.list().await?;
        for session in sessions {
            if session.name.as_deref() == Some(id_or_name) {
                if session.is_expired() {
                    self.delete(&session.id).await?;
                    return Err(BashletError::SessionExpired {
                        id: id_or_name.to_string(),
                    });
                }
                return Ok(session);
            }
        }

        Err(BashletError::SessionNotFound {
            id: id_or_name.to_string(),
        })
    }

    /// Delete a session
    pub async fn delete(&self, id_or_name: &str) -> Result<()> {
        // Try direct ID first
        let path = self.session_path(id_or_name);
        if path.exists() {
            fs::remove_file(&path).await?;
            info!(id = %id_or_name, "Deleted session");
            return Ok(());
        }

        // Try to find by name
        let sessions = self.list().await?;
        for session in sessions {
            if session.name.as_deref() == Some(id_or_name) {
                let path = self.session_path(&session.id);
                fs::remove_file(&path).await?;
                info!(id = %session.id, name = %id_or_name, "Deleted session");
                return Ok(());
            }
        }

        Err(BashletError::SessionNotFound {
            id: id_or_name.to_string(),
        })
    }

    /// List all sessions (includes expired check)
    pub async fn list(&self) -> Result<Vec<Session>> {
        self.ensure_dir().await?;

        let mut sessions = Vec::new();
        let mut entries = fs::read_dir(&self.sessions_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                match fs::read_to_string(&path).await {
                    Ok(json) => {
                        if let Ok(session) = serde_json::from_str::<Session>(&json) {
                            sessions.push(session);
                        }
                    }
                    Err(e) => {
                        debug!(path = %path.display(), error = %e, "Failed to read session file");
                    }
                }
            }
        }

        // Sort by creation time (newest first)
        sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        Ok(sessions)
    }

    /// Clean up expired sessions
    pub async fn cleanup_expired(&self) -> Result<usize> {
        let sessions = self.list().await?;
        let mut cleaned = 0;

        for session in sessions {
            if session.is_expired() {
                if let Ok(()) = self.delete(&session.id).await {
                    cleaned += 1;
                }
            }
        }

        if cleaned > 0 {
            info!(count = cleaned, "Cleaned up expired sessions");
        }

        Ok(cleaned)
    }

    /// Update session's last activity time
    pub async fn touch(&self, id_or_name: &str) -> Result<()> {
        let mut session = self.get(id_or_name).await?;
        session.touch();
        self.save(&session).await
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Generate a short, unique session ID
fn generate_session_id() -> String {
    use std::sync::atomic::{AtomicU32, Ordering};
    static COUNTER: AtomicU32 = AtomicU32::new(0);

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let counter = COUNTER.fetch_add(1, Ordering::SeqCst);

    // Create a short ID from timestamp + counter
    // Using base36 for compactness
    let combined = (timestamp & 0xFFFFFF) << 8 | (counter as u64 & 0xFF);
    format_base36(combined)
}

/// Format a number as base36 string
fn format_base36(mut n: u64) -> String {
    const CHARS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

    if n == 0 {
        return "0".to_string();
    }

    let mut result = Vec::new();
    while n > 0 {
        result.push(CHARS[(n % 36) as usize]);
        n /= 36;
    }
    result.reverse();
    String::from_utf8(result).unwrap_or_else(|_| "error".to_string())
}

/// Parse TTL string (e.g., "5m", "1h", "30s")
pub fn parse_ttl(s: &str) -> Result<u64> {
    let s = s.trim().to_lowercase();

    if s.is_empty() {
        return Err(BashletError::Config("Empty TTL value".to_string()));
    }

    let (num_str, multiplier) = if s.ends_with('s') {
        (&s[..s.len() - 1], 1u64)
    } else if s.ends_with('m') {
        (&s[..s.len() - 1], 60u64)
    } else if s.ends_with('h') {
        (&s[..s.len() - 1], 3600u64)
    } else if s.ends_with('d') {
        (&s[..s.len() - 1], 86400u64)
    } else {
        // Assume seconds if no suffix
        (s.as_str(), 1u64)
    };

    let num: u64 = num_str
        .parse()
        .map_err(|_| BashletError::Config(format!("Invalid TTL value: {}", s)))?;

    Ok(num * multiplier)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ttl() {
        assert_eq!(parse_ttl("30s").unwrap(), 30);
        assert_eq!(parse_ttl("5m").unwrap(), 300);
        assert_eq!(parse_ttl("1h").unwrap(), 3600);
        assert_eq!(parse_ttl("2d").unwrap(), 172800);
        assert_eq!(parse_ttl("60").unwrap(), 60);
    }

    #[test]
    fn test_format_base36() {
        assert_eq!(format_base36(0), "0");
        assert_eq!(format_base36(10), "a");
        assert_eq!(format_base36(35), "z");
        assert_eq!(format_base36(36), "10");
    }
}
