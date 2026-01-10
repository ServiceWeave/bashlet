use std::path::{Path, PathBuf};

use crate::config::types::BashletConfig;
use crate::error::{BashletError, Result};

/// Get the default configuration file path
pub fn get_config_path() -> PathBuf {
    if let Some(proj_dirs) = directories::ProjectDirs::from("com", "bashlet", "bashlet") {
        proj_dirs.config_dir().join("config.toml")
    } else {
        // Fallback to home directory
        dirs_fallback().join(".bashlet").join("config.toml")
    }
}

fn dirs_fallback() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// Load configuration from file, with defaults for missing values
pub fn load_config(config_path: Option<&Path>) -> Result<BashletConfig> {
    let path = config_path
        .map(PathBuf::from)
        .unwrap_or_else(get_config_path);

    if !path.exists() {
        // Return defaults if no config file exists
        return Ok(BashletConfig::default());
    }

    let content = std::fs::read_to_string(&path)?;
    let config: BashletConfig =
        toml::from_str(&content).map_err(|e| BashletError::TomlParse(e.to_string()))?;

    Ok(config)
}

/// Get the cache directory for WASM binaries
pub fn get_cache_dir() -> PathBuf {
    if let Some(proj_dirs) = directories::ProjectDirs::from("com", "bashlet", "bashlet") {
        proj_dirs.cache_dir().to_path_buf()
    } else {
        dirs_fallback().join(".cache").join("bashlet")
    }
}

/// Get the data directory for session storage
pub fn get_data_dir() -> PathBuf {
    if let Some(proj_dirs) = directories::ProjectDirs::from("com", "bashlet", "bashlet") {
        proj_dirs.data_dir().to_path_buf()
    } else {
        dirs_fallback().join(".local").join("share").join("bashlet")
    }
}
