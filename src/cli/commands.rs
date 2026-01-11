use std::path::PathBuf;
use std::time::{Duration, UNIX_EPOCH};

use chrono::{DateTime, Local, Utc};
use tracing::info;

use crate::cli::args::{
    ConfigAction, ConfigArgs, CreateArgs, ExecArgs, InitArgs, ListArgs, Mount, OutputFormat,
    SessionRunArgs, TerminateArgs,
};
use crate::config::loader::get_config_path;
use crate::config::types::{BashletConfig, SandboxConfig};
use crate::error::{BashletError, Result};
use crate::sandbox::{create_backend, CommandResult, RuntimeConfig};
use crate::session::{parse_ttl, Session, SessionManager};

// ============================================================================
// Preset Helpers
// ============================================================================

/// Expand tilde (~) in a path string to the user's home directory.
fn expand_tilde(path: &str) -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        if let Some(stripped) = path.strip_prefix("~/") {
            return PathBuf::from(home).join(stripped);
        } else if path == "~" {
            return PathBuf::from(home);
        }
    }
    PathBuf::from(path)
}

/// Apply a preset configuration, merging with CLI arguments.
/// Returns the setup commands to run after backend creation.
fn apply_preset(
    preset_name: &str,
    config: &BashletConfig,
    mounts: &mut Vec<Mount>,
    env_vars: &mut Vec<(String, String)>,
    workdir: &mut String,
    sandbox_config: &mut SandboxConfig,
) -> Result<Vec<String>> {
    let preset = config
        .presets
        .get(preset_name)
        .ok_or_else(|| BashletError::PresetNotFound {
            name: preset_name.to_string(),
        })?;

    info!(preset = %preset_name, "Applying preset configuration");

    // Merge mounts (preset first, CLI args can add more)
    let preset_mounts: Vec<Mount> = preset
        .mounts
        .iter()
        .map(|(host, guest, ro)| Mount {
            host_path: expand_tilde(host),
            guest_path: guest.clone(),
            readonly: *ro,
        })
        .collect();
    mounts.splice(0..0, preset_mounts);

    // Merge env vars (preset first, CLI args can override)
    let mut merged_env = preset.env_vars.clone();
    merged_env.append(env_vars);
    *env_vars = merged_env;

    // Apply workdir if not overridden by CLI (check if it's the default value)
    if let Some(ref preset_workdir) = preset.workdir {
        if workdir == "/workspace" {
            *workdir = preset_workdir.clone();
        }
    }

    // Apply backend override
    if let Some(ref backend) = preset.backend {
        sandbox_config.backend = backend.clone();
    }

    // Apply rootfs_image for Firecracker
    if let Some(ref rootfs) = preset.rootfs_image {
        sandbox_config.firecracker.rootfs_path = Some(expand_tilde(&rootfs.display().to_string()));
    }

    Ok(preset.setup_commands.clone())
}

// ============================================================================
// Session Commands
// ============================================================================

/// Create a new sandbox session
pub async fn create(args: CreateArgs, config: BashletConfig, format: OutputFormat) -> Result<()> {
    info!(name = ?args.name, "Creating new session");

    let manager = SessionManager::new();

    // Check if name already exists
    if let Some(ref name) = args.name {
        if manager.get(name).await.is_ok() {
            return Err(crate::error::BashletError::SessionNameExists { name: name.clone() });
        }
    }

    // Parse TTL if provided
    let ttl_seconds = match &args.ttl {
        Some(ttl_str) => Some(parse_ttl(ttl_str)?),
        None => None,
    };

    // Handle legacy --wasm flag by updating wasmer config
    let mut sandbox_config = config.sandbox.clone();
    if let Some(wasm_path) = args.wasm.clone() {
        sandbox_config.wasmer.wasm_binary = Some(wasm_path);
    }

    // Prepare mutable args for preset merging
    let mut mounts = args.mounts.clone();
    let mut env_vars = args.env_vars.clone();
    let mut workdir = args.workdir.clone();

    // Apply preset if specified
    let setup_commands = if let Some(ref preset_name) = args.preset {
        apply_preset(
            preset_name,
            &config,
            &mut mounts,
            &mut env_vars,
            &mut workdir,
            &mut sandbox_config,
        )?
    } else {
        vec![]
    };

    // Create session
    let session = Session::new(
        args.name,
        mounts.clone(),
        env_vars.clone(),
        workdir.clone(),
        sandbox_config.wasmer.wasm_binary.clone(),
        ttl_seconds,
        args.preset.clone(),
    );

    // Create the sandbox backend
    let runtime = RuntimeConfig {
        mounts,
        env_vars,
        workdir,
        memory_limit_mb: sandbox_config.memory_limit_mb,
        timeout_seconds: sandbox_config.timeout_seconds,
    };
    let backend = create_backend(&sandbox_config, runtime).await?;

    // Run setup commands
    for cmd in &setup_commands {
        info!(command = %cmd, "Running setup command");
        let result = backend.execute(cmd).await?;
        if result.exit_code != 0 {
            return Err(BashletError::SandboxExecution(format!(
                "Setup command failed: {}",
                cmd
            )));
        }
    }

    // Save session
    let session_id = session.id.clone();
    let session_name = session.name.clone();
    manager.save(&session).await?;

    match format {
        OutputFormat::Text => {
            if let Some(name) = session_name {
                println!("{}", name);
            } else {
                println!("{}", session_id);
            }
        }
        OutputFormat::Json => {
            println!(
                "{}",
                serde_json::json!({
                    "id": session_id,
                    "name": session_name,
                })
            );
        }
    }

    Ok(())
}

