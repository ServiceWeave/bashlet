use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::error::{BashletError, Result};
use crate::providers::traits::{
    AIProvider, ChatRequest, ChatResponse, ContentBlock, Message, MessageContent, Role, StopReason,
    Tool, Usage,
};

pub struct AnthropicProvider {
    client: Client,
    api_key: String,
    model: String,
    base_url: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String, model: String, base_url: Option<String>) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model,
            base_url: base_url.unwrap_or_else(|| "https://api.anthropic.com".to_string()),
        }
    }
}

#[async_trait]
impl AIProvider for AnthropicProvider {
    fn name(&self) -> &str {
        "anthropic"
    }

    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        let url = format!("{}/v1/messages", self.base_url);

        // Convert to Anthropic API format
        let api_request = AnthropicRequest {
            model: self.model.clone(),
            max_tokens: request.max_tokens,
            system: request.system_prompt,
            messages: request.messages.into_iter().map(|m| m.into()).collect(),
            tools: if request.tools.is_empty() {
                None
            } else {
                Some(request.tools.into_iter().map(|t| t.into()).collect())
            },
            temperature: Some(request.temperature),
        };

        let response = self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&api_request)
            .send()
            .await?;

        let status = response.status();

        if status == 429 {
            let retry_after = response
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse().ok());
            return Err(BashletError::RateLimited { retry_after });
        }

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(BashletError::ProviderApi {
                message: error_text,
                status: Some(status.as_u16()),
            });
        }

        let api_response: AnthropicResponse = response.json().await?;

        Ok(api_response.into())
    }
}

// Anthropic API types

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Serialize, Deserialize)]
struct AnthropicMessage {
    role: String,
    content: serde_json::Value,
}

#[derive(Serialize)]
struct AnthropicTool {
    name: String,
    description: String,
    input_schema: serde_json::Value,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContentBlock>,
    stop_reason: String,
    usage: AnthropicUsage,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
}

#[derive(Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

// Conversions

impl From<Message> for AnthropicMessage {
    fn from(msg: Message) -> Self {
        let role = match msg.role {
            Role::User => "user",
            Role::Assistant => "assistant",
            Role::System => "user", // System messages handled separately
        };

        let content = match msg.content {
            MessageContent::Text(text) => serde_json::Value::String(text),
            MessageContent::Blocks(blocks) => {
                let api_blocks: Vec<serde_json::Value> = blocks
                    .into_iter()
                    .map(|b| match b {
                        ContentBlock::Text { text } => {
                            serde_json::json!({"type": "text", "text": text})
                        }
                        ContentBlock::ToolUse { id, name, input } => {
                            serde_json::json!({
                                "type": "tool_use",
                                "id": id,
                                "name": name,
                                "input": input
                            })
                        }
                        ContentBlock::ToolResult {
                            tool_use_id,
                            content,
                            is_error,
                        } => {
                            serde_json::json!({
                                "type": "tool_result",
                                "tool_use_id": tool_use_id,
                                "content": content,
                                "is_error": is_error
                            })
                        }
                    })
                    .collect();
                serde_json::Value::Array(api_blocks)
            }
        };

        AnthropicMessage {
            role: role.to_string(),
            content,
        }
    }
}

impl From<Tool> for AnthropicTool {
    fn from(tool: Tool) -> Self {
        AnthropicTool {
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema,
        }
    }
}

impl From<AnthropicResponse> for ChatResponse {
    fn from(resp: AnthropicResponse) -> Self {
        ChatResponse {
            content: resp
                .content
                .into_iter()
                .map(|b| match b {
                    AnthropicContentBlock::Text { text } => ContentBlock::Text { text },
                    AnthropicContentBlock::ToolUse { id, name, input } => {
                        ContentBlock::ToolUse { id, name, input }
                    }
                })
                .collect(),
            stop_reason: match resp.stop_reason.as_str() {
                "end_turn" => StopReason::EndTurn,
                "tool_use" => StopReason::ToolUse,
                "max_tokens" => StopReason::MaxTokens,
                "stop_sequence" => StopReason::StopSequence,
                _ => StopReason::EndTurn,
            },
            usage: Usage {
                input_tokens: resp.usage.input_tokens,
                output_tokens: resp.usage.output_tokens,
            },
        }
    }
}
