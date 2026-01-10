use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::error::{BashletError, Result};
use crate::providers::traits::{
    AIProvider, ChatRequest, ChatResponse, ContentBlock, Message, MessageContent, Role, StopReason,
    Tool, Usage,
};

pub struct OpenAIProvider {
    client: Client,
    api_key: String,
    model: String,
    base_url: String,
}

impl OpenAIProvider {
    pub fn new(api_key: String, model: String, base_url: Option<String>) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model,
            base_url: base_url.unwrap_or_else(|| "https://api.openai.com".to_string()),
        }
    }
}

#[async_trait]
impl AIProvider for OpenAIProvider {
    fn name(&self) -> &str {
        "openai"
    }

    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        let url = format!("{}/v1/chat/completions", self.base_url);

        // Build messages with system prompt first
        let mut messages: Vec<OpenAIMessage> = Vec::new();

        if let Some(system) = &request.system_prompt {
            messages.push(OpenAIMessage {
                role: "system".to_string(),
                content: Some(system.clone()),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        for msg in request.messages {
            messages.extend(convert_message(msg));
        }

        let api_request = OpenAIRequest {
            model: self.model.clone(),
            messages,
            tools: if request.tools.is_empty() {
                None
            } else {
                Some(request.tools.into_iter().map(|t| t.into()).collect())
            },
            max_tokens: Some(request.max_tokens),
            temperature: Some(request.temperature),
        };

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
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

        let api_response: OpenAIResponse = response.json().await?;

        Ok(api_response.into())
    }
}

// OpenAI API types

#[derive(Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OpenAITool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Serialize, Deserialize, Clone)]
struct OpenAIMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OpenAIToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct OpenAIToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String,
    function: OpenAIFunctionCall,
}

#[derive(Serialize, Deserialize, Clone)]
struct OpenAIFunctionCall {
    name: String,
    arguments: String,
}

#[derive(Serialize)]
struct OpenAITool {
    #[serde(rename = "type")]
    tool_type: String,
    function: OpenAIFunction,
}

#[derive(Serialize)]
struct OpenAIFunction {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
    usage: OpenAIUsage,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIMessage,
    finish_reason: String,
}

#[derive(Deserialize)]
struct OpenAIUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
}

// Conversions

fn convert_message(msg: Message) -> Vec<OpenAIMessage> {
    let role = match msg.role {
        Role::User => "user",
        Role::Assistant => "assistant",
        Role::System => "system",
    };

    match msg.content {
        MessageContent::Text(text) => vec![OpenAIMessage {
            role: role.to_string(),
            content: Some(text),
            tool_calls: None,
            tool_call_id: None,
        }],
        MessageContent::Blocks(blocks) => {
            let mut messages = Vec::new();

            // Group tool results and other content
            let mut tool_calls: Vec<OpenAIToolCall> = Vec::new();
            let mut text_content = String::new();

            for block in blocks {
                match block {
                    ContentBlock::Text { text } => {
                        text_content.push_str(&text);
                    }
                    ContentBlock::ToolUse { id, name, input } => {
                        tool_calls.push(OpenAIToolCall {
                            id,
                            call_type: "function".to_string(),
                            function: OpenAIFunctionCall {
                                name,
                                arguments: serde_json::to_string(&input).unwrap_or_default(),
                            },
                        });
                    }
                    ContentBlock::ToolResult {
                        tool_use_id,
                        content,
                        ..
                    } => {
                        messages.push(OpenAIMessage {
                            role: "tool".to_string(),
                            content: Some(content),
                            tool_calls: None,
                            tool_call_id: Some(tool_use_id),
                        });
                    }
                }
            }

            // Add assistant message with tool calls if any
            if !tool_calls.is_empty() || !text_content.is_empty() {
                messages.insert(
                    0,
                    OpenAIMessage {
                        role: role.to_string(),
                        content: if text_content.is_empty() {
                            None
                        } else {
                            Some(text_content)
                        },
                        tool_calls: if tool_calls.is_empty() {
                            None
                        } else {
                            Some(tool_calls)
                        },
                        tool_call_id: None,
                    },
                );
            }

            messages
        }
    }
}

impl From<Tool> for OpenAITool {
    fn from(tool: Tool) -> Self {
        OpenAITool {
            tool_type: "function".to_string(),
            function: OpenAIFunction {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema,
            },
        }
    }
}

impl From<OpenAIResponse> for ChatResponse {
    fn from(resp: OpenAIResponse) -> Self {
        let choice = resp.choices.into_iter().next().unwrap();
        let mut content = Vec::new();

        if let Some(text) = choice.message.content {
            if !text.is_empty() {
                content.push(ContentBlock::Text { text });
            }
        }

        if let Some(tool_calls) = choice.message.tool_calls {
            for tc in tool_calls {
                let input: serde_json::Value =
                    serde_json::from_str(&tc.function.arguments).unwrap_or(serde_json::json!({}));
                content.push(ContentBlock::ToolUse {
                    id: tc.id,
                    name: tc.function.name,
                    input,
                });
            }
        }

        ChatResponse {
            content,
            stop_reason: match choice.finish_reason.as_str() {
                "stop" => StopReason::EndTurn,
                "tool_calls" => StopReason::ToolUse,
                "length" => StopReason::MaxTokens,
                _ => StopReason::EndTurn,
            },
            usage: Usage {
                input_tokens: resp.usage.prompt_tokens,
                output_tokens: resp.usage.completion_tokens,
            },
        }
    }
}
