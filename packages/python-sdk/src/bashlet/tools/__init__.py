"""Tool generators for various AI agent frameworks."""

from .generic import GenericTool, create_async_generic_tools, create_generic_tools

__all__ = [
    "GenericTool",
    "create_generic_tools",
    "create_async_generic_tools",
]

# Conditionally export framework-specific tools
try:
    from .langchain import (
        BashletLangChainTools,
        create_async_langchain_tools,
        create_langchain_tools,
    )

    __all__.extend([
        "BashletLangChainTools",
        "create_langchain_tools",
        "create_async_langchain_tools",
    ])
except ImportError:
    pass

try:
    from .openai import (
        OpenAIToolHandler,
        create_async_openai_tools,
        create_openai_tools,
    )

    __all__.extend([
        "OpenAIToolHandler",
        "create_openai_tools",
        "create_async_openai_tools",
    ])
except ImportError:
    pass

try:
    from .anthropic import (
        AnthropicToolHandler,
        create_anthropic_tools,
        create_async_anthropic_tools,
    )

    __all__.extend([
        "AnthropicToolHandler",
        "create_anthropic_tools",
        "create_async_anthropic_tools",
    ])
except ImportError:
    pass

try:
    from .mcp import (
        MCPToolHandler,
        create_async_mcp_tools,
        create_mcp_tools,
    )

    __all__.extend([
        "MCPToolHandler",
        "create_mcp_tools",
        "create_async_mcp_tools",
    ])
except ImportError:
    pass
