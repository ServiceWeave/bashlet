'use strict';

var zod = require('zod');

// src/schemas/zod.ts
var execSchema = zod.z.object({
  command: zod.z.string().describe("The shell command to execute in the sandbox"),
  workdir: zod.z.string().optional().describe("Working directory inside the sandbox (default: /workspace)")
});
var readFileSchema = zod.z.object({
  path: zod.z.string().describe("Absolute path to the file inside the sandbox")
});
var writeFileSchema = zod.z.object({
  path: zod.z.string().describe("Absolute path to the file inside the sandbox"),
  content: zod.z.string().describe("Content to write to the file")
});
var listDirSchema = zod.z.object({
  path: zod.z.string().describe("Absolute path to the directory inside the sandbox")
});

// src/tools/vercel.ts
function generateVercelTools(client) {
  return {
    bashlet_exec: {
      description: "Execute a shell command in a sandboxed bash environment. Returns stdout, stderr, and exit code. Use this for running shell commands, scripts, and system operations safely.",
      parameters: execSchema,
      execute: async ({ command, workdir }) => {
        const result = await client.exec(command, { workdir });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        };
      }
    },
    bashlet_read_file: {
      description: "Read the contents of a file from the sandboxed environment. Returns the file content as a string.",
      parameters: readFileSchema,
      execute: async ({ path }) => {
        const content = await client.readFile(path);
        return { content };
      }
    },
    bashlet_write_file: {
      description: "Write content to a file in the sandboxed environment. Creates the file if it doesn't exist, overwrites if it does.",
      parameters: writeFileSchema,
      execute: async ({ path, content }) => {
        await client.writeFile(path, content);
        return { success: true, path };
      }
    },
    bashlet_list_dir: {
      description: "List the contents of a directory in the sandboxed environment. Returns a detailed listing with file permissions, sizes, and names.",
      parameters: listDirSchema,
      execute: async ({ path }) => {
        const listing = await client.listDir(path);
        return { listing };
      }
    }
  };
}

exports.generateVercelTools = generateVercelTools;
//# sourceMappingURL=vercel.cjs.map
//# sourceMappingURL=vercel.cjs.map