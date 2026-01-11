import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool } from "ai";
import { z } from "zod";
import { createK8sBashlet } from "@/lib/bashlet";

// Initialize bashlet client for kubectl access
const bashlet = createK8sBashlet();

// System prompt for the K8s debugging agent
const SYSTEM_PROMPT = `You are an expert Kubernetes debugging assistant. You have access to kubectl and other standard Kubernetes tools through a secure sandboxed environment.

Your capabilities:
- Run kubectl commands to inspect cluster state
- Check pod logs, events, and resource status
- Diagnose common issues like CrashLoopBackOff, ImagePullBackOff, pending pods
- Analyze resource configurations and suggest fixes
- Check node health and resource utilization

Debugging approach:
1. Start by understanding the user's issue
2. Gather relevant information using kubectl commands
3. Analyze the output systematically
4. Provide clear explanations of what you find
5. Suggest actionable fixes when issues are identified

Safety notes:
- You can only read cluster state (no write operations)
- The kubeconfig is mounted read-only
- All commands run in an isolated sandbox

Be concise but thorough. Show your work by explaining what each command reveals.`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: SYSTEM_PROMPT,
    messages,
    maxSteps: 10,
    tools: {
      // Execute kubectl and other shell commands
      kubectl: tool({
        description:
          "Execute a shell command in the sandboxed environment. " +
          "Use this for kubectl commands, grep, jq, and other CLI tools. " +
          "Examples: 'kubectl get pods -A', 'kubectl describe pod my-pod -n default'",
        parameters: z.object({
          command: z
            .string()
            .describe("The shell command to execute (e.g., 'kubectl get pods')"),
          workdir: z
            .string()
            .optional()
            .describe("Working directory for the command"),
        }),
        execute: async ({ command, workdir }) => {
          const result = await bashlet.exec(command, { workdir });
          return {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
          };
        },
      }),

      // Read configuration files
      read_file: tool({
        description:
          "Read a file from the sandboxed environment. " +
          "Useful for reading manifests, configs, or output files.",
        parameters: z.object({
          path: z.string().describe("Path to the file to read"),
        }),
        execute: async ({ path }) => {
          const content = await bashlet.readFile(path);
          return { content };
        },
      }),

      // List directory contents
      list_dir: tool({
        description:
          "List contents of a directory in the sandboxed environment.",
        parameters: z.object({
          path: z.string().describe("Path to the directory to list"),
        }),
        execute: async ({ path }) => {
          const listing = await bashlet.listDir(path);
          return { listing };
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
