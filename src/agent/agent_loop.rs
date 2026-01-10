use std::sync::Arc;
use tracing::{debug, info};

use crate::agent::prompt::build_system_prompt;
use crate::agent::tools::{get_tool_definitions, ToolExecutionResult};
use crate::error::{BashletError, Result};
use crate::providers::traits::{
    AIProvider, ChatRequest, ContentBlock, Message, MessageContent, Role, StopReason,
};
use crate::sandbox::{SandboxConfig, SandboxExecutor};

pub struct Agent {
    provider: Arc<dyn AIProvider>,
    executor: SandboxExecutor,
    max_iterations: u32,
    workdir: String,
}

impl Agent {
    pub async fn new(
        provider: Arc<dyn AIProvider>,
        config: SandboxConfig,
        max_iterations: u32,
    ) -> Result<Self> {
        let workdir = config.workdir.clone();
        let executor = SandboxExecutor::new(config).await?;

        Ok(Self {
            provider,
            executor,
            max_iterations,
            workdir,
        })
    }

    pub async fn run(&self, task: &str) -> Result<String> {
        info!(task = %task, "Starting agent run");

        let system_prompt = build_system_prompt(&self.workdir);
        let tools = get_tool_definitions();

        // Initialize conversation with user task
        let mut messages: Vec<Message> = vec![Message {
            role: Role::User,
            content: MessageContent::text(task),
        }];

        let mut iteration = 0;
        let final_response;

        loop {
            iteration += 1;

            if iteration > self.max_iterations {
                return Err(BashletError::MaxIterationsExceeded {
                    max: self.max_iterations,
                });
            }

            info!(iteration = iteration, "Agent iteration");

            // Send request to AI provider
            let request = ChatRequest {
                messages: messages.clone(),
                tools: tools.clone(),
                system_prompt: Some(system_prompt.clone()),
                max_tokens: 4096,
                temperature: 0.0,
            };

            let response = self.provider.chat(request).await?;

            debug!(
                stop_reason = ?response.stop_reason,
                content_blocks = response.content.len(),
                "Received response"
            );

            // Process response content
            let mut tool_calls = Vec::new();
            let mut text_response = String::new();

            for block in &response.content {
                match block {
                    ContentBlock::Text { text } => {
                        text_response.push_str(text);
                        // Print assistant's thoughts
                        println!("{}", text);
                    }
                    ContentBlock::ToolUse { id, name, input } => {
                        tool_calls.push((id.clone(), name.clone(), input.clone()));
                    }
                    _ => {}
                }
            }

            // Add assistant response to history
            messages.push(Message {
                role: Role::Assistant,
                content: MessageContent::Blocks(response.content.clone()),
            });

            // Check if we're done
            if response.stop_reason == StopReason::EndTurn && tool_calls.is_empty() {
                final_response = text_response;
                break;
            }

            // Execute tool calls
            if !tool_calls.is_empty() {
                let mut tool_results = Vec::new();

                for (id, name, input) in tool_calls {
                    info!(tool = %name, "Executing tool");

                    let result = self.execute_tool(&name, &input).await;

                    // Print tool output
                    if result.is_error {
                        println!("[{}] Error: {}", name, result.output);
                    } else {
                        let output_preview = if result.output.len() > 500 {
                            format!(
                                "{}... ({} bytes)",
                                &result.output[..500],
                                result.output.len()
                            )
                        } else {
                            result.output.clone()
                        };
                        println!("[{}] {}", name, output_preview);
                    }

                    tool_results.push(ContentBlock::ToolResult {
                        tool_use_id: id,
                        content: result.output,
                        is_error: result.is_error,
                    });
                }

                // Add tool results to conversation
                messages.push(Message {
                    role: Role::User,
                    content: MessageContent::Blocks(tool_results),
                });
            }
        }

        info!(iterations = iteration, "Agent completed");
        Ok(final_response)
    }

    async fn execute_tool(&self, name: &str, input: &serde_json::Value) -> ToolExecutionResult {
        match name {
            "execute_command" => {
                let command = input["command"].as_str().unwrap_or("");
                match self.executor.execute(command).await {
                    Ok(result) => {
                        let output = if result.stderr.is_empty() {
                            result.stdout
                        } else {
                            format!("stdout:\n{}\nstderr:\n{}", result.stdout, result.stderr)
                        };
                        ToolExecutionResult {
                            output: format!("Exit code: {}\n{}", result.exit_code, output),
                            is_error: result.exit_code != 0,
                        }
                    }
                    Err(e) => ToolExecutionResult {
                        output: format!("Execution error: {}", e),
                        is_error: true,
                    },
                }
            }
            "read_file" => {
                let path = input["path"].as_str().unwrap_or("");
                match self.executor.read_file(path).await {
                    Ok(content) => ToolExecutionResult {
                        output: content,
                        is_error: false,
                    },
                    Err(e) => ToolExecutionResult {
                        output: format!("Error reading file: {}", e),
                        is_error: true,
                    },
                }
            }
            "write_file" => {
                let path = input["path"].as_str().unwrap_or("");
                let content = input["content"].as_str().unwrap_or("");
                match self.executor.write_file(path, content).await {
                    Ok(_) => ToolExecutionResult {
                        output: format!("Successfully wrote {} bytes to {}", content.len(), path),
                        is_error: false,
                    },
                    Err(e) => ToolExecutionResult {
                        output: format!("Error writing file: {}", e),
                        is_error: true,
                    },
                }
            }
            "list_directory" => {
                let path = input["path"].as_str().unwrap_or(".");
                match self.executor.list_dir(path).await {
                    Ok(output) => ToolExecutionResult {
                        output,
                        is_error: false,
                    },
                    Err(e) => ToolExecutionResult {
                        output: format!("Error listing directory: {}", e),
                        is_error: true,
                    },
                }
            }
            _ => ToolExecutionResult {
                output: format!("Unknown tool: {}", name),
                is_error: true,
            },
        }
    }
}
