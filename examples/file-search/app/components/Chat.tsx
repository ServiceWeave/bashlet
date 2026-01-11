"use client";

import { useChat } from "ai/react";
import { useState, useRef, useEffect } from "react";

interface ToolInvocation {
  toolName: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
}

const TOOL_ICONS: Record<string, string> = {
  find_files: "🔍",
  search_content: "📝",
  read_file: "📄",
  list_directory: "📁",
  file_info: "ℹ️",
  shell: "💻",
};

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: "/api/chat",
    });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getToolSummary = (toolName: string, args: Record<string, unknown>): string => {
    switch (toolName) {
      case "find_files":
        return `pattern: ${args.pattern}`;
      case "search_content":
        return `"${args.pattern}" in ${args.filePattern || "all files"}`;
      case "read_file":
        return String(args.path).split("/").pop() || String(args.path);
      case "list_directory":
        return String(args.path || "/data");
      case "file_info":
        return String(args.path).split("/").pop() || String(args.path);
      case "shell":
        return String(args.command).slice(0, 40) + (String(args.command).length > 40 ? "..." : "");
      default:
        return "";
    }
  };

  const renderToolInvocation = (
    toolInvocation: ToolInvocation,
    index: number,
    messageId: string
  ) => {
    const id = `${messageId}-${index}`;
    const isExpanded = expandedTools.has(id);
    const { toolName, args, result } = toolInvocation;
    const icon = TOOL_ICONS[toolName] || "🔧";

    return (
      <div
        key={id}
        className="my-2 border border-gray-700 rounded-lg overflow-hidden"
      >
        <button
          onClick={() => toggleTool(id)}
          className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-750 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <span>{icon}</span>
            <span className="text-emerald-400 font-mono text-sm">{toolName}</span>
            <code className="text-gray-400 text-xs truncate max-w-md">
              {getToolSummary(toolName, args)}
            </code>
          </div>
          <span className="text-gray-500 text-sm">
            {isExpanded ? "▼" : "▶"}
          </span>
        </button>

        {isExpanded && (
          <div className="p-3 bg-gray-900 text-sm">
            <div className="mb-2">
              <span className="text-gray-500 text-xs uppercase">Input:</span>
              <pre className="mt-1 text-gray-300 overflow-x-auto">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
            {result && (
              <div>
                <span className="text-gray-500 text-xs uppercase">Output:</span>
                <pre className="mt-1 text-gray-300 overflow-x-auto max-h-96">
                  {typeof result === "object"
                    ? JSON.stringify(result, null, 2)
                    : String(result)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* Header */}
      <header className="flex-none p-4 border-b border-gray-800">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <span className="text-2xl">🔍</span>
          File Search
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          AI-powered file search and retrieval assistant
        </p>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg mb-4">Welcome to File Search</p>
            <div className="text-sm space-y-2 max-w-md mx-auto text-left">
              <p>Try asking questions like:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>Find all TypeScript files in the project</li>
                <li>Search for &quot;TODO&quot; comments in the codebase</li>
                <li>What does the config file contain?</li>
                <li>Show me all functions that handle errors</li>
                <li>Summarize the README file</li>
                <li>Find files modified recently</li>
              </ul>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 ${
                message.role === "user"
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-800 text-gray-100"
              }`}
            >
              {/* Tool invocations */}
              {message.toolInvocations?.map((toolInvocation, index) =>
                renderToolInvocation(
                  toolInvocation as ToolInvocation,
                  index,
                  message.id
                )
              )}

              {/* Message content */}
              {message.content && (
                <div className="whitespace-pre-wrap">{message.content}</div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-lg px-4 py-3 text-gray-400">
              <span className="animate-pulse">Searching...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg px-4 py-3 text-red-300">
            Error: {error.message}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex-none p-4 border-t border-gray-800"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about your files..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors"
          >
            Search
          </button>
        </div>
      </form>
    </div>
  );
}