/// Execute a command in an existing session
pub async fn run(args: SessionRunArgs, config: BashletConfig, format: OutputFormat) -> Result<()> {
    info!(session = %args.session, command = %args.command, "Running command in session");

    let manager = SessionManager::new();

    // Try to get existing session, or create if --create flag is set
    let (session, setup_commands) = match manager.get(&args.session).await {
        Ok(session) => (session, vec![]),
        Err(crate::error::BashletError::SessionNotFound { .. }) if args.create => {
            info!(session = %args.session, "Session not found, creating new session");

            // Parse TTL if provided
            let ttl_seconds = match &args.ttl {
                Some(ttl_str) => Some(parse_ttl(ttl_str)?),
                None => None,
            };

            // Prepare mutable args for preset merging
            let mut mounts = args.mounts.clone();
            let mut env_vars = args.env_vars.clone();
            let mut workdir = args.workdir.clone();
            let mut sandbox_config = config.sandbox.clone();

            // Apply preset if specified
            let setup_commands = if let Some(ref preset_name) = args.preset {
                apply_preset(
                    preset_name,
                    &config,
                    &mut mounts,
                    &mut env_vars,
                    &mut workdir,
                    &mut sandbox_config,
                )?
            } else {
                vec![]
            };

            // Create session with the provided name
            let session = Session::new(
                Some(args.session.clone()),
                mounts,
                env_vars,
                workdir,
                sandbox_config.wasmer.wasm_binary.clone(),
                ttl_seconds,
                args.preset.clone(),
            );

            manager.save(&session).await?;
            (session, setup_commands)
        }
        Err(e) => return Err(e),
    };

    manager.touch(&args.session).await?;

    // Build sandbox config from session
    let mut sandbox_config = config.sandbox.clone();
    if let Some(wasm_path) = &session.wasm_binary {
        sandbox_config.wasmer.wasm_binary = Some(wasm_path.clone());
    }

    let runtime = RuntimeConfig {
        mounts: session.get_mounts(),
        env_vars: session.env_vars.clone(),
        workdir: session.workdir.clone(),
        memory_limit_mb: sandbox_config.memory_limit_mb,
        timeout_seconds: sandbox_config.timeout_seconds,
    };

    let backend = create_backend(&sandbox_config, runtime).await?;

    // Run setup commands if this is a newly created session
    for cmd in &setup_commands {
        info!(command = %cmd, "Running setup command");
        let result = backend.execute(cmd).await?;
        if result.exit_code != 0 {
            return Err(BashletError::SandboxExecution(format!(
                "Setup command failed: {}",
                cmd
            )));
        }
    }

    let result = backend.execute(&args.command).await?;

    output_command_result(&result, format);

    Ok(())
}

/// Terminate a session
pub async fn terminate(args: TerminateArgs, format: OutputFormat) -> Result<()> {
    info!(session = %args.session, "Terminating session");

    let manager = SessionManager::new();
    manager.delete(&args.session).await?;

    match format {
        OutputFormat::Text => {
            println!("Session '{}' terminated", args.session);
        }
        OutputFormat::Json => {
            println!(
                "{}",
                serde_json::json!({
                    "terminated": args.session,
                })
            );
        }
    }

    Ok(())
}

/// Execute a one-shot command (create, run, terminate)
pub async fn exec(args: ExecArgs, config: BashletConfig, format: OutputFormat) -> Result<()> {
    info!(command = %args.command, "Executing one-shot command");

    // Build sandbox config
    let mut sandbox_config = config.sandbox.clone();

    // Override backend if specified
    if let Some(backend) = args.backend.clone() {
        sandbox_config.backend = backend;
    }

    // Handle legacy --wasm flag
    if let Some(wasm_path) = args.wasm.clone() {
        sandbox_config.wasmer.wasm_binary = Some(wasm_path);
    }

    // Prepare mutable args for preset merging
    let mut mounts = args.mounts.clone();
    let mut env_vars = args.env_vars.clone();
    let mut workdir = args.workdir.clone();

    // Apply preset if specified
    let setup_commands = if let Some(ref preset_name) = args.preset {
        apply_preset(
            preset_name,
            &config,
            &mut mounts,
            &mut env_vars,
            &mut workdir,
            &mut sandbox_config,
        )?
    } else {
        vec![]
    };

    let runtime = RuntimeConfig {
        mounts,
        env_vars,
        workdir,
        memory_limit_mb: sandbox_config.memory_limit_mb,
        timeout_seconds: sandbox_config.timeout_seconds,
    };

    let backend = create_backend(&sandbox_config, runtime).await?;

    // Run setup commands
    for cmd in &setup_commands {
        info!(command = %cmd, "Running setup command");
        let result = backend.execute(cmd).await?;
        if result.exit_code != 0 {
            return Err(BashletError::SandboxExecution(format!(
                "Setup command failed: {}",
                cmd
            )));
        }
    }

    let result = backend.execute(&args.command).await?;

    output_command_result(&result, format);

    Ok(())
}

