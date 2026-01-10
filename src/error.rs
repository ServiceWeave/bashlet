use thiserror::Error;

#[derive(Error, Debug)]
pub enum BashletError {
    // Configuration errors
    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Configuration file not found: {path}")]
    ConfigNotFound { path: String },

    // Provider errors
    #[error("Provider '{provider}' not found")]
    ProviderNotFound { provider: String },

    #[error("API key not found for provider '{provider}' (expected env: {env_var})")]
    ApiKeyMissing { provider: String, env_var: String },

    #[error("Provider API error: {message}")]
    ProviderApi {
        message: String,
        status: Option<u16>,
    },

    #[error("Rate limited by provider, retry after {retry_after:?} seconds")]
    RateLimited { retry_after: Option<u64> },

    // Sandbox errors
    #[error("Sandbox initialization failed: {0}")]
    SandboxInit(String),

    #[error("WASM compilation failed: {0}")]
    WasmCompilation(String),

    #[error("Command execution failed in sandbox: {0}")]
    SandboxExecution(String),

    #[error("Sandbox timeout after {seconds} seconds")]
    SandboxTimeout { seconds: u64 },

    #[error("Mount path does not exist: {path}")]
    MountPathNotFound { path: String },

    #[error("WASM binary not found: {path}")]
    WasmNotFound { path: String },

    // Session errors
    #[error("Session not found: {id}")]
    SessionNotFound { id: String },

    #[error("Session expired: {id}")]
    SessionExpired { id: String },

    #[error("Session name already exists: {name}")]
    SessionNameExists { name: String },

    // Agent errors
    #[error("Agent loop exceeded maximum iterations ({max})")]
    MaxIterationsExceeded { max: u32 },

    #[error("Tool '{tool}' not found")]
    ToolNotFound { tool: String },

    #[error("Invalid tool input for '{tool}': {reason}")]
    InvalidToolInput { tool: String, reason: String },

    // IO errors
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    // Serialization errors
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("TOML parse error: {0}")]
    TomlParse(String),

    // HTTP errors
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    // Generic wrapper
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl BashletError {
    pub fn is_retryable(&self) -> bool {
        matches!(self, Self::RateLimited { .. } | Self::SandboxTimeout { .. })
    }
}

pub type Result<T> = std::result::Result<T, BashletError>;
