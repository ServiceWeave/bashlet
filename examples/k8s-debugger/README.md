# K8s Debugger

An AI-powered Kubernetes debugging chatbot built with:

- **Bashlet** - Sandboxed bash execution for safe kubectl access
- **Vercel AI SDK** - Streaming chat with tool calling
- **GPT-4o** - OpenAI's AI model for intelligent debugging
- **Next.js 15** - React framework with App Router

## How It Works

The AI agent has access to kubectl through Bashlet's sandboxed environment. When you describe a Kubernetes issue, the agent:

1. Runs kubectl commands to gather cluster state
2. Analyzes logs, events, and resource configurations
3. Identifies the root cause
4. Suggests actionable fixes

All commands run in an isolated sandbox with read-only access to your kubeconfig.

## Prerequisites

- Node.js 18+
- [Bashlet](https://github.com/anthropics/bashlet) installed and in PATH
- kubectl configured with cluster access (`~/.kube/config`)
- OpenAI API key

## Setup

1. Install dependencies:

```bash
cd examples/k8s-debugger
npm install
```

2. Set your OpenAI API key:

```bash
export OPENAI_API_KEY=sk-...
```

3. Start the development server:

```bash
npm run dev
```

4. Open http://localhost:3000

## Example Queries

- "Why are my pods not starting in the default namespace?"
- "Show me all pods that are failing health checks"
- "What's causing the OOMKilled restarts in my deployment?"
- "Check the logs for pod nginx-abc123"
- "Which nodes have the most resource pressure?"
- "Debug why my service can't reach the backend pods"

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js Frontend                      │
│                   (React + Tailwind)                     │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP/Streaming
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  API Route (/api/chat)                   │
│                                                          │
│  ┌─────────────┐    ┌────────────┐    ┌──────────────┐  │
│  │ Vercel AI   │───▶│   GPT-4o   │───▶│   Bashlet    │  │
│  │    SDK      │◀───│  (Tools)   │◀───│   (kubectl)  │  │
│  └─────────────┘    └────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │    Sandbox       │
                                    │  ┌────────────┐  │
                                    │  │  kubectl   │  │
                                    │  │  (r/o)     │  │
                                    │  └────────────┘  │
                                    │  ┌────────────┐  │
                                    │  │ kubeconfig │  │
                                    │  │  (r/o)     │  │
                                    │  └────────────┘  │
                                    └──────────────────┘
```

## SDK Integration

The example uses the Bashlet TypeScript SDK with Vercel AI SDK tools:

```typescript
import { Bashlet } from "@bashlet/sdk";
import { streamText, tool } from "ai";
import { z } from "zod";

const bashlet = new Bashlet({
  mounts: [
    { hostPath: "~/.kube", guestPath: "/root/.kube", readonly: true },
  ],
  envVars: [
    { key: "KUBECONFIG", value: "/root/.kube/config" },
  ],
  timeout: 60,
});

// Use with Vercel AI SDK
const result = streamText({
  model: openai("gpt-4o"),
  tools: {
    kubectl: tool({
      description: "Execute kubectl commands",
      parameters: z.object({
        command: z.string(),
      }),
      execute: async ({ command }) => {
        return await bashlet.exec(command);
      },
    }),
  },
  messages,
});
```

## Security

- **Read-only mounts**: Kubeconfig is mounted read-only
- **Sandboxed execution**: All commands run in isolation
- **No cluster modifications**: The agent can only inspect, not modify
- **Timeout limits**: Commands timeout after 60 seconds

## Customization

### Using a preset

Add a kubectl preset to your bashlet config (`~/.config/bashlet/config.toml`):

```toml
[presets.kubectl]
workdir = "/root"
env_vars = [["KUBECONFIG", "/root/.kube/config"], ["HOME", "/root"]]
mounts = [["~/.kube", "/root/.kube", true]]
```

Then use it in the SDK:

```typescript
const bashlet = new Bashlet({ preset: "kubectl" });
```

### Custom tools

Extend the agent with additional tools:

```typescript
tools: {
  kubectl: tool({ ... }),

  // Add Helm support
  helm: tool({
    description: "Run helm commands",
    parameters: z.object({ command: z.string() }),
    execute: async ({ command }) => {
      return await bashlet.exec(`helm ${command}`);
    },
  }),

  // Add k9s-style resource browser
  browse_resources: tool({
    description: "List all resources in a namespace",
    parameters: z.object({ namespace: z.string() }),
    execute: async ({ namespace }) => {
      const result = await bashlet.exec(
        `kubectl api-resources --verbs=list -o name | xargs -I {} kubectl get {} -n ${namespace} --ignore-not-found`
      );
      return result;
    },
  }),
}
```

## Troubleshooting

### "Binary not found" error

Ensure bashlet is installed and in your PATH:

```bash
bashlet --version
```

### "Permission denied" for kubeconfig

Check that your kubeconfig is readable:

```bash
ls -la ~/.kube/config
```

### Commands timing out

Increase the timeout in `lib/bashlet.ts`:

```typescript
timeout: 120, // 2 minutes
```

## License

MIT