/// List all active sessions
pub async fn list(args: ListArgs, format: OutputFormat) -> Result<()> {
    let manager = SessionManager::new();

    // Cleanup expired sessions first (unless --all)
    if !args.all {
        manager.cleanup_expired().await?;
    }

    let sessions = manager.list().await?;

    match format {
        OutputFormat::Text => {
            if sessions.is_empty() {
                println!("No active sessions");
            } else {
                println!(
                    "{:<12} {:<16} {:<20} {:<10} MOUNTS",
                    "ID", "NAME", "CREATED", "TTL"
                );
                println!("{}", "-".repeat(70));

                for session in sessions {
                    let name = session.name.as_deref().unwrap_or("-");
                    let created = format_timestamp(session.created_at);
                    let ttl = session
                        .ttl_seconds
                        .map(format_duration)
                        .unwrap_or_else(|| "-".to_string());
                    let mounts = session
                        .mounts
                        .iter()
                        .map(|m| format!("{}:{}", m.host_path, m.guest_path))
                        .collect::<Vec<_>>()
                        .join(", ");

                    let expired_marker = if session.is_expired() {
                        " (expired)"
                    } else {
                        ""
                    };

                    println!(
                        "{:<12} {:<16} {:<20} {:<10} {}{}",
                        session.id, name, created, ttl, mounts, expired_marker
                    );
                }
            }
        }
        OutputFormat::Json => {
            let json_sessions: Vec<_> = sessions
                .iter()
                .map(|s| {
                    serde_json::json!({
                        "id": s.id,
                        "name": s.name,
                        "created_at": s.created_at,
                        "last_activity": s.last_activity,
                        "ttl_seconds": s.ttl_seconds,
                        "expired": s.is_expired(),
                        "mounts": s.mounts,
                        "workdir": s.workdir,
                    })
                })
                .collect();

            println!("{}", serde_json::to_string_pretty(&json_sessions)?);
        }
    }

    Ok(())
}

// ============================================================================
// Config Commands
// ============================================================================

pub async fn init(args: InitArgs) -> Result<()> {
    let config_path = get_config_path();

    if config_path.exists() && !args.force {
        println!("Configuration already exists at: {}", config_path.display());
        println!("Use --force to overwrite");
        return Ok(());
    }

    // Create parent directories if needed
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Write default configuration
    let default_config = BashletConfig::default();
    let toml_str = toml::to_string_pretty(&default_config)
        .map_err(|e| crate::error::BashletError::Config(e.to_string()))?;

    std::fs::write(&config_path, toml_str)?;

    println!("Created configuration at: {}", config_path.display());
    println!("\nQuick start:");
    println!("  # Create a session with mounted directory");
    println!("  bashlet create --mount ./src:/workspace --name myenv");
    println!();
    println!("  # Run commands in the session");
    println!("  bashlet run myenv \"ls -la\"");
    println!();
    println!("  # Or run a one-shot command");
    println!("  bashlet exec --mount ./src:/workspace \"ls -la\"");
    println!();
    println!("  # Terminate session when done");
    println!("  bashlet terminate myenv");

    Ok(())
}

pub async fn config(args: ConfigArgs, config: BashletConfig) -> Result<()> {
    match args.action {
        ConfigAction::Show => {
            let toml_str = toml::to_string_pretty(&config)
                .map_err(|e| crate::error::BashletError::Config(e.to_string()))?;
            println!("{}", toml_str);
        }
        ConfigAction::Path => {
            println!("{}", get_config_path().display());
        }
    }
    Ok(())
}

// ============================================================================
// Helper Functions
// ============================================================================

fn output_command_result(result: &CommandResult, format: OutputFormat) {
    match format {
        OutputFormat::Text => {
            if !result.stdout.is_empty() {
                print!("{}", result.stdout);
            }
            if !result.stderr.is_empty() {
                eprint!("{}", result.stderr);
            }
            // Exit with the command's exit code
            if result.exit_code != 0 {
                std::process::exit(result.exit_code);
            }
        }
        OutputFormat::Json => {
            println!(
                "{}",
                serde_json::json!({
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "exit_code": result.exit_code,
                })
            );
        }
    }
}

fn format_timestamp(timestamp: u64) -> String {
    let datetime = DateTime::<Utc>::from(UNIX_EPOCH + Duration::from_secs(timestamp));
    let local: DateTime<Local> = datetime.into();
    local.format("%Y-%m-%d %H:%M").to_string()
}

fn format_duration(seconds: u64) -> String {
    if seconds < 60 {
        format!("{}s", seconds)
    } else if seconds < 3600 {
        format!("{}m", seconds / 60)
    } else if seconds < 86400 {
        format!("{}h", seconds / 3600)
    } else {
        format!("{}d", seconds / 86400)
    }
}
