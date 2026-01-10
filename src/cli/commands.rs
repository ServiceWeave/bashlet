use std::time::{Duration, UNIX_EPOCH};

use chrono::{DateTime, Local, Utc};
use tracing::info;

use crate::agent::Agent;
use crate::cli::args::{
    AgentArgs, ConfigAction, ConfigArgs, CreateArgs, ExecArgs, InitArgs, ListArgs, OutputFormat,
    SessionRunArgs, TerminateArgs,
};
use crate::config::loader::get_config_path;
use crate::config::types::BashletConfig;
use crate::error::Result;
use crate::providers::registry::create_provider;
use crate::sandbox::{CommandResult, SandboxConfig, SandboxExecutor};
use crate::session::{parse_ttl, Session, SessionManager};

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

    // Create session
    let session = Session::new(
        args.name,
        args.mounts,
        args.tools,
        args.env_vars,
        args.workdir,
        args.wasm.or(config.sandbox.wasm_binary.clone()),
        ttl_seconds,
    );

    // Test that the sandbox can be initialized
    let sandbox_config = session_to_sandbox_config(&session, &config);
    SandboxExecutor::new(sandbox_config).await?;

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

    // Get and update session
    let session = manager.get(&args.session).await?;
    manager.touch(&args.session).await?;

    // Create executor and run command
    let sandbox_config = session_to_sandbox_config(&session, &config);
    let executor = SandboxExecutor::new(sandbox_config).await?;
    let result = executor.execute(&args.command).await?;

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

    // Build sandbox config directly without session
    let sandbox_config = SandboxConfig {
        wasm_binary: args.wasm.or(config.sandbox.wasm_binary),
        mounts: args.mounts,
        tools: args.tools,
        env_vars: args.env_vars,
        workdir: args.workdir,
        memory_limit_mb: config.sandbox.memory_limit_mb,
        timeout_seconds: config.sandbox.timeout_seconds,
    };

    let executor = SandboxExecutor::new(sandbox_config).await?;
    let result = executor.execute(&args.command).await?;

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
                        "tools": s.tools,
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
// Agent Command (AI-orchestrated mode)
// ============================================================================

pub async fn agent(args: AgentArgs, config: BashletConfig) -> Result<()> {
    info!(task = %args.task, provider = %args.provider, "Starting agent session");

    // Determine the model to use
    let model = args.model.or_else(|| {
        config
            .providers
            .get(&args.provider)
            .map(|p| p.default_model.clone())
    });

    // Initialize AI provider
    let provider = create_provider(&args.provider, model.as_deref(), &config)?;

    // Build sandbox configuration
    let sandbox_config = SandboxConfig {
        wasm_binary: args.wasm.or(config.sandbox.wasm_binary.clone()),
        mounts: args.mounts,
        tools: args.tools,
        env_vars: args.env_vars,
        workdir: args.workdir,
        memory_limit_mb: config.sandbox.memory_limit_mb,
        timeout_seconds: config.sandbox.timeout_seconds,
    };

    // Create and run agent
    let agent = Agent::new(provider, sandbox_config, args.max_iterations).await?;

    let result = agent.run(&args.task).await?;

    println!("{}", result);
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

fn session_to_sandbox_config(session: &Session, config: &BashletConfig) -> SandboxConfig {
    SandboxConfig {
        wasm_binary: session
            .wasm_binary
            .clone()
            .or(config.sandbox.wasm_binary.clone()),
        mounts: session.get_mounts(),
        tools: session.tools.clone(),
        env_vars: session.env_vars.clone(),
        workdir: session.workdir.clone(),
        memory_limit_mb: config.sandbox.memory_limit_mb,
        timeout_seconds: config.sandbox.timeout_seconds,
    }
}

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
