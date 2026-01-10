use std::sync::Arc;

use crate::config::types::BashletConfig;
use crate::error::{BashletError, Result};
use crate::providers::anthropic::AnthropicProvider;
use crate::providers::openai::OpenAIProvider;
use crate::providers::traits::AIProvider;

pub fn create_provider(
    name: &str,
    model: Option<&str>,
    config: &BashletConfig,
) -> Result<Arc<dyn AIProvider>> {
    let provider_config =
        config
            .providers
            .get(name)
            .ok_or_else(|| BashletError::ProviderNotFound {
                provider: name.to_string(),
            })?;

    let api_key =
        std::env::var(&provider_config.api_key_env).map_err(|_| BashletError::ApiKeyMissing {
            provider: name.to_string(),
            env_var: provider_config.api_key_env.clone(),
        })?;

    let model = model
        .map(String::from)
        .unwrap_or_else(|| provider_config.default_model.clone());

    let provider: Arc<dyn AIProvider> = match name {
        "anthropic" => Arc::new(AnthropicProvider::new(
            api_key,
            model,
            provider_config.base_url.clone(),
        )),
        "openai" => Arc::new(OpenAIProvider::new(
            api_key,
            model,
            provider_config.base_url.clone(),
        )),
        _ => {
            return Err(BashletError::ProviderNotFound {
                provider: name.to_string(),
            });
        }
    };

    Ok(provider)
}
