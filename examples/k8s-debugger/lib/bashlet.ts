import { Bashlet } from "@bashlet/sdk";

/**
 * Create a Bashlet instance configured for Kubernetes debugging.
 *
 * This provides kubectl access within a sandboxed environment,
 * allowing the AI agent to safely run kubectl commands without
 * risk to the host system.
 *
 * Requirements:
 * - kubectl must be available in the host system PATH
 * - A valid kubeconfig at ~/.kube/config or KUBECONFIG env var
 *
 * The sandbox mounts kubectl and kubeconfig as read-only,
 * preventing any accidental modifications to cluster state.
 */
export function createK8sBashlet() {
  const home = process.env.HOME || "/root";
  const kubeconfigDir = process.env.KUBECONFIG
    ? process.env.KUBECONFIG.replace(/\/config$/, "")
    : `${home}/.kube`;

  return new Bashlet({
    // Mount kubeconfig for cluster access (read-only for safety)
    mounts: [
      {
        hostPath: kubeconfigDir,
        guestPath: "/root/.kube",
        readonly: true,
      },
    ],
    // Set environment variables for kubectl
    envVars: [
      { key: "KUBECONFIG", value: "/root/.kube/config" },
      { key: "HOME", value: "/root" },
    ],
    // Working directory inside sandbox
    workdir: "/root",
    // 60 second timeout for kubectl commands
    timeout: 60,
  });
}

/**
 * Example preset configuration for kubectl (add to bashlet config).
 *
 * ```toml
 * [presets.kubectl]
 * workdir = "/root"
 * env_vars = [["KUBECONFIG", "/root/.kube/config"], ["HOME", "/root"]]
 * mounts = [["~/.kube", "/root/.kube", true]]
 * ```
 */
