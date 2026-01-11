use clap::Parser;

use bashlet::cli::args::{Cli, Commands};
use bashlet::cli::commands;
use bashlet::config::loader::load_config;
use bashlet::error::Result;

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize logging based on verbosity
    init_logging(cli.global_opts.verbose);

    // Load configuration (file + CLI overrides)
    let config = load_config(cli.global_opts.config.as_deref())?;
    let format = cli.global_opts.format.clone();

    // Dispatch to subcommand handler
    match cli.command {
        Commands::Create(args) => {
            commands::create(args, config, format).await?;
        }
        Commands::Run(args) => {
            commands::run(args, config, format).await?;
        }
        Commands::Terminate(args) => {
            commands::terminate(args, format).await?;
        }
        Commands::Exec(args) => {
            commands::exec(args, config, format).await?;
        }
        Commands::List(args) => {
            commands::list(args, format).await?;
        }
        Commands::Init(args) => {
            commands::init(args).await?;
        }
        Commands::Config(args) => {
            commands::config(args, config).await?;
        }
    }

    Ok(())
}

fn init_logging(verbosity: u8) {
    use tracing_subscriber::EnvFilter;

    let level = match verbosity {
        0 => "warn",
        1 => "info",
        2 => "debug",
        _ => "trace",
    };

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(level));

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .init();
}
