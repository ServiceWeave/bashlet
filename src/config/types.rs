use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct BashletConfig {
    pub agent: AgentConfig,
    pub sandbox: SandboxConfig,
    pub providers: HashMap<String, ProviderConfig>,
}

impl Default for BashletConfig {
    fn default() -> Self {
        Self {
            agent: AgentConfig::default(),
            sandbox: SandboxConfig::default(),
            providers: HashMap::from([
                ("anthropic".to_string(), ProviderConfig::anthropic_default()),
                ("openai".to_string(), ProviderConfig::openai_default()),
            ]),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AgentConfig {
    pub default_provider: String,
    pub default_model: Option<String>,
    pub max_iterations: u32,
    pub temperature: f32,
    pub max_tokens: u32,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            default_provider: "anthropic".to_string(),
            default_model: None,
            max_iterations: 50,
            temperature: 0.0,
            max_tokens: 4096,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SandboxConfig {
    pub wasm_binary: Option<PathBuf>,
    pub default_workdir: String,
    pub memory_limit_mb: u64,
    pub timeout_seconds: u64,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            wasm_binary: None,
            default_workdir: "/workspace".to_string(),
            memory_limit_mb: 256,
            timeout_seconds: 300,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub api_key_env: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    pub default_model: String,
    pub models: Vec<String>,
}

impl ProviderConfig {
    pub fn anthropic_default() -> Self {
        Self {
            api_key_env: "ANTHROPIC_API_KEY".to_string(),
            base_url: None,
            default_model: "claude-sonnet-4-20250514".to_string(),
            models: vec![
                "claude-sonnet-4-20250514".to_string(),
                "claude-opus-4-20250514".to_string(),
            ],
        }
    }

    pub fn openai_default() -> Self {
        Self {
            api_key_env: "OPENAI_API_KEY".to_string(),
            base_url: None,
            default_model: "gpt-4o".to_string(),
            models: vec!["gpt-4o".to_string(), "gpt-4o-mini".to_string()],
        }
    }
}
